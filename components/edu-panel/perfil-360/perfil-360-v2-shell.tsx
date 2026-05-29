"use client"

import { useEffect, useMemo, useState, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Activity, BookOpen, ClipboardCheck, Loader2, UserRound, Users,
  Plus, MessageSquare, TrendingUp, ShieldCheck, Target, AlertTriangle,
  Search, Filter, ArrowUpDown, ChevronUp, ChevronDown, Sparkles,
  Calendar, Eye, X, GitCompare, Pin, ListChecks,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { cargarHorarioSemanal } from "@/lib/horario"
import { cargarEstudiantes, compareEstudiantes } from "@/lib/estudiantes"
import {
  listarLibroClasesCurso, userDoc,
  cargarObservaciones360, guardarObservaciones360,
} from "@/lib/curriculo"
import type { Observacion360 } from "@/lib/curriculo"
import { getDoc } from "firebase/firestore"
import { evaluarAlumno } from "@/lib/alertas"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { MiniSparkline } from "@/components/edu-panel/shared/mini-sparkline"

type TabKey = "resumen" | "academico" | "asistencia" | "observaciones" | "pie"
const TABS: { key: TabKey; label: string; icon: typeof UserRound; pieOnly?: boolean }[] = [
  { key: "resumen",       label: "Resumen",       icon: Sparkles },
  { key: "academico",     label: "Académico",     icon: Target },
  { key: "asistencia",    label: "Asistencia",    icon: Users },
  { key: "observaciones", label: "Observaciones", icon: MessageSquare },
  { key: "pie",           label: "Ficha PIE",     icon: ShieldCheck, pieOnly: true },
]

interface EstudianteVista {
  id: string
  nombre: string
  orden?: number
  promedio: number | null
  promedioClase: number | null
  porcentajeAsistencia: number | null
  asistencia: { presente: number; ausente: number; atraso: number; retirado: number }
  pie: boolean
  pieDiagnostico: string
  pieEspecialista: string
  pieNotas: string
  notas: Record<string, string>
}

interface EvaluacionPerfil {
  id: string
  label: string
  oaIds?: string[]
  unidadId?: string
}

interface LibroCurso {
  fecha: string
  bloques: { firmado: boolean; asistencia: { id: string; nombre: string; estado: "presente"|"ausente"|"atraso"|"retirado" }[] }[]
}

const OBS_TIPOS: { key: Observacion360["tipo"]; label: string; cls: string }[] = [
  { key: "academica",  label: "Académica",  cls: "bg-status-blue-bg text-status-blue-text border-status-blue-border" },
  { key: "conductual", label: "Conductual", cls: "bg-status-amber-bg text-status-amber-text border-status-amber-border" },
  { key: "pie",        label: "PIE",        cls: "bg-status-pie-bg text-status-pie-text border-status-pie-border" },
  { key: "general",    label: "General",    cls: "bg-status-slate-bg text-status-slate-text border-status-slate-border" },
]

const TEMPLATES_OBS: { tipo: Observacion360["tipo"]; texto: string }[] = [
  { tipo: "academica",  texto: "Excelente participación durante la clase." },
  { tipo: "academica",  texto: "Demuestra dificultad para mantener la atención en actividades extensas." },
  { tipo: "conductual", texto: "Falta de puntualidad reiterada." },
  { tipo: "conductual", texto: "Conducta destacada de respeto hacia sus compañeros." },
  { tipo: "pie",        texto: "Adecuación curricular aplicada con éxito; mantiene ritmo del grupo." },
  { tipo: "pie",        texto: "Requiere apoyo adicional en lectoescritura, derivar a especialista." },
  { tipo: "general",    texto: "Inasistencia justificada por motivos médicos." },
  { tipo: "general",    texto: "Apoderado contactado para informar sobre avances." },
]

function buildCalifId(asignatura: string, curso: string) {
  return (`calif_${asignatura}_${curso}`)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function calcPromedio(notas: Record<string, string>) {
  const vals = Object.values(notas).map((v) => parseFloat(v)).filter((v) => !Number.isNaN(v))
  if (!vals.length) return null
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
}

function getInitials(nombre: string): string {
  const parts = nombre.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getNivelAlerta(est: EstudianteVista, alertasCount: number): { tier: "verde" | "amber" | "rojo"; label: string } {
  if (alertasCount > 1) return { tier: "rojo", label: "Crítico" }
  if (alertasCount > 0) return { tier: "amber", label: "Atención" }
  if (est.porcentajeAsistencia != null && est.porcentajeAsistencia < 70) return { tier: "rojo", label: "Crítico" }
  if (est.promedio != null && est.promedio < 4.0) return { tier: "rojo", label: "Crítico" }
  if (est.porcentajeAsistencia != null && est.porcentajeAsistencia < 85) return { tier: "amber", label: "Atención" }
  return { tier: "verde", label: "Estable" }
}

const TIER_CLS: Record<"verde"|"amber"|"rojo", { dot: string; bg: string; text: string }> = {
  verde: { dot: "bg-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950/30", text: "text-emerald-700 dark:text-emerald-300" },
  amber: { dot: "bg-amber-500",   bg: "bg-amber-50 dark:bg-amber-950/30",   text: "text-amber-700 dark:text-amber-300" },
  rojo:  { dot: "bg-rose-500",    bg: "bg-rose-50 dark:bg-rose-950/30",     text: "text-rose-700 dark:text-rose-300" },
}

type FiltroLista = "todos" | "pie" | "atencion" | "criticos"

export function Perfil360V2Shell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura: ASIGNATURA } = useActiveSubject()

  const cursoParam = searchParams.get("curso")
  const alumnoParam = searchParams.get("alumno")
  const tabParam = (searchParams.get("tab") as TabKey | null)

  const [activeTab, setActiveTab] = useState<TabKey>(tabParam ?? "resumen")
  const [curso, setCurso] = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [estudiantes, setEstudiantes] = useState<EstudianteVista[]>([])
  const [evaluacionesCalif, setEvaluacionesCalif] = useState<EvaluacionPerfil[]>([])
  const [libros, setLibros] = useState<LibroCurso[]>([])
  const [selectedId, setSelectedId] = useState<string>("")

  const [observaciones, setObservaciones] = useState<Observacion360[]>([])
  const [loadingObs, setLoadingObs] = useState(false)
  const [showObsForm, setShowObsForm] = useState(false)
  const [newObsTexto, setNewObsTexto] = useState("")
  const [newObsTipo, setNewObsTipo] = useState<Observacion360["tipo"]>("general")

  const [search, setSearch] = useState("")
  const [filtroLista, setFiltroLista] = useState<FiltroLista>("todos")
  const [orden, setOrden] = useState<"nombre" | "promedio" | "asistencia">("nombre")

  const [comparador, setComparador] = useState<{ open: boolean; otherId: string }>({ open: false, otherId: "" })

  useEffect(() => { setActiveTab(tabParam ?? "resumen") }, [tabParam])

  const goToTab = useCallback((key: TabKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("tab", key)
    router.replace(`/perfil-360?${params.toString()}`, { scroll: false })
    setActiveTab(key)
  }, [router, searchParams])

  // Cursos
  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (unique.length > 0) setCurso(cursoParam && unique.includes(cursoParam) ? cursoParam : unique[0])
    })
  }, [cursoParam])

  // Carga curso
  useEffect(() => {
    if (!curso) return
    setLoading(true)
    Promise.all([
      listarLibroClasesCurso(ASIGNATURA, curso),
      getDoc(userDoc("calificaciones", buildCalifId(ASIGNATURA, curso))),
      cargarEstudiantes(curso),
    ]).then(([librosData, califSnap, estDocs]) => {
      setLibros(librosData as LibroCurso[])
      const calif = califSnap.exists() ? califSnap.data() : null
      setEvaluacionesCalif(Array.isArray(calif?.evaluaciones) ? calif.evaluaciones.map((ev: any) => ({
        id: ev.id,
        label: ev.label || ev.id,
        oaIds: Array.isArray(ev.oaIds) ? ev.oaIds : [],
        unidadId: ev.unidadId,
      })) : [])

      const mapa = new Map<string, EstudianteVista>()
      for (const est of estDocs) {
        mapa.set(est.nombre, {
          id: est.id, nombre: est.nombre, orden: est.orden,
          promedio: null, promedioClase: null, porcentajeAsistencia: null,
          asistencia: { presente: 0, ausente: 0, atraso: 0, retirado: 0 },
          pie: est.pie === true,
          pieDiagnostico: est.pieDiagnostico || "",
          pieEspecialista: est.pieEspecialista || "",
          pieNotas: est.pieNotas || "",
          notas: {},
        })
      }
      if (calif?.estudiantes?.length) {
        for (const est of calif.estudiantes) {
          const vista = mapa.get(est.name)
          if (!vista) continue
          vista.notas = est.notas || {}
          vista.promedio = calcPromedio(vista.notas)
        }
      }
      for (const libro of librosData as LibroCurso[]) {
        for (const bloque of libro.bloques) {
          for (const a of bloque.asistencia) {
            const vista = mapa.get(a.nombre)
            if (vista) vista.asistencia[a.estado] += 1
          }
        }
      }
      const allPromedios = Array.from(mapa.values()).map(e => e.promedio).filter(Boolean) as number[]
      const classAvg = allPromedios.length ? Number((allPromedios.reduce((a, b) => a + b, 0) / allPromedios.length).toFixed(1)) : null

      for (const est of mapa.values()) {
        est.promedioClase = classAvg
        const total = est.asistencia.presente + est.asistencia.ausente + est.asistencia.atraso + est.asistencia.retirado
        est.porcentajeAsistencia = total > 0
          ? Math.round(((est.asistencia.presente + est.asistencia.atraso) / total) * 100)
          : null
      }
      const lista = Array.from(mapa.values()).sort(compareEstudiantes)
      setEstudiantes(lista)
      setSelectedId((prev) => {
        if (alumnoParam && lista.some((est) => est.id === alumnoParam)) return alumnoParam
        return lista.some((est) => est.id === prev) ? prev : (lista[0]?.id || "")
      })
    }).catch(error => {
      console.error("Error cargando perfil 360 v2", error)
      setEstudiantes([])
      setSelectedId("")
    }).finally(() => setLoading(false))
  }, [curso, ASIGNATURA, alumnoParam])

  // Observaciones del estudiante seleccionado
  useEffect(() => {
    if (!selectedId || !curso) { setObservaciones([]); return }
    setLoadingObs(true)
    cargarObservaciones360(ASIGNATURA, curso, selectedId)
      .then(setObservaciones)
      .catch(() => setObservaciones([]))
      .finally(() => setLoadingObs(false))
  }, [selectedId, curso, ASIGNATURA])

  const seleccionado = useMemo(() => estudiantes.find(e => e.id === selectedId) || null, [estudiantes, selectedId])

  const alertas = useMemo(() => {
    if (!seleccionado) return []
    return evaluarAlumno({
      promedio: seleccionado.promedio,
      porcentajeAsistencia: seleccionado.porcentajeAsistencia,
      pie: seleccionado.pie,
      notas: seleccionado.notas,
      observaciones,
    })
  }, [observaciones, seleccionado])

  const otroSeleccionado = useMemo(
    () => estudiantes.find(e => e.id === comparador.otherId) || null,
    [estudiantes, comparador.otherId]
  )

  const filtrados = useMemo(() => {
    let lista = estudiantes
    if (search.trim()) {
      const s = search.trim().toLowerCase()
      lista = lista.filter(e => e.nombre.toLowerCase().includes(s))
    }
    if (filtroLista === "pie") lista = lista.filter(e => e.pie)
    if (filtroLista === "atencion") lista = lista.filter(e => e.porcentajeAsistencia != null && e.porcentajeAsistencia < 85 && e.porcentajeAsistencia >= 70)
    if (filtroLista === "criticos") lista = lista.filter(e => (e.promedio != null && e.promedio < 4.0) || (e.porcentajeAsistencia != null && e.porcentajeAsistencia < 70))

    if (orden === "promedio") lista = [...lista].sort((a, b) => (a.promedio ?? 0) - (b.promedio ?? 0))
    if (orden === "asistencia") lista = [...lista].sort((a, b) => (a.porcentajeAsistencia ?? 0) - (b.porcentajeAsistencia ?? 0))
    return lista
  }, [estudiantes, search, filtroLista, orden])

  // Atajos teclado: ↑↓ navegar alumnos, C comparar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      if (filtrados.length === 0) return
      const idx = filtrados.findIndex(x => x.id === selectedId)
      if (e.key === "ArrowDown") {
        e.preventDefault()
        const next = filtrados[Math.min(filtrados.length - 1, idx + 1)] || filtrados[0]
        setSelectedId(next.id)
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        const next = filtrados[Math.max(0, idx - 1)] || filtrados[0]
        setSelectedId(next.id)
      } else if (e.key.toLowerCase() === "c") {
        e.preventDefault()
        if (selectedId) setComparador(prev => ({ ...prev, open: true }))
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [filtrados, selectedId])

  const agregarObservacion = async (textoArg?: string, tipoArg?: Observacion360["tipo"]) => {
    const texto = (textoArg ?? newObsTexto).trim()
    const tipo = tipoArg ?? newObsTipo
    if (!texto || !selectedId) return
    const nueva: Observacion360 = {
      id: `obs_${Date.now()}`,
      texto,
      fecha: new Date().toISOString().slice(0, 10),
      tipo,
    }
    const updated = [nueva, ...observaciones]
    setObservaciones(updated)
    setNewObsTexto("")
    setShowObsForm(false)
    await guardarObservaciones360(ASIGNATURA, curso, selectedId, updated).catch(console.error)
  }

  const stats = useMemo(() => {
    if (estudiantes.length === 0) return { total: 0, pie: 0, criticos: 0 }
    let pie = 0, criticos = 0
    estudiantes.forEach(e => {
      if (e.pie) pie++
      if ((e.promedio != null && e.promedio < 4.0) || (e.porcentajeAsistencia != null && e.porcentajeAsistencia < 70)) criticos++
    })
    return { total: estudiantes.length, pie, criticos }
  }, [estudiantes])

  const visibleTabs = TABS.filter(t => !t.pieOnly || (seleccionado?.pie === true))

  return (
    <div className="mx-auto max-w-[1500px] px-3 sm:px-5 pb-10">
      {/* Hero */}
      <div className="mb-5 grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 px-6 py-6 text-white">
          <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-[11px] font-bold opacity-90 inline-flex items-center gap-1">
              <Users className="h-3 w-3" /> PERFIL 360 · BETA
            </div>
            <h1 className="mt-1 text-[22px] sm:text-[26px] font-extrabold leading-tight">
              {curso ? <>Vista integrada de tus estudiantes</> : "Carga un curso"}
            </h1>
            <p className="mt-1 text-[12.5px] text-white/85">
              {ASIGNATURA} · {curso || "—"} · {stats.total} estudiantes
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={curso}
                onChange={(e) => setCurso(e.target.value)}
                className="rounded-[10px] bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur outline-none [&>option]:text-foreground"
              >
                {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
              </select>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                <ShieldCheck className="h-3 w-3" /> {stats.pie} PIE
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/30 px-2.5 py-1 text-[11px] font-bold backdrop-blur">
                <AlertTriangle className="h-3 w-3" /> {stats.criticos} críticos
              </span>
            </div>
          </div>
        </div>

        {/* KPIs del estudiante seleccionado */}
        {seleccionado ? (
          <div className="grid grid-cols-2 gap-2.5">
            <KpiBig label="Promedio" value={seleccionado.promedio?.toFixed(1) ?? "—"} delta={
              seleccionado.promedio != null && seleccionado.promedioClase != null
                ? Number((seleccionado.promedio - seleccionado.promedioClase).toFixed(1))
                : null
            } />
            <KpiBig label="Asistencia" value={seleccionado.porcentajeAsistencia != null ? `${seleccionado.porcentajeAsistencia}%` : "—"} />
            <KpiBig label="Observaciones" value={observaciones.length.toString()} />
            <KpiBig label="Alertas" value={alertas.length.toString()} highlight={alertas.length > 0 ? "warn" : undefined} />
          </div>
        ) : (
          <div className="rounded-[14px] border border-dashed border-border bg-card p-6 text-center text-[12px] text-muted-foreground">
            Selecciona un estudiante para ver sus KPIs.
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando perfil…
        </div>
      ) : estudiantes.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border bg-card p-10 text-center text-[13px] text-muted-foreground">
          Aún no hay estudiantes en este curso. Agrégalos desde Mi Perfil → Mis cursos.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[330px_1fr]">
          {/* Master: lista de estudiantes */}
          <aside className="rounded-[16px] border border-border bg-card overflow-hidden flex flex-col max-h-[calc(100vh-180px)]">
            <div className="border-b border-border px-3 py-2.5 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar estudiante…"
                  className="w-full rounded-[8px] border border-border bg-background pl-8 pr-2 py-1.5 text-[12px] outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 hover:border-primary">
                      <Filter className="h-3 w-3" /> Filtro
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1.5" align="start">
                    {([
                      { k: "todos",     label: "Todos" },
                      { k: "pie",       label: "Solo PIE" },
                      { k: "atencion",  label: "Atención (70-85%)" },
                      { k: "criticos",  label: "Críticos" },
                    ] as { k: FiltroLista; label: string }[]).map(f => (
                      <button
                        key={f.k}
                        onClick={() => setFiltroLista(f.k)}
                        className={cn(
                          "w-full text-left rounded-md px-2 py-1.5 text-[12px] hover:bg-muted/60",
                          filtroLista === f.k && "bg-pink-light text-primary font-bold",
                        )}
                      >{f.label}</button>
                    ))}
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 hover:border-primary">
                      <ArrowUpDown className="h-3 w-3" /> Orden
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-1.5" align="start">
                    {([
                      { k: "nombre",     label: "Por nombre" },
                      { k: "promedio",   label: "Por promedio (asc)" },
                      { k: "asistencia", label: "Por asistencia (asc)" },
                    ] as { k: typeof orden; label: string }[]).map(o => (
                      <button
                        key={o.k}
                        onClick={() => setOrden(o.k)}
                        className={cn(
                          "w-full text-left rounded-md px-2 py-1.5 text-[12px] hover:bg-muted/60",
                          orden === o.k && "bg-pink-light text-primary font-bold",
                        )}
                      >{o.label}</button>
                    ))}
                  </PopoverContent>
                </Popover>
                <span className="ml-auto text-muted-foreground">{filtrados.length}/{estudiantes.length}</span>
              </div>
            </div>

            <ul className="flex-1 overflow-y-auto divide-y divide-border">
              {filtrados.map(e => {
                const isActive = e.id === selectedId
                const alertasCount = evaluarAlumno({
                  promedio: e.promedio,
                  porcentajeAsistencia: e.porcentajeAsistencia,
                  pie: e.pie,
                  notas: e.notas,
                  observaciones: [],
                }).length
                const tier = getNivelAlerta(e, alertasCount)
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setSelectedId(e.id)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                        isActive ? "bg-pink-light" : "hover:bg-background/60"
                      )}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className={cn("text-[11px] font-bold", isActive ? "bg-primary text-white" : "bg-muted")}>
                          {getInitials(e.nombre)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className={cn("flex items-center gap-1.5 text-[12.5px] font-semibold", isActive && "text-primary")}>
                          <span className="truncate">{e.nombre}</span>
                          {e.pie && <Badge variant="outline" className="h-4 px-1 text-[8.5px] flex-shrink-0">PIE</Badge>}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                          <span>{e.promedio != null ? e.promedio.toFixed(1) : "—"}</span>
                          <span>·</span>
                          <span>{e.porcentajeAsistencia != null ? `${e.porcentajeAsistencia}%` : "—"}</span>
                        </div>
                      </div>
                      <span className={cn("h-2 w-2 rounded-full flex-shrink-0", TIER_CLS[tier.tier].dot)} title={tier.label} />
                    </button>
                  </li>
                )
              })}
              {filtrados.length === 0 && (
                <li className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                  Sin coincidencias.
                </li>
              )}
            </ul>

            <div className="border-t border-border px-3 py-2 text-[10.5px] text-muted-foreground bg-background/50">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded bg-muted px-1">↑</kbd>
                <kbd className="rounded bg-muted px-1">↓</kbd>
                navegar ·
                <kbd className="rounded bg-muted px-1">C</kbd>
                comparar
              </span>
            </div>
          </aside>

          {/* Detail */}
          <div className="flex flex-col gap-4 min-w-0">
            {seleccionado && (
              <div className="rounded-[16px] border border-border bg-card p-5">
                <div className="flex items-start gap-4">
                  <Avatar className="h-16 w-16 border-2 border-primary">
                    <AvatarFallback className="bg-pink-light text-primary text-[18px] font-extrabold">
                      {getInitials(seleccionado.nombre)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-[20px] font-extrabold leading-tight">{seleccionado.nombre}</h2>
                    <p className="text-[12.5px] text-muted-foreground mt-0.5">
                      {curso} · {ASIGNATURA}
                      {seleccionado.orden != null && <span> · #{seleccionado.orden}</span>}
                    </p>
                    {seleccionado.pie && (
                      <span className="mt-1.5 inline-block rounded bg-status-pie-bg px-2 py-0.5 text-[10px] font-bold text-status-pie-text border border-status-pie-border">
                        PIE{seleccionado.pieDiagnostico ? ` · ${seleccionado.pieDiagnostico}` : ""}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setComparador(prev => ({ ...prev, open: true }))}
                    className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12px] font-semibold hover:border-primary"
                  >
                    <GitCompare className="h-3.5 w-3.5" /> Comparar
                  </button>
                </div>

                {/* Tabs internas */}
                <div className="mt-4 -mx-1 flex flex-wrap items-center gap-1 border-b border-border">
                  {visibleTabs.map(tab => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.key
                    return (
                      <button
                        key={tab.key}
                        onClick={() => goToTab(tab.key)}
                        className={`inline-flex items-center gap-1.5 rounded-t-[10px] px-3 py-2 text-[12.5px] font-semibold transition-colors ${
                          isActive
                            ? "bg-pink-light text-primary border-b-2 border-primary -mb-px"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {tab.label}
                      </button>
                    )
                  })}
                </div>

                {/* Tab content */}
                <div className="pt-4">
                  {activeTab === "resumen" && (
                    <ResumenView
                      est={seleccionado}
                      observaciones={observaciones}
                      libros={libros}
                      alertas={alertas}
                    />
                  )}
                  {activeTab === "academico" && (
                    <AcademicoView
                      est={seleccionado}
                      evaluacionesCalif={evaluacionesCalif}
                    />
                  )}
                  {activeTab === "asistencia" && (
                    <AsistenciaView est={seleccionado} libros={libros} />
                  )}
                  {activeTab === "observaciones" && (
                    <ObservacionesView
                      observaciones={observaciones}
                      loading={loadingObs}
                      showForm={showObsForm}
                      onShowForm={setShowObsForm}
                      newTexto={newObsTexto}
                      newTipo={newObsTipo}
                      onTextoChange={setNewObsTexto}
                      onTipoChange={setNewObsTipo}
                      onSave={() => agregarObservacion()}
                      onTemplate={(t) => agregarObservacion(t.texto, t.tipo)}
                    />
                  )}
                  {activeTab === "pie" && seleccionado.pie && (
                    <PieView est={seleccionado} />
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Comparador */}
      <Sheet open={comparador.open} onOpenChange={(o) => setComparador(prev => ({ ...prev, open: o }))}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <GitCompare className="h-4 w-4" /> Comparar estudiantes
            </SheetTitle>
          </SheetHeader>
          {seleccionado && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground">Comparar con</label>
                <select
                  value={comparador.otherId}
                  onChange={e => setComparador(prev => ({ ...prev, otherId: e.target.value }))}
                  className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] font-semibold"
                >
                  <option value="">Selecciona un estudiante…</option>
                  {estudiantes.filter(e => e.id !== seleccionado.id).map(e => (
                    <option key={e.id} value={e.id}>{e.nombre}{e.pie ? " (PIE)" : ""}</option>
                  ))}
                </select>
              </div>

              {otroSeleccionado ? (
                <div className="grid grid-cols-2 gap-3">
                  <CompararCard est={seleccionado} />
                  <CompararCard est={otroSeleccionado} />
                </div>
              ) : (
                <p className="text-[12px] text-muted-foreground italic">
                  Selecciona un estudiante para comparar.
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function KpiBig({ label, value, delta, highlight }: { label: string; value: string; delta?: number | null; highlight?: "warn" }) {
  return (
    <div className={cn(
      "rounded-[14px] border border-border bg-card p-3",
      highlight === "warn" && Number(value) > 0 && "border-rose-300 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/20",
    )}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-[22px] font-extrabold leading-none">{value}</div>
      {delta != null && (
        <div className={cn("mt-1 text-[10px] font-bold", delta >= 0 ? "text-emerald-600" : "text-rose-600")}>
          {delta >= 0 ? "+" : ""}{delta} vs clase
        </div>
      )}
    </div>
  )
}

function ResumenView({ est, observaciones, libros, alertas }: {
  est: EstudianteVista
  observaciones: Observacion360[]
  libros: LibroCurso[]
  alertas: ReturnType<typeof evaluarAlumno>
}) {
  const eventos = useMemo(() => {
    const items: { fecha: string; tipo: "nota" | "obs" | "ausencia"; titulo: string; detalle?: string; cls: string }[] = []
    Object.entries(est.notas).forEach(([k, v]) => {
      const n = parseFloat(v)
      if (!isNaN(n)) {
        items.push({
          fecha: "—",
          tipo: "nota",
          titulo: `Nota ${n.toFixed(1)}`,
          detalle: k,
          cls: n < 4 ? "border-rose-300" : n < 5.5 ? "border-amber-300" : "border-emerald-300",
        })
      }
    })
    observaciones.forEach(o => {
      items.push({
        fecha: o.fecha,
        tipo: "obs",
        titulo: o.texto.slice(0, 80) + (o.texto.length > 80 ? "…" : ""),
        detalle: OBS_TIPOS.find(t => t.key === o.tipo)?.label,
        cls: "border-blue-300",
      })
    })
    libros.forEach(libro => {
      const tieneAusencia = libro.bloques.some(b => b.asistencia.find(a => a.nombre === est.nombre)?.estado === "ausente")
      if (tieneAusencia) {
        items.push({
          fecha: libro.fecha,
          tipo: "ausencia",
          titulo: "Ausente",
          detalle: "Inasistencia registrada",
          cls: "border-rose-300",
        })
      }
    })
    return items.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "")).slice(0, 12)
  }, [est, observaciones, libros])

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {alertas.length > 0 && (
        <div className="md:col-span-2 grid gap-2">
          {alertas.map(a => (
            <div key={a.id} className={cn(
              "flex items-start gap-3 rounded-[12px] border p-3.5",
              a.severidad === "alta" ? "border-rose-300 bg-rose-50 dark:bg-rose-950/30" : "border-amber-300 bg-amber-50 dark:bg-amber-950/30"
            )}>
              <AlertTriangle className={cn("h-4 w-4 mt-0.5", a.severidad === "alta" ? "text-rose-600" : "text-amber-600")} />
              <div className="flex-1">
                <h4 className="text-[13px] font-extrabold">{a.titulo}</h4>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">{a.detalle}</p>
                <p className="mt-1.5 text-[11.5px] font-semibold">{a.accion}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <section className="rounded-[14px] border border-border bg-background p-4">
        <h3 className="text-[12.5px] font-extrabold flex items-center gap-2 mb-3">
          <TrendingUp className="h-3.5 w-3.5 text-primary" /> Tendencia de notas
        </h3>
        {Object.keys(est.notas).length >= 2 ? (
          <MiniSparkline notas={est.notas} width={280} height={80} />
        ) : (
          <p className="text-[12px] text-muted-foreground">Aún no hay suficientes notas para mostrar tendencia.</p>
        )}
      </section>

      <section className="rounded-[14px] border border-border bg-background p-4">
        <h3 className="text-[12.5px] font-extrabold flex items-center gap-2 mb-3">
          <Activity className="h-3.5 w-3.5 text-primary" /> Distribución asistencia
        </h3>
        <BarrasAsistencia est={est} />
      </section>

      <section className="md:col-span-2 rounded-[14px] border border-border bg-background p-4">
        <h3 className="text-[12.5px] font-extrabold flex items-center gap-2 mb-3">
          <Calendar className="h-3.5 w-3.5 text-primary" /> Línea de tiempo
        </h3>
        {eventos.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Sin eventos registrados.</p>
        ) : (
          <ul className="relative space-y-2 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
            {eventos.map((ev, i) => (
              <li key={i} className="relative pl-6">
                <span className={cn("absolute left-0 top-2 h-3 w-3 rounded-full border-2 bg-card", ev.cls)} />
                <div className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold truncate">{ev.titulo}</div>
                    {ev.detalle && <div className="text-[10.5px] text-muted-foreground truncate">{ev.detalle}</div>}
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap">{ev.fecha}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function AcademicoView({ est, evaluacionesCalif }: { est: EstudianteVista; evaluacionesCalif: EvaluacionPerfil[] }) {
  const rendimientoPorOA = useMemo(() => {
    const acc = new Map<string, { oaId: string; suma: number; total: number; evaluaciones: string[] }>()
    evaluacionesCalif.forEach(ev => {
      if (!ev.oaIds?.length) return
      const nota = Number.parseFloat(est.notas[ev.id])
      if (!Number.isFinite(nota)) return
      ev.oaIds.forEach(oaId => {
        const cur = acc.get(oaId) || { oaId, suma: 0, total: 0, evaluaciones: [] }
        cur.suma += nota
        cur.total += 1
        cur.evaluaciones.push(ev.label)
        acc.set(oaId, cur)
      })
    })
    return Array.from(acc.values())
      .map(item => ({ ...item, promedio: Number((item.suma / item.total).toFixed(1)) }))
      .sort((a, b) => a.oaId.localeCompare(b.oaId, "es", { numeric: true }))
  }, [evaluacionesCalif, est.notas])

  const notasOrdenadas = useMemo(() =>
    Object.entries(est.notas).map(([k, v]) => ({ id: k, valor: parseFloat(v) }))
      .filter(x => !isNaN(x.valor))
      .map(x => {
        const ev = evaluacionesCalif.find(e => e.id === x.id)
        return { ...x, label: ev?.label || x.id }
      })
  , [est.notas, evaluacionesCalif])

  return (
    <div className="space-y-4">
      <section className="rounded-[14px] border border-border bg-background p-4">
        <h3 className="text-[12.5px] font-extrabold mb-3">Notas registradas</h3>
        {notasOrdenadas.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Sin notas todavía.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {notasOrdenadas.map(n => (
              <div key={n.id} className="rounded-[10px] border border-border bg-card p-2.5">
                <div className="text-[10px] text-muted-foreground truncate">{n.label}</div>
                <div className={cn("text-[18px] font-extrabold mt-0.5",
                  n.valor < 4 ? "text-status-red-text" : n.valor < 5.5 ? "text-status-amber-text" : "text-status-green-text"
                )}>
                  {n.valor.toFixed(1)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-[14px] border border-border bg-background p-4">
        <h3 className="text-[12.5px] font-extrabold flex items-center gap-2 mb-3">
          <Target className="h-3.5 w-3.5 text-primary" /> Rendimiento por OA
        </h3>
        {rendimientoPorOA.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">Aún no hay evaluaciones vinculadas a OAs.</p>
        ) : (
          <div className="space-y-2.5">
            {rendimientoPorOA.map(item => {
              const color = item.promedio < 4
                ? "bg-status-red-text"
                : item.promedio < 5.5 ? "bg-status-amber-text" : "bg-status-green-text"
              return (
                <div key={item.oaId} className="rounded-[10px] border border-border bg-card p-3">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-bold">{item.oaId}</div>
                      <div className="truncate text-[10.5px] text-muted-foreground">{item.evaluaciones.join(", ")}</div>
                    </div>
                    <span className={cn("text-[14px] font-extrabold",
                      item.promedio < 4 ? "text-status-red-text" : item.promedio < 5.5 ? "text-status-amber-text" : "text-status-green-text"
                    )}>
                      {item.promedio.toFixed(1)}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", color)}
                      style={{ width: `${Math.min(100, Math.max(0, (item.promedio / 7) * 100))}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function AsistenciaView({ est, libros }: { est: EstudianteVista; libros: LibroCurso[] }) {
  const items = [
    { icon: Users,           label: "Presentes",  value: est.asistencia.presente,  cls: "bg-status-green-bg text-status-green-text" },
    { icon: Activity,        label: "Ausentes",   value: est.asistencia.ausente,   cls: "bg-status-red-bg text-status-red-text" },
    { icon: ClipboardCheck,  label: "Atrasos",    value: est.asistencia.atraso,    cls: "bg-status-amber-bg text-status-amber-text" },
    { icon: BookOpen,        label: "Retiros",    value: est.asistencia.retirado,  cls: "bg-status-slate-bg text-status-slate-text" },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {items.map(it => {
          const Icon = it.icon
          return (
            <div key={it.label} className="rounded-[12px] border border-border bg-background p-3 flex items-center gap-3">
              <div className={cn("w-9 h-9 rounded-lg grid place-items-center", it.cls)}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">{it.label}</div>
                <div className="text-[16px] font-extrabold">{it.value}</div>
              </div>
            </div>
          )
        })}
      </div>

      <section className="rounded-[14px] border border-border bg-background p-4">
        <h3 className="text-[12.5px] font-extrabold mb-3">Distribución</h3>
        <BarrasAsistencia est={est} />
      </section>

      <section className="rounded-[14px] border border-border bg-background p-4">
        <h3 className="text-[12.5px] font-extrabold mb-3">Histórico</h3>
        <p className="text-[11.5px] text-muted-foreground">
          Total de jornadas registradas para este alumno: <strong>{libros.length}</strong>.
          Asistencia se calcula sobre el total de bloques registrados.
        </p>
      </section>
    </div>
  )
}

function ObservacionesView({
  observaciones, loading, showForm, onShowForm,
  newTexto, newTipo, onTextoChange, onTipoChange, onSave, onTemplate,
}: {
  observaciones: Observacion360[]
  loading: boolean
  showForm: boolean
  onShowForm: (v: boolean) => void
  newTexto: string
  newTipo: Observacion360["tipo"]
  onTextoChange: (v: string) => void
  onTipoChange: (t: Observacion360["tipo"]) => void
  onSave: () => void
  onTemplate: (t: { tipo: Observacion360["tipo"]; texto: string }) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <h3 className="text-[12.5px] font-extrabold">
          {observaciones.length} {observaciones.length === 1 ? "observación" : "observaciones"}
        </h3>
        <div className="flex items-center gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12px] font-semibold hover:border-primary">
                <ListChecks className="h-3.5 w-3.5" /> Plantilla
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-2" align="end">
              <p className="text-[11px] font-bold uppercase text-muted-foreground mb-1.5 px-1">Plantillas rápidas</p>
              <ul className="space-y-1 max-h-72 overflow-y-auto">
                {TEMPLATES_OBS.map((t, i) => {
                  const tipoInfo = OBS_TIPOS.find(x => x.key === t.tipo)
                  return (
                    <li key={i}>
                      <button
                        onClick={() => onTemplate(t)}
                        className="group w-full text-left rounded-md px-2 py-1.5 hover:bg-muted/50"
                      >
                        <span className={cn("inline-block rounded-full px-1.5 text-[9px] font-bold border mr-1.5", tipoInfo?.cls)}>
                          {tipoInfo?.label}
                        </span>
                        <span className="text-[11.5px] text-foreground">{t.texto}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </PopoverContent>
          </Popover>
          <button
            onClick={() => onShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva
          </button>
        </div>
      </div>

      {showForm && (
        <div className="rounded-[12px] border border-border bg-background p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {OBS_TIPOS.map(t => (
              <button
                key={t.key}
                onClick={() => onTipoChange(t.key)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-bold border transition-colors",
                  newTipo === t.key ? t.cls : "border-border text-muted-foreground hover:border-primary"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <textarea
            value={newTexto}
            onChange={e => onTextoChange(e.target.value)}
            placeholder="Escribe la observación..."
            rows={3}
            autoFocus
            className="w-full rounded-[10px] border border-border bg-card px-3 py-2.5 text-[12.5px] outline-none focus:border-primary"
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => onShowForm(false)}
              className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted/40"
            >
              Cancelar
            </button>
            <button
              onClick={onSave}
              disabled={!newTexto.trim()}
              className="rounded-[10px] bg-primary px-4 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              Guardar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : observaciones.length === 0 ? (
        <p className="text-[12.5px] text-muted-foreground text-center py-6 italic">
          Sin observaciones registradas.
        </p>
      ) : (
        <ul className="space-y-2">
          {observaciones.map(obs => {
            const tipoInfo = OBS_TIPOS.find(t => t.key === obs.tipo) || OBS_TIPOS[3]
            return (
              <li key={obs.id} className="rounded-[12px] border border-border bg-background p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold border", tipoInfo.cls)}>
                    {tipoInfo.label}
                  </span>
                  <span className="text-[10.5px] text-muted-foreground">{obs.fecha}</span>
                </div>
                <p className="text-[12.5px] leading-relaxed">{obs.texto}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function PieView({ est }: { est: EstudianteVista }) {
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-[12px] bg-status-pie-bg/30 border border-status-pie-border/50 p-3">
          <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Diagnóstico</div>
          <div className="text-[14px] font-bold">{est.pieDiagnostico || "No especificado"}</div>
        </div>
        <div className="rounded-[12px] bg-status-pie-bg/30 border border-status-pie-border/50 p-3">
          <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Especialista</div>
          <div className="text-[14px] font-bold">{est.pieEspecialista || "No asignado"}</div>
        </div>
      </div>
      {est.pieNotas && (
        <div className="rounded-[12px] bg-status-pie-bg/30 border border-status-pie-border/50 p-3">
          <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Notas de adecuación</div>
          <p className="text-[12.5px] leading-relaxed whitespace-pre-line">{est.pieNotas}</p>
        </div>
      )}
    </div>
  )
}

function CompararCard({ est }: { est: EstudianteVista }) {
  return (
    <div className="rounded-[12px] border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Avatar className="h-9 w-9">
          <AvatarFallback className="bg-pink-light text-primary text-[11px] font-bold">
            {getInitials(est.nombre)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold truncate">{est.nombre}</div>
          {est.pie && <Badge variant="outline" className="text-[9px]">PIE</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-[8px] bg-background p-2">
          <div className="text-[9px] text-muted-foreground">Promedio</div>
          <div className="text-[16px] font-extrabold">{est.promedio?.toFixed(1) ?? "—"}</div>
        </div>
        <div className="rounded-[8px] bg-background p-2">
          <div className="text-[9px] text-muted-foreground">Asistencia</div>
          <div className="text-[16px] font-extrabold">{est.porcentajeAsistencia != null ? `${est.porcentajeAsistencia}%` : "—"}</div>
        </div>
      </div>
      {Object.keys(est.notas).length >= 2 && (
        <div className="rounded-[8px] bg-background p-2">
          <div className="text-[9px] text-muted-foreground mb-1">Tendencia</div>
          <MiniSparkline notas={est.notas} width={200} height={40} showLabels={false} />
        </div>
      )}
    </div>
  )
}

function BarrasAsistencia({ est }: { est: EstudianteVista }) {
  const total = est.asistencia.presente + est.asistencia.ausente + est.asistencia.atraso + est.asistencia.retirado
  if (total === 0) return <p className="text-[12px] text-muted-foreground">Sin registros aún.</p>
  const items = [
    { label: "Presentes", value: est.asistencia.presente, cls: "bg-emerald-500" },
    { label: "Ausentes",  value: est.asistencia.ausente,  cls: "bg-rose-500" },
    { label: "Atrasos",   value: est.asistencia.atraso,   cls: "bg-amber-500" },
    { label: "Retiros",   value: est.asistencia.retirado, cls: "bg-slate-400" },
  ]
  return (
    <>
      <div className="h-3 flex w-full overflow-hidden rounded-full">
        {items.map(it => (
          <div key={it.label} className={cn("h-full", it.cls)} style={{ width: `${(it.value / total) * 100}%` }} title={`${it.label}: ${it.value}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px]">
        {items.map(it => (
          <span key={it.label} className="inline-flex items-center gap-1">
            <span className={cn("inline-block h-2 w-2 rounded-full", it.cls)} />
            <span className="text-muted-foreground">{it.label}: {it.value}</span>
          </span>
        ))}
      </div>
    </>
  )
}
