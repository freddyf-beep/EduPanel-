"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Layers, Loader2, ArrowRight, BookOpen, Calendar, GanttChart, Search,
  Filter, Plus, ChevronRight, Sparkles, Target, Hash, Activity, GraduationCap,
  CalendarDays, ListChecks, AlertCircle, TrendingUp, ChevronLeft, BarChart3,
  Check, Zap, Pin, Users, Eye, Clock, Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { cargarCronogramaUnidad, cargarPlanCurso, listarPlanesCurso, type ClaseCronograma, type PlanificacionCurso, type UnidadPlan } from "@/lib/curriculo"
import { cargarHorarioSemanal, esTipoLibre } from "@/lib/horario"
import { UNIT_COLORS, buildUrl, unidadIdFromIndex, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DriveSheet } from "@/components/edu-panel/drive/drive-sheet"
import { DriveWorkspaceActions } from "@/components/edu-panel/drive/drive-workspace-actions"
import { RecomendadorSemanticoModal } from "./recomendador-semantico-modal"
import { getFeatureFlags } from "@/lib/feature-flags"

type VistaKey = "timeline" | "cursos" | "calendario" | "insights"
const VISTAS: { key: VistaKey; label: string; icon: typeof Layers; key_short: string }[] = [
  { key: "timeline",   label: "Timeline anual", icon: GanttChart,    key_short: "T" },
  { key: "cursos",     label: "Cursos",         icon: GraduationCap, key_short: "C" },
  { key: "calendario", label: "Calendario",     icon: CalendarDays,  key_short: "K" },
  { key: "insights",   label: "Insights",       icon: BarChart3,     key_short: "I" },
]

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const MESES_CORTO = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

interface UnidadConCurso extends UnidadPlan {
  curso: string
  cursoColor: string
  asignatura: string
}

interface CursoInfo {
  curso: string
  color: string
  unidades: UnidadPlan[]
  totalHoras: number
  cobertura: number // % de unidades con fechas
}

function parseISO(s: string | undefined): Date | null {
  if (!s) return null
  const [y, m, d] = s.split("-").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

function parseDDMMYYYY(s: string | undefined): Date | null {
  if (!s) return null
  const match = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!match) return null
  const date = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
  return Number.isNaN(date.getTime()) ? null : date
}

function toInputDate(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function rangoDesdeCronograma(cronograma: { clases?: ClaseCronograma[] } | null | undefined): { start: string; end: string } | null {
  const fechas = (cronograma?.clases || [])
    .map(clase => parseDDMMYYYY(clase.fecha))
    .filter((date): date is Date => !!date)
    .sort((a, b) => a.getTime() - b.getTime())
  if (!fechas.length) return null
  return { start: toInputDate(fechas[0]), end: toInputDate(fechas[fechas.length - 1]) }
}

async function cargarCronogramaUnidadConFallback(asignatura: string, curso: string, unidad: UnidadPlan, index: number) {
  const ids = [
    String(unidad.id),
    unidad.id ? `unidad_${unidad.id}` : null,
    unidad.unidadCurricularId,
    unidadIdFromIndex(index),
  ].filter(Boolean) as string[]
  for (const id of Array.from(new Set(ids))) {
    const cronograma = await cargarCronogramaUnidad(asignatura, curso, id).catch(() => null)
    if (cronograma?.clases?.some(clase => clase.fecha?.trim())) return cronograma
  }
  return null
}

function rangoDeMes(fecha: Date): { ini: Date; fin: Date } {
  return {
    ini: new Date(fecha.getFullYear(), fecha.getMonth(), 1),
    fin: new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0),
  }
}

function dentroDeRango(unidad: UnidadPlan, fechaIni: Date, fechaFin: Date): boolean {
  const ini = parseISO(unidad.start)
  const fin = parseISO(unidad.end)
  if (!ini || !fin) return false
  return !(fin < fechaIni || ini > fechaFin)
}

function diasEntre(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function estadoUnidad(u: UnidadPlan, hoy: Date): "futura" | "actual" | "pasada" | "incompleta" {
  const ini = parseISO(u.start)
  const fin = parseISO(u.end)
  if (!ini || !fin) return "incompleta"
  if (hoy < ini) return "futura"
  if (hoy > fin) return "pasada"
  return "actual"
}

const ESTADO_META: Record<"futura" | "actual" | "pasada" | "incompleta", { label: string; cls: string; icon: typeof Clock }> = {
  futura:     { label: "Próxima",    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-300", icon: Clock },
  actual:     { label: "En curso",   cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300", icon: Activity },
  pasada:     { label: "Cerrada",    cls: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300 border-slate-300", icon: Check },
  incompleta: { label: "Sin fechas", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300", icon: AlertCircle },
}

const TIPO_META: Record<UnidadPlan["type"], { label: string; cls: string }> = {
  tradicional: { label: "Tradicional", cls: "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-200" },
  invertida:   { label: "Invertida",   cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-200" },
  proyecto:    { label: "Proyecto",    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200" },
  unidad0:     { label: "Unidad 0",    cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200" },
}

export function PlanificacionesList() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const vistaParam = (searchParams.get("vista") as VistaKey | null)
  const [vista, setVista] = useState<VistaKey>(vistaParam ?? "timeline")

  const [cursos, setCursos] = useState<CursoInfo[]>([])
  const [todasUnidades, setTodasUnidades] = useState<UnidadConCurso[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [filtroCurso, setFiltroCurso] = useState<string[]>([])
  const [filtroEstado, setFiltroEstado] = useState<string[]>([])
  const [mesActual, setMesActual] = useState(new Date())
  const [showRecomendador, setShowRecomendador] = useState(false)
  const [featureFlags, setFeatureFlags] = useState<Record<string, any>>({})

  useEffect(() => {
    getFeatureFlags().then(setFeatureFlags).catch(console.error)
  }, [])

  useEffect(() => { setVista(vistaParam ?? "timeline") }, [vistaParam])

  const goToVista = useCallback((v: VistaKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("vista", v)
    router.replace(`/planificaciones?${params.toString()}`, { scroll: false })
    setVista(v)
  }, [router, searchParams])

  // Carga datos
  useEffect(() => {
    let cancel = false
    async function cargar() {
      setLoading(true)
      try {
        const horario = await cargarHorarioSemanal()
        const cursosColor = new Map<string, string>()
        horario.filter(h => !esTipoLibre(h.tipo)).forEach(h => {
          if (!cursosColor.has(h.resumen.trim())) {
            cursosColor.set(h.resumen.trim(), h.color)
          }
        })
        const cursosHorario = Array.from(cursosColor.keys()).filter(Boolean)
        const planesGuardados = await listarPlanesCurso(ASIGNATURA).catch(() => [] as PlanificacionCurso[])
        const cursosPorPlan = planesGuardados.map(plan => plan.curso).filter(Boolean)
        const cursosUnique = Array.from(new Set([...cursosHorario, ...cursosPorPlan]))

        const planes = await Promise.all(
          cursosUnique.map(c => {
            const cached = planesGuardados.find(plan => plan.curso === c)
            if (cached) return Promise.resolve({ curso: c, plan: cached })
            return cargarPlanCurso(ASIGNATURA, c).then(p => ({ curso: c, plan: p })).catch(() => ({ curso: c, plan: null as PlanificacionCurso | null }))
          })
        )

        if (cancel) return

        const cursosArr: CursoInfo[] = []
        const unidadesAll: UnidadConCurso[] = []
        for (const { curso, plan } of planes) {
          const color = cursosColor.get(curso) || "var(--primary)"
          const baseUnits = plan?.units || []
          const units = await Promise.all(baseUnits.map(async (unit, idx) => {
            if (unit.start && unit.end) return unit
            const cronograma = await cargarCronogramaUnidadConFallback(ASIGNATURA, curso, unit, idx)
            const rango = rangoDesdeCronograma(cronograma)
            if (!rango) return unit
            return {
              ...unit,
              start: unit.start || rango.start,
              end: unit.end || rango.end,
            }
          }))
          const completas = units.filter(u => u.start && u.end).length
          const totalHoras = units.reduce((s, u) => s + (u.hours || 0), 0)
          const cobertura = units.length > 0 ? Math.round((completas / units.length) * 100) : 0
          cursosArr.push({ curso, color, unidades: units, totalHoras, cobertura })
          units.forEach(u => unidadesAll.push({ ...u, curso, cursoColor: color, asignatura: ASIGNATURA }))
        }

        setCursos(cursosArr)
        setTodasUnidades(unidadesAll)
      } catch (err) {
        console.error("Error cargando planificaciones v3", err)
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    cargar()
    return () => { cancel = true }
  }, [ASIGNATURA])

  // Atajos: T/C/K/I
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      const v = VISTAS.find(view => view.key_short.toLowerCase() === e.key.toLowerCase())
      if (v) {
        e.preventDefault()
        goToVista(v.key)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goToVista])

  // Filtrado
  const unidadesFiltradas = useMemo(() => {
    const hoy = new Date()
    return todasUnidades.filter(u => {
      if (search.trim()) {
        const s = search.trim().toLowerCase()
        if (!u.name.toLowerCase().includes(s) && !u.curso.toLowerCase().includes(s)) return false
      }
      if (filtroCurso.length > 0 && !filtroCurso.includes(u.curso)) return false
      if (filtroEstado.length > 0) {
        const est = estadoUnidad(u, hoy)
        if (!filtroEstado.includes(est)) return false
      }
      return true
    })
  }, [todasUnidades, search, filtroCurso, filtroEstado])

  // Stats globales
  const stats = useMemo(() => {
    const hoy = new Date()
    const total = todasUnidades.length
    const conFechas = todasUnidades.filter(u => u.start && u.end).length
    const enCurso = todasUnidades.filter(u => estadoUnidad(u, hoy) === "actual").length
    const proximas = todasUnidades.filter(u => estadoUnidad(u, hoy) === "futura").length
    const incompletas = todasUnidades.filter(u => estadoUnidad(u, hoy) === "incompleta").length
    const cobertura = total > 0 ? Math.round((conFechas / total) * 100) : 0
    const totalHoras = todasUnidades.reduce((s, u) => s + (u.hours || 0), 0)
    return { total, conFechas, enCurso, proximas, incompletas, cobertura, totalHoras }
  }, [todasUnidades])

  return (
    <div className="mx-auto max-w-[1500px] px-3 sm:px-5 pb-10">
      {/* Hero */}
      <div className="mb-5 grid gap-3 lg:grid-cols-[1.5fr_1fr]">
        <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-primary via-rose-500 to-fuchsia-500 px-6 py-6 text-white">
          <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-[11px] font-bold opacity-90 inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> MIS PLANIFICACIONES · V3 BETA
            </div>
            <h1 className="mt-1 text-[22px] sm:text-[26px] font-extrabold leading-tight">
              {ASIGNATURA} · {cursos.length} curso{cursos.length === 1 ? "" : "s"}
            </h1>
            <p className="mt-1 text-[12.5px] text-white/85">
              Vista global de tus unidades didácticas: timeline anual, calendario de hitos y métricas en tiempo real.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <DriveSheet
                context={{ tipo: "planificaciones", asignatura: ASIGNATURA }}
                title="Drive de planificaciones"
                description="Tu Drive personal para revisar carpetas y documentos sin salir de EduPanel."
                label="Drive"
                buttonClassName="border-white/20 bg-white/15 text-white hover:border-white/50 hover:bg-white/25 hover:text-white"
              />
              <DriveWorkspaceActions
                context={{ tipo: "planificaciones", asignatura: ASIGNATURA }}
                compact
                setupLabel="Crear carpeta"
                openLabel="Abrir carpeta"
                buttonClassName="border-white/20 bg-white/15 text-white hover:border-white/50 hover:bg-white/25 hover:text-white"
              />
              {featureFlags["recomendador-semantico"]?.active && (
                <button
                  onClick={() => setShowRecomendador(true)}
                  className="rounded-[10px] border border-white/20 bg-white/15 hover:border-white/50 hover:bg-white/25 text-white font-bold px-3 py-1.5 text-xs transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-200 animate-pulse" />
                  Asistente IA
                </button>
              )}
              <div className="relative ml-auto">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/70" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar unidad o curso…"
                  className="w-56 rounded-[10px] bg-white/15 pl-8 pr-3 py-1.5 text-[12.5px] font-semibold text-white placeholder-white/60 backdrop-blur outline-none focus:ring-2 focus:ring-white/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2.5">
          <KpiBox label="Total unidades" value={stats.total.toString()} sub={`${stats.totalHoras}h totales`} variant="ok" />
          <KpiBox label="En curso" value={stats.enCurso.toString()} sub="ahora" variant={stats.enCurso > 0 ? "ok" : "muted"} />
          <KpiBox label="Próximas" value={stats.proximas.toString()} sub="planificadas" variant="info" />
          <KpiBox label="Cobertura" value={`${stats.cobertura}%`} sub="con fechas" variant={stats.cobertura >= 80 ? "ok" : stats.cobertura >= 50 ? "ambar" : "rojo"} />
          <KpiBox label="Sin fechas" value={stats.incompletas.toString()} sub="por completar" variant={stats.incompletas === 0 ? "ok" : "ambar"} />
          <KpiBox label="Cursos" value={cursos.length.toString()} sub="activos" variant="ok" />
        </div>
      </div>

      {/* Filtros sticky */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-card p-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-semibold hover:border-primary">
              <Filter className="h-3 w-3" />
              Curso {filtroCurso.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-1">{filtroCurso.length}</Badge>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">Cursos</span>
              {filtroCurso.length > 0 && (
                <button onClick={() => setFiltroCurso([])} className="text-[10.5px] text-muted-foreground hover:text-foreground">limpiar</button>
              )}
            </div>
            <ul className="space-y-0.5 max-h-60 overflow-y-auto">
              {cursos.map((c, index) => (
                <li key={`${c.curso}-${index}`}>
                  <button
                    onClick={() => setFiltroCurso(prev => prev.includes(c.curso) ? prev.filter(x => x !== c.curso) : [...prev, c.curso])}
                    className="w-full text-left rounded-md px-2 py-1 text-[12px] hover:bg-muted/50 flex items-center gap-2"
                  >
                    <span className={cn("inline-flex h-3 w-3 items-center justify-center rounded border", filtroCurso.includes(c.curso) ? "bg-primary border-primary text-white" : "border-border")}>
                      {filtroCurso.includes(c.curso) && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: c.color }} />
                    <span className="truncate">{c.curso}</span>
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-semibold hover:border-primary">
              <Activity className="h-3 w-3" />
              Estado {filtroEstado.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-1">{filtroEstado.length}</Badge>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" align="start">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">Estado</span>
              {filtroEstado.length > 0 && (
                <button onClick={() => setFiltroEstado([])} className="text-[10.5px] text-muted-foreground hover:text-foreground">limpiar</button>
              )}
            </div>
            <ul className="space-y-0.5">
              {(["futura", "actual", "pasada", "incompleta"] as const).map(e => (
                <li key={e}>
                  <button
                    onClick={() => setFiltroEstado(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e])}
                    className="w-full text-left rounded-md px-2 py-1 text-[12px] hover:bg-muted/50 flex items-center gap-2"
                  >
                    <span className={cn("inline-flex h-3 w-3 items-center justify-center rounded border", filtroEstado.includes(e) ? "bg-primary border-primary text-white" : "border-border")}>
                      {filtroEstado.includes(e) && <Check className="h-2.5 w-2.5" />}
                    </span>
                    {ESTADO_META[e].label}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        {(filtroCurso.length > 0 || filtroEstado.length > 0 || search) && (
          <button
            onClick={() => { setFiltroCurso([]); setFiltroEstado([]); setSearch("") }}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:border-primary"
          >
            <Wand2 className="h-3 w-3" /> Limpiar filtros
          </button>
        )}

        <span className="ml-auto text-[10.5px] text-muted-foreground">
          {unidadesFiltradas.length}/{stats.total} unidades visibles · atajos <kbd className="rounded bg-muted px-1">T</kbd>/<kbd className="rounded bg-muted px-1">C</kbd>/<kbd className="rounded bg-muted px-1">K</kbd>/<kbd className="rounded bg-muted px-1">I</kbd>
        </span>
      </div>

      {/* Switch vistas */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 bg-background/85 px-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
          {VISTAS.map(v => {
            const Icon = v.icon
            const isActive = vista === v.key
            return (
              <button
                key={v.key}
                onClick={() => goToVista(v.key)}
                className={`inline-flex items-center gap-1.5 rounded-t-[10px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                  isActive
                    ? "bg-pink-light text-primary border-b-2 border-primary -mb-px"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando planificaciones…
        </div>
      ) : cursos.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border bg-card p-10 text-center">
          <GraduationCap className="mx-auto h-10 w-10 text-muted-foreground" />
          <h3 className="mt-3 text-[14px] font-extrabold">Sin cursos aún</h3>
          <p className="mt-1 text-[12px] text-muted-foreground max-w-md mx-auto">
            Configura tu horario en <Link href="/perfil" className="underline">Mi Perfil</Link> con bloques tipo "clase" para que aparezcan aquí.
          </p>
        </div>
      ) : (
        <>
          {vista === "timeline" && (
            <TimelineView unidades={unidadesFiltradas} cursos={cursos} asignatura={ASIGNATURA} />
          )}
          {vista === "cursos" && (
            <CursosGrid cursos={cursos} asignatura={ASIGNATURA} />
          )}
          {vista === "calendario" && (
            <CalendarioView mes={mesActual} setMes={setMesActual} unidades={unidadesFiltradas} asignatura={ASIGNATURA} />
          )}
          {vista === "insights" && (
            <InsightsView cursos={cursos} unidades={todasUnidades} stats={stats} />
          )}
        </>
      )}

      {/* Recomendador Semántico (Premium) */}
      <RecomendadorSemanticoModal
        isOpen={showRecomendador}
        onClose={() => setShowRecomendador(false)}
        curso={cursos[0]?.curso || ""}
        asignatura={ASIGNATURA}
      />
    </div>
  )
}

function KpiBox({ label, value, sub, variant }: { label: string; value: string; sub: string; variant: "ok" | "ambar" | "rojo" | "info" | "muted" }) {
  const cls =
    variant === "rojo"  ? "border-rose-300 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30" :
    variant === "ambar" ? "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30" :
    variant === "info"  ? "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30" :
    variant === "muted" ? "border-border bg-muted/30" :
                          "border-border bg-card"
  return (
    <div className={cn("rounded-[12px] border p-2.5", cls)}>
      <div className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold leading-none">{value}</div>
      <div className="text-[9.5px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  )
}

// ─── Vista Timeline anual ─────────────────────────────────────────────────────
function TimelineView({ unidades, cursos, asignatura }: { unidades: UnidadConCurso[]; cursos: CursoInfo[]; asignatura: string }) {
  const hoy = new Date()
  const yearActual = hoy.getFullYear()

  // Año académico chileno: marzo (3) → diciembre (12) + enero/febrero
  const inicioAnio = new Date(yearActual, 2, 1) // marzo
  const finAnio = new Date(yearActual, 11, 31)  // diciembre

  // Para cada curso, mostrar sus unidades como barras horizontales
  const cursosArr = useMemo(() => {
    const map = new Map<string, UnidadConCurso[]>()
    cursos.forEach(c => map.set(c.curso, []))
    unidades.forEach(u => {
      const arr = map.get(u.curso) || []
      arr.push(u)
      map.set(u.curso, arr)
    })
    return cursos.map(c => ({ ...c, unidadesFiltradas: map.get(c.curso) || [] })).filter(c => c.unidadesFiltradas.length > 0)
  }, [unidades, cursos])

  const hoyOffset = ((hoy.getTime() - inicioAnio.getTime()) / (finAnio.getTime() - inicioAnio.getTime())) * 100

  return (
    <div className="rounded-[14px] border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-extrabold inline-flex items-center gap-2">
          <GanttChart className="h-4 w-4 text-primary" /> Timeline {yearActual}
        </h2>
        <Badge variant="outline" className="text-[10.5px]">Año académico Mar–Dic</Badge>
      </div>

      {/* Header con meses */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-32 flex-shrink-0" />
        <div className="flex-1 grid grid-cols-10 relative">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="text-center text-[9.5px] font-bold text-muted-foreground border-l border-border first:border-l-0 py-0.5">
              {MESES_CORTO[i + 2]}
            </div>
          ))}
          {/* línea de "hoy" */}
          {hoy >= inicioAnio && hoy <= finAnio && (
            <div className="absolute top-0 bottom-0 w-0.5 bg-primary z-10" style={{ left: `${hoyOffset}%` }}>
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[8px] font-bold text-primary bg-card px-1 rounded">HOY</span>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {cursosArr.map((c, cursoIndex) => (
          <div key={`${c.curso}-${cursoIndex}`}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-32 flex-shrink-0 inline-flex items-center gap-1.5 truncate text-[11.5px] font-bold">
                <span className="inline-block h-3 w-3 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                <Link href={buildUrl("/planificaciones", withAsignatura({ curso: c.curso }, asignatura))} className="truncate hover:underline hover:text-primary">
                  {c.curso}
                </Link>
                <Badge variant="outline" className="text-[8.5px] h-4 px-1 ml-auto">{c.unidadesFiltradas.length}u</Badge>
              </div>
              <div className="flex-1 relative h-9 bg-muted/20 rounded-[6px] border border-border overflow-hidden">
                {/* línea hoy */}
                {hoy >= inicioAnio && hoy <= finAnio && (
                  <div className="absolute top-0 bottom-0 w-0.5 bg-primary/40 z-10" style={{ left: `${hoyOffset}%` }} />
                )}
                {/* unidades */}
                {c.unidadesFiltradas.map((u, idx) => {
                  const ini = parseISO(u.start)
                  const fin = parseISO(u.end)
                  if (!ini || !fin) {
                    return (
                      <div
                        key={`${u.curso}-${u.id}-${idx}-sin-fechas`}
                        className="absolute inset-y-1 px-1 rounded-[4px] border-2 border-dashed bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 flex items-center text-[8.5px] font-bold"
                        style={{ left: `${(idx / Math.max(1, c.unidadesFiltradas.length)) * 100}%`, width: "8%", borderColor: "var(--status-amber-border)" }}
                        title={`${u.name} — sin fechas`}
                      >
                        ?
                      </div>
                    )
                  }
                  const startPct = Math.max(0, ((ini.getTime() - inicioAnio.getTime()) / (finAnio.getTime() - inicioAnio.getTime())) * 100)
                  const widthPct = Math.max(2, ((fin.getTime() - ini.getTime()) / (finAnio.getTime() - inicioAnio.getTime())) * 100)
                  const color = u.color || UNIT_COLORS[idx % UNIT_COLORS.length]
                  return (
                    <div
                      key={`${u.curso}-${u.id}-${idx}`}
                      className="absolute inset-y-1 rounded-[4px] flex items-center px-1.5 text-white text-[9px] font-bold truncate shadow-sm"
                      style={{ left: `${startPct}%`, width: `${widthPct}%`, background: color }}
                      title={`${u.name}\n${u.start} → ${u.end}\n${u.hours}h\n${TIPO_META[u.type].label}`}
                    >
                      {u.name}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
        {cursosArr.length === 0 && (
          <p className="text-[12px] text-muted-foreground italic text-center py-4">
            Sin unidades en estos filtros.
          </p>
        )}
      </div>

      {/* Leyenda */}
      <div className="mt-5 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-primary" /> Hoy</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm border-2 border-dashed border-amber-400" /> Sin fechas</span>
        <span>Hover sobre una unidad para ver fechas y horas.</span>
      </div>
    </div>
  )
}

// ─── Vista Cursos (grid mejorado) ─────────────────────────────────────────────
function CursosGrid({ cursos, asignatura }: { cursos: CursoInfo[]; asignatura: string }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {cursos.map((c, i) => {
        const hoy = new Date()
        const enCurso = c.unidades.filter(u => estadoUnidad(u, hoy) === "actual")
        const proximas = c.unidades.filter(u => estadoUnidad(u, hoy) === "futura")
        return (
          <Link
            key={`${c.curso}-${i}`}
            href={buildUrl("/planificaciones", withAsignatura({ curso: c.curso }, asignatura))}
            className="group rounded-[14px] border border-border bg-card p-4 hover:-translate-y-0.5 hover:shadow-md hover:border-primary transition-all"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[12px] text-white font-bold text-[12px] shadow-sm" style={{ background: c.color }}>
                {c.curso.split(" ").map(s => s[0]).join("").slice(0, 3).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-[13.5px] font-extrabold group-hover:text-primary transition-colors truncate">{c.curso}</h3>
                <p className="text-[11px] text-muted-foreground truncate">{asignatura}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-muted-foreground">Unidades</span>
                <span className="font-extrabold">{c.unidades.length}</span>
              </div>
              <div className="flex items-center justify-between text-[11.5px]">
                <span className="text-muted-foreground">Total horas</span>
                <span className="font-extrabold">{c.totalHoras}h</span>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="text-muted-foreground">Cobertura de fechas</span>
                  <span className={cn(
                    "font-extrabold",
                    c.cobertura >= 80 ? "text-emerald-600" :
                    c.cobertura >= 50 ? "text-amber-600" : "text-rose-600"
                  )}>{c.cobertura}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      c.cobertura >= 80 ? "bg-emerald-500" :
                      c.cobertura >= 50 ? "bg-amber-500" : "bg-rose-500"
                    )}
                    style={{ width: `${c.cobertura}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 pt-1">
                <Badge variant="outline" className="justify-center text-[9.5px] py-0.5">
                  <Activity className="h-2.5 w-2.5 mr-0.5" /> {enCurso.length} en curso
                </Badge>
                <Badge variant="outline" className="justify-center text-[9.5px] py-0.5">
                  <Clock className="h-2.5 w-2.5 mr-0.5" /> {proximas.length} próximas
                </Badge>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

// ─── Vista Calendario ─────────────────────────────────────────────────────────
function CalendarioView({ mes, setMes, unidades, asignatura }: {
  mes: Date
  setMes: (d: Date) => void
  unidades: UnidadConCurso[]
  asignatura: string
}) {
  const { ini, fin } = rangoDeMes(mes)
  const startWeekday = ini.getDay()
  const offset = (startWeekday + 6) % 7
  const lastDay = fin.getDate()

  // Hitos: días con inicio o fin de unidad
  const hitos = useMemo(() => {
    const map = new Map<string, { tipo: "inicio" | "fin"; unidad: UnidadConCurso }[]>()
    unidades.forEach(u => {
      if (u.start) {
        const ini = parseISO(u.start)
        if (ini && dentroDeRango(u, new Date(mes.getFullYear(), mes.getMonth(), 1), new Date(mes.getFullYear(), mes.getMonth(), lastDay))) {
          const k = u.start
          map.set(k, [...(map.get(k) || []), { tipo: "inicio", unidad: u }])
        }
      }
      if (u.end) {
        const k = u.end
        const finUnidad = parseISO(u.end)
        if (finUnidad && finUnidad.getMonth() === mes.getMonth() && finUnidad.getFullYear() === mes.getFullYear()) {
          map.set(k, [...(map.get(k) || []), { tipo: "fin", unidad: u }])
        }
      }
    })
    return map
  }, [unidades, mes, lastDay])

  // Unidades activas todo el mes
  const activasMes = useMemo(() => {
    const inicio = new Date(mes.getFullYear(), mes.getMonth(), 1)
    const final = new Date(mes.getFullYear(), mes.getMonth(), lastDay)
    return unidades.filter(u => dentroDeRango(u, inicio, final))
  }, [unidades, mes, lastDay])

  const cambiarMes = (delta: number) => {
    const x = new Date(mes); x.setMonth(x.getMonth() + delta); setMes(x)
  }

  const dias: number[] = []
  for (let d = 1; d <= lastDay; d++) dias.push(d)

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-[14px] border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button onClick={() => cambiarMes(-1)} className="rounded-md border border-border p-1.5 hover:bg-background">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h2 className="px-3 text-[15px] font-extrabold capitalize min-w-[160px] text-center">
              {MESES[mes.getMonth()]} {mes.getFullYear()}
            </h2>
            <button onClick={() => cambiarMes(1)} className="rounded-md border border-border p-1.5 hover:bg-background">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setMes(new Date())} className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:border-primary">
            Hoy
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
          ))}
          {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
          {dias.map(d => {
            const k = `${mes.getFullYear()}-${String(mes.getMonth()+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
            const hitosDia = hitos.get(k) || []
            const isHoy = new Date().toDateString() === new Date(mes.getFullYear(), mes.getMonth(), d).toDateString()
            return (
              <div
                key={d}
                className={cn(
                  "aspect-square rounded-[8px] border p-1 flex flex-col gap-0.5 min-h-[78px]",
                  isHoy ? "border-primary border-2 bg-pink-light" : "border-border bg-background"
                )}
              >
                <span className={cn("text-[11px] font-bold", isHoy && "text-primary")}>{d}</span>
                {hitosDia.length > 0 && (
                  <div className="flex flex-col gap-0.5">
                    {hitosDia.slice(0, 3).map((h, i) => (
                      <div
                        key={i}
                        className={cn(
                          "text-[8.5px] font-bold rounded px-1 py-0.5 flex items-center gap-0.5 truncate",
                          h.tipo === "inicio" ? "text-white" : "border-2"
                        )}
                        style={
                          h.tipo === "inicio"
                            ? { background: h.unidad.color || "var(--primary)" }
                            : { background: "transparent", borderColor: h.unidad.color || "var(--primary)", color: h.unidad.color || "var(--primary)" }
                        }
                        title={`${h.tipo === "inicio" ? "Inicia" : "Termina"}: ${h.unidad.name} (${h.unidad.curso})`}
                      >
                        {h.tipo === "inicio" ? "▶" : "■"} {h.unidad.name}
                      </div>
                    ))}
                    {hitosDia.length > 3 && <span className="text-[8.5px] text-muted-foreground">+{hitosDia.length - 3}</span>}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">▶ Inicia unidad</span>
          <span className="inline-flex items-center gap-1">■ Termina unidad</span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-pink-light border border-primary" /> Hoy</span>
        </div>
      </div>

      <aside className="rounded-[14px] border border-border bg-card p-4 lg:sticky lg:top-32 lg:self-start max-h-[600px] overflow-y-auto">
        <h3 className="text-[12.5px] font-extrabold mb-3 inline-flex items-center gap-1.5">
          <Pin className="h-3.5 w-3.5 text-primary" /> Unidades activas en {MESES[mes.getMonth()]}
        </h3>
        {activasMes.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">Sin unidades en este mes.</p>
        ) : (
          <ul className="space-y-2">
            {activasMes.map((u, index) => (
              <li key={`${u.curso}-${u.id}-${index}`}>
                <Link
                  href={buildUrl("/planificaciones", withAsignatura({ curso: u.curso }, asignatura))}
                  className="block rounded-[10px] border border-border bg-background p-2.5 hover:border-primary transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-sm flex-shrink-0" style={{ background: u.color || u.cursoColor }} />
                    <span className="text-[12px] font-bold truncate">{u.name}</span>
                  </div>
                  <div className="text-[10.5px] text-muted-foreground mt-0.5">
                    {u.curso} · {u.hours}h
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                    {u.start} → {u.end}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  )
}

// ─── Vista Insights ───────────────────────────────────────────────────────────
function InsightsView({ cursos, unidades, stats }: {
  cursos: CursoInfo[]
  unidades: UnidadConCurso[]
  stats: { total: number; conFechas: number; enCurso: number; proximas: number; incompletas: number; cobertura: number; totalHoras: number }
}) {
  const hoy = new Date()
  // Próximas a iniciar (siguientes 30 días)
  const proximas30 = unidades.filter(u => {
    const ini = parseISO(u.start)
    if (!ini) return false
    const dif = diasEntre(hoy, ini)
    return dif >= 0 && dif <= 30
  }).sort((a, b) => (parseISO(a.start)!.getTime()) - (parseISO(b.start)!.getTime()))

  // En curso
  const enCurso = unidades.filter(u => estadoUnidad(u, hoy) === "actual")
  // Sin fechas (incompletas) por curso
  const incompletas = unidades.filter(u => estadoUnidad(u, hoy) === "incompleta")

  // Distribución por tipo
  const porTipo: Record<UnidadPlan["type"], number> = { tradicional: 0, invertida: 0, proyecto: 0, unidad0: 0 }
  unidades.forEach(u => { porTipo[u.type] = (porTipo[u.type] || 0) + 1 })
  const tiposEntries = Object.entries(porTipo) as [UnidadPlan["type"], number][]
  const maxTipo = Math.max(1, ...tiposEntries.map(([, n]) => n))

  // Sugerencias inteligentes
  const sugerencias: { titulo: string; texto: string; tono: "ok" | "amber" | "rojo" | "info" }[] = []
  if (stats.incompletas > 0) {
    sugerencias.push({
      titulo: `Tienes ${stats.incompletas} unidad${stats.incompletas === 1 ? "" : "es"} sin fechas`,
      texto: "Asígnales rangos de inicio y fin para que aparezcan en el timeline y calendario.",
      tono: "amber",
    })
  }
  if (stats.cobertura < 50 && stats.total > 0) {
    sugerencias.push({
      titulo: `Cobertura baja (${stats.cobertura}%)`,
      texto: "Menos de la mitad de tus unidades tienen fechas asignadas. Considera planificarlas pronto.",
      tono: "rojo",
    })
  }
  if (proximas30.length > 0) {
    sugerencias.push({
      titulo: `${proximas30.length} unidad${proximas30.length === 1 ? "" : "es"} inicia${proximas30.length === 1 ? "" : "n"} en 30 días`,
      texto: "Revisa que tengas las clases planificadas y materiales listos.",
      tono: "info",
    })
  }
  if (enCurso.length > 0) {
    sugerencias.push({
      titulo: `${enCurso.length} unidad${enCurso.length === 1 ? "" : "es"} en curso`,
      texto: enCurso.map(u => `${u.name} (${u.curso})`).join(" · "),
      tono: "ok",
    })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[14px] border border-border bg-card p-5">
          <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Sugerencias de planificación
          </h3>
          {sugerencias.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic">¡Todo en orden! No hay sugerencias urgentes.</p>
          ) : (
            <ul className="space-y-2">
              {sugerencias.map((s, i) => {
                const tono =
                  s.tono === "ok"   ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100" :
                  s.tono === "amber"? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100" :
                  s.tono === "rojo" ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100" :
                                      "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100"
                return (
                  <li key={i} className={cn("rounded-[10px] border p-3", tono)}>
                    <h4 className="text-[12.5px] font-extrabold">{s.titulo}</h4>
                    <p className="text-[11.5px] opacity-90 mt-0.5">{s.texto}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-[14px] border border-border bg-card p-5">
          <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" /> Distribución por tipo
          </h3>
          <div className="space-y-2">
            {tiposEntries.map(([tipo, n]) => (
              <div key={tipo} className="space-y-1">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="font-semibold">{TIPO_META[tipo].label}</span>
                  <span className="font-extrabold">{n}</span>
                </div>
                <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary to-fuchsia-500 transition-all"
                    style={{ width: `${(n / maxTipo) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="rounded-[14px] border border-border bg-card p-5">
        <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" /> Cobertura por curso
        </h3>
        <div className="space-y-2.5">
          {cursos.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic">Sin cursos.</p>
          ) : cursos.map((c, index) => (
            <div key={`${c.curso}-${index}`} className="space-y-1">
              <div className="flex items-center justify-between text-[11.5px]">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                  <span className="font-semibold truncate">{c.curso}</span>
                  <span className="text-muted-foreground">· {c.unidades.length}u · {c.totalHoras}h</span>
                </div>
                <span className={cn(
                  "font-extrabold",
                  c.cobertura >= 80 ? "text-emerald-600" :
                  c.cobertura >= 50 ? "text-amber-600" : "text-rose-600"
                )}>{c.cobertura}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                <div
                  className={cn(
                    "h-full transition-all",
                    c.cobertura >= 80 ? "bg-emerald-500" :
                    c.cobertura >= 50 ? "bg-amber-500" : "bg-rose-500"
                  )}
                  style={{ width: `${c.cobertura}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {proximas30.length > 0 && (
        <section className="rounded-[14px] border border-border bg-card p-5">
          <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Próximas 30 días
          </h3>
          <ul className="space-y-2">
            {proximas30.map((u, index) => {
              const ini = parseISO(u.start)!
              const dif = diasEntre(hoy, ini)
              return (
                <li key={`${u.curso}-${u.id}-${index}`} className="flex items-center gap-3 rounded-[10px] border border-border bg-background p-2.5">
                  <span className="inline-block h-9 w-1 rounded-full flex-shrink-0" style={{ background: u.color || u.cursoColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-bold truncate">{u.name}</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {u.curso} · empieza el {u.start} ({dif === 0 ? "hoy" : `en ${dif} día${dif === 1 ? "" : "s"}`})
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9.5px]">{TIPO_META[u.type].label}</Badge>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {incompletas.length > 0 && (
        <section className="rounded-[14px] border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-5">
          <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2 text-amber-900 dark:text-amber-100">
            <AlertCircle className="h-4 w-4" /> Sin fechas asignadas ({incompletas.length})
          </h3>
          <ul className="space-y-1.5">
            {incompletas.map((u, index) => (
              <li key={`${u.curso}-${u.id}-${index}`} className="text-[11.5px] flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <span className="inline-block h-2 w-2 rounded-sm flex-shrink-0" style={{ background: u.color || u.cursoColor }} />
                <span className="font-semibold truncate">{u.name}</span>
                <span className="opacity-75">· {u.curso}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
