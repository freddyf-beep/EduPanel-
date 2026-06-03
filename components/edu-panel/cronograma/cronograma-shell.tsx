"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Calendar, CalendarDays, Clock, Filter, LayoutGrid, List,
  Loader2, Check, X, ArrowRight, BookOpen, Zap, Search, Pin, Activity, Layers,
  Flame, Sparkles, BarChart3, Target, MoreHorizontal, GripVertical, Grid3x3, Eye,
  GanttChart, ChevronDown, Download, FileText,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { guardarCronograma, cargarCronograma, cargarPlanCurso } from "@/lib/curriculo"
import type { ActividadCronograma } from "@/lib/curriculo"
import { buildUrl, UNIT_COLORS, withAsignatura, normalizeKeyPart } from "@/lib/shared"
import { cargarHorarioSemanal, ClaseHorario, esTipoLibre } from "@/lib/horario"
import { useIsMobile } from "@/components/ui/use-mobile"
import { useActiveSubject } from "@/hooks/use-active-subject"
import {
  Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Badge } from "@/components/ui/badge"

type ViewMode = "semana" | "mes" | "dia" | "list" | "gantt" | "heatmap"
const VIEWS: { key: ViewMode; label: string; icon: typeof Calendar; key_short: string }[] = [
  { key: "semana",  label: "Semana",  icon: LayoutGrid, key_short: "S" },
  { key: "mes",     label: "Mes",     icon: Grid3x3,    key_short: "M" },
  { key: "dia",     label: "Día",     icon: CalendarDays, key_short: "D" },
  { key: "list",    label: "Lista",   icon: List,       key_short: "L" },
  { key: "gantt",   label: "Gantt",   icon: GanttChart, key_short: "G" },
  { key: "heatmap", label: "Heatmap", icon: BarChart3,  key_short: "H" },
]

const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
const DIAS_MES = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DIAS_MAP: Record<string, number> = { Lunes:1, Martes:2, "Miércoles":3, Jueves:4, Viernes:5 }
const DIAS_BY_INDEX: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes" }

const FILTRO_KEY = "edupanel_cronograma_v2_filtro"

function pad(n: number) { return n < 10 ? `0${n}` : `${n}` }
function getLunes(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}
function getFechaReal(lunes: Date, diaNombre: string): Date {
  const offset = (DIAS_MAP[diaNombre] ?? 1) - 1
  const d = new Date(lunes)
  d.setDate(d.getDate() + offset)
  return d
}
function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function semanaLabel(lunes: Date): string {
  const viernes = new Date(lunes); viernes.setDate(viernes.getDate() + 4)
  return `${lunes.getDate()} – ${viernes.getDate()} ${MESES[viernes.getMonth()]}`
}

/**
 * Número de semana ISO 8601. La semana 1 es la que contiene el primer jueves del año.
 * Es el estándar que usa Google Calendar, planillas ministeriales, etc.
 */
function weekNumber(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  // Ajustar al jueves más cercano: semana actual empieza el lunes
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}

/**
 * Lunes de la semana ISO N del año (inverso de weekNumber ISO).
 */
function getLunesDeSemana(weekNum: number, year: number): Date {
  // Enero 4 siempre está en la semana 1 ISO
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  // Lunes de la semana 1
  const mondayWeek1 = new Date(jan4)
  mondayWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1)
  // Lunes de la semana N
  const target = new Date(mondayWeek1)
  target.setUTCDate(mondayWeek1.getUTCDate() + (weekNum - 1) * 7)
  return new Date(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
}

function parseDuracion(s: string): number {
  if (!s) return 45
  const m = s.match(/([\d.]+)\s*(min|h)?/i)
  if (!m) return 45
  const n = parseFloat(m[1])
  return /h/i.test(m[2] || "") ? Math.round(n * 60) : Math.round(n)
}
function minutesFromHHMM(value: string): number {
  const [h, m] = (value || "08:30").split(":").map(Number)
  return (Number.isFinite(h) ? h : 8) * 60 + (Number.isFinite(m) ? m : 30)
}

// ─── Exportación ICS y CSV ───────────────────────────────────────────────────

function fechaICS(d: Date): string {
  const y = d.getFullYear()
  const mo = pad(d.getMonth() + 1)
  const da = pad(d.getDate())
  const h = pad(d.getHours())
  const mi = pad(d.getMinutes())
  return `${y}${mo}${da}T${h}${mi}00`
}

function escapeICS(s: string): string {
  return (s || "").replace(/[\\,;]/g, m => "\\" + m).replace(/\n/g, "\\n")
}

function actividadesToICS(actividades: ActividadCronograma[], year: number, asignatura: string): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EduPanel//Cronograma//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]
  for (const act of actividades) {
    const lunes = getLunesDeSemana(act.semana, year)
    const fecha = getFechaReal(lunes, act.dia)
    const [hh, mm] = (act.hora || "08:30").split(":").map(n => parseInt(n, 10) || 0)
    const start = new Date(fecha); start.setHours(hh, mm, 0, 0)
    const end = new Date(start.getTime() + parseDuracion(act.duracion) * 60_000)
    const cursoLabel = act.cursoOrigen ? ` · ${act.cursoOrigen}` : ""
    lines.push(
      "BEGIN:VEVENT",
      `UID:${act.id}@edupanel`,
      `DTSTAMP:${fechaICS(new Date())}`,
      `DTSTART:${fechaICS(start)}`,
      `DTEND:${fechaICS(end)}`,
      `SUMMARY:${escapeICS(act.nombre)}`,
      `DESCRIPTION:${escapeICS(`EduPanel · ${asignatura}${cursoLabel}\nUnidad: ${act.unidad || "-"}`)}`,
      `CATEGORIES:${escapeICS(act.tipo)}`,
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}

function actividadesToCSV(actividades: ActividadCronograma[], year: number): string {
  const DIAS_MAP_CSV: Record<string, number> = { Lunes:1, Martes:2, "Miércoles":3, Jueves:4, Viernes:5 }
  const headers = ["Semana", "Curso", "Día", "Fecha", "Hora", "Duración", "Tipo", "Unidad", "Actividad"]
  const rows: string[][] = [headers]
  const sorted = [...actividades].sort((a, b) =>
    (a.semana - b.semana) || (DIAS_MAP_CSV[a.dia] || 0) - (DIAS_MAP_CSV[b.dia] || 0) || a.hora.localeCompare(b.hora)
  )
  for (const act of sorted) {
    const lunes = getLunesDeSemana(act.semana, year)
    const fecha = getFechaReal(lunes, act.dia)
    rows.push([
      String(act.semana),
      act.cursoOrigen || "",
      act.dia,
      `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}/${fecha.getFullYear()}`,
      act.hora,
      act.duracion,
      act.tipo,
      act.unidad || "",
      act.nombre,
    ])
  }
  return rows.map(r => r.map(cell => {
    const s = String(cell ?? "")
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(",")).join("\r\n")
}

function descargarArchivo(contenido: string, nombre: string, mime: string) {
  const blob = new Blob([contenido], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = nombre
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 5_000)
}

interface FiltroState {
  cursos: string[]
  unidades: string[]
}

interface UnidadInfo {
  id: string
  nombre: string
  color: string
  curso: string
}

export function CronogramaShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const isMobile = useIsMobile()

  const vistaParam = (searchParams.get("vista") as ViewMode | null)
  const cursoParam = searchParams.get("curso") || ""
  const [vista, setVista] = useState<ViewMode>(vistaParam ?? "semana")

  const [curso, setCurso] = useState(cursoParam)
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [horario, setHorario] = useState<ClaseHorario[]>([])
  const [actividades, setActividades] = useState<ActividadCronograma[]>([])
  const [unidadesDisponibles, setUnidadesDisponibles] = useState<UnidadInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const [currentDate, setCurrentDate] = useState(new Date())
  const [openCommand, setOpenCommand] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingActividad, setEditingActividad] = useState<ActividadCronograma | null>(null)

  const [filtros, setFiltros] = useState<FiltroState>({ cursos: [], unidades: [] })
  const [hydrated, setHydrated] = useState(false)
  const [draggingActividad, setDraggingActividad] = useState<ActividadCronograma | null>(null)

  const ignoreNextSaveRef = useRef(true)

  useEffect(() => { setVista(vistaParam ?? "semana") }, [vistaParam])

  const goToVista = useCallback((v: ViewMode) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("vista", v)
    router.replace(`/cronograma?${params.toString()}`, { scroll: false })
    setVista(v)
  }, [router, searchParams])

  // localStorage filtros
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(FILTRO_KEY)
      if (raw) setFiltros(JSON.parse(raw))
    } catch { /* noop */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(FILTRO_KEY, JSON.stringify(filtros)) } catch { /* noop */ }
  }, [filtros, hydrated])

  // Cargar cursos: solo bloques académicos (excluye almuerzo, recreo, planificación, libre).
  useEffect(() => {
    cargarHorarioSemanal().then(h => {
      setHorario(h)
      const unique = Array.from(new Set(
        h.filter(x => !esTipoLibre(x.tipo)).map(x => x.resumen.trim()).filter(Boolean)
      ))
      setCursosDisponibles(unique)
      if (!curso) setCurso("__todos__")
    })
  }, [curso])

  // Cargar cronograma + plan de unidades de UN curso o de TODOS
  useEffect(() => {
    if (!curso || cursosDisponibles.length === 0) return
    setLoading(true)
    const cursosACargar = curso === "__todos__" ? cursosDisponibles : [curso]

    Promise.all(cursosACargar.flatMap(c => [
      cargarCronograma(ASIGNATURA, c).then(crono => ({ curso: c, crono })),
      cargarPlanCurso(ASIGNATURA, c).then(plan => ({ curso: c, plan })),
    ])).then((results) => {
      const todasActividades: ActividadCronograma[] = []
      const todasUnidades: UnidadInfo[] = []
      cursosACargar.forEach(c => {
        const cronoRes = results.find(r => "crono" in r && r.curso === c) as { curso: string; crono: any } | undefined
        const planRes = results.find(r => "plan" in r && r.curso === c) as { curso: string; plan: any } | undefined
        const acts = cronoRes?.crono?.actividades || []
        // Etiquetar con cursoOrigen para que sepamos de qué curso viene cada actividad
        acts.forEach((a: ActividadCronograma) => todasActividades.push({ ...a, cursoOrigen: a.cursoOrigen || c }))
        const units = planRes?.plan?.units || []
        units.forEach((u: any, idx: number) => todasUnidades.push({
          id: u.unidadCurricularId || normalizeKeyPart(u.name || `unidad_${idx + 1}`),
          nombre: u.name || `Unidad ${idx + 1}`,
          color: u.color || UNIT_COLORS[idx % UNIT_COLORS.length],
          curso: c,
        }))
      })
      setActividades(todasActividades)
      setUnidadesDisponibles(todasUnidades)
    }).catch(console.error).finally(() => {
      setLoading(false)
      ignoreNextSaveRef.current = true
    })
  }, [curso, ASIGNATURA])

  // Autosave (en modo "Todos" guarda agrupando por cursoOrigen)
  const handleGuardar = useCallback(async () => {
    if (!curso) return
    setSaving(true); setSaveStatus("saving")
    try {
      if (curso === "__todos__") {
        const grupos = new Map<string, ActividadCronograma[]>()
        cursosDisponibles.forEach(c => grupos.set(c, []))
        actividades.forEach(a => {
          const c = a.cursoOrigen || cursosDisponibles[0]
          if (!c) return
          const lista = grupos.get(c) || []
          // Quitar el cursoOrigen al persistir (no se guarda según el contrato del v1)
          const { cursoOrigen, ...rest } = a as any
          lista.push(rest)
          grupos.set(c, lista)
        })
        await Promise.all(Array.from(grupos.entries()).map(([c, acts]) => guardarCronograma(ASIGNATURA, c, acts)))
      } else {
        const limpias = actividades.map(a => {
          const { cursoOrigen, ...rest } = a as any
          return rest as ActividadCronograma
        })
        await guardarCronograma(ASIGNATURA, curso, limpias)
      }
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 2500)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 5000)
    } finally {
      setSaving(false)
    }
  }, [ASIGNATURA, curso, actividades, cursosDisponibles])

  useEffect(() => {
    if (loading || !curso) return
    if (ignoreNextSaveRef.current) { ignoreNextSaveRef.current = false; return }
    setSaveStatus("saving")
    const t = setTimeout(() => handleGuardar(), 2500)
    return () => clearTimeout(t)
  }, [actividades, loading, curso, handleGuardar])

  // Atajos teclado: S/M/D/L/G/H + Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      if (e.key === "k" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        setOpenCommand(true)
        return
      }
      const v = VIEWS.find(view => view.key_short.toLowerCase() === e.key.toLowerCase())
      if (v) {
        e.preventDefault()
        goToVista(v.key)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goToVista])

  // Filtrado
  const actividadesFiltradas = useMemo(() => {
    let lista = actividades
    if (filtros.cursos.length > 0) {
      // En modo "Todos", filtramos por cursoOrigen; en modo curso especifico no aplica
      lista = lista.filter(a => filtros.cursos.includes(a.cursoOrigen || ""))
    }
    if (filtros.unidades.length > 0) {
      lista = lista.filter(a => filtros.unidades.includes(a.unidad || ""))
    }
    return lista
  }, [actividades, filtros])

  // Stats globales
  const stats = useMemo(() => {
    const total = actividadesFiltradas.length
    const porUnidad = new Map<string, number>()
    actividadesFiltradas.forEach(a => {
      const u = a.unidad || "(sin unidad)"
      porUnidad.set(u, (porUnidad.get(u) || 0) + 1)
    })
    return { total, porUnidad }
  }, [actividadesFiltradas])

  const updateActividad = (next: ActividadCronograma) => {
    setActividades(prev => {
      const idx = prev.findIndex(a => a.id === next.id)
      if (idx === -1) return [...prev, next]
      const copy = [...prev]
      copy[idx] = next
      return copy
    })
  }

  const eliminarActividad = (id: string) => {
    setActividades(prev => prev.filter(a => a.id !== id))
  }

  const colorDeUnidad = (unidadId?: string): string => {
    if (!unidadId) return "var(--muted)"
    const found = unidadesDisponibles.find(u => u.id === unidadId)
    return found?.color || "var(--primary)"
  }

  const nombreUnidad = (unidadId?: string): string => {
    if (!unidadId) return "Sin unidad"
    const found = unidadesDisponibles.find(u => u.id === unidadId)
    return found?.nombre || unidadId
  }

  const lunesActual = useMemo(() => getLunes(currentDate), [currentDate])
  const semana = useMemo(() => weekNumber(currentDate), [currentDate])

  return (
    <div className="mx-auto max-w-[1500px] px-3 sm:px-5 pb-10">
      {/* Hero */}
      <div className="mb-5 grid gap-3 lg:grid-cols-[1.6fr_1fr]">
        <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-cyan-500 via-blue-500 to-violet-500 px-6 py-6 text-white">
          <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-[11px] font-bold opacity-90 inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" /> CRONOGRAMA · BETA
            </div>
            <h1 className="mt-1 text-[22px] sm:text-[26px] font-extrabold leading-tight">
              Tu mapa pedagógico del año
            </h1>
            <p className="mt-1 text-[12.5px] text-white/85">
              {ASIGNATURA} · {curso === "__todos__" ? "Todos los cursos" : (curso || "—")} · Semana {semana} · {currentDate.getFullYear()}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                value={curso}
                onChange={e => setCurso(e.target.value)}
                className="rounded-[10px] bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur outline-none [&>option]:text-foreground"
              >
                <option value="__todos__">📚 Todos los cursos</option>
                {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
              </select>

              {/* Scrubber semanas */}
              <div className="inline-flex items-center gap-1 rounded-[10px] bg-white/15 backdrop-blur px-1 py-0.5">
                <button onClick={() => setCurrentDate(d => { const x = new Date(d); x.setDate(x.getDate() - 7); return x })} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/15">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 text-[11.5px] font-bold">{semanaLabel(lunesActual)}</span>
                <button onClick={() => setCurrentDate(d => { const x = new Date(d); x.setDate(x.getDate() + 7); return x })} className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/15">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <button
                onClick={() => setCurrentDate(new Date())}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur hover:bg-white/25"
              >
                Hoy
              </button>

              <button
                onClick={() => setOpenCommand(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-bold backdrop-blur hover:bg-white/25"
              >
                <Search className="h-3 w-3" /> Ctrl+K
              </button>

              <SaveBadge status={saveStatus} onSave={handleGuardar} />
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2.5">
          <KpiBox label="Actividades" value={stats.total.toString()} sub="totales" />
          <KpiBox label="Unidades" value={stats.porUnidad.size.toString()} sub="con actividades" />
          <KpiBox label="Cursos" value={cursosDisponibles.length.toString()} sub="en horario" />
          <KpiBox label="Semana" value={`${semana}`} sub={currentDate.toLocaleDateString("es-CL", { month: "long", year: "numeric" })} />
        </div>
      </div>

      {/* Filtros sticky */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-card p-2">
        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-semibold hover:border-primary">
              <Filter className="h-3 w-3" />
              Curso {filtros.cursos.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-1">{filtros.cursos.length}</Badge>}
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">Cursos</span>
              {filtros.cursos.length > 0 && (
                <button onClick={() => setFiltros(f => ({ ...f, cursos: [] }))} className="text-[10.5px] text-muted-foreground hover:text-foreground">limpiar</button>
              )}
            </div>
            <ul className="space-y-0.5 max-h-60 overflow-y-auto">
              {cursosDisponibles.map(c => (
                <li key={c}>
                  <button
                    onClick={() => setFiltros(f => ({ ...f, cursos: f.cursos.includes(c) ? f.cursos.filter(x => x !== c) : [...f.cursos, c] }))}
                    className="w-full text-left rounded-md px-2 py-1 text-[12px] hover:bg-muted/50 flex items-center gap-2"
                  >
                    <span className={cn("inline-flex h-3 w-3 items-center justify-center rounded border", filtros.cursos.includes(c) ? "bg-primary border-primary text-white" : "border-border")}>
                      {filtros.cursos.includes(c) && <Check className="h-2.5 w-2.5" />}
                    </span>
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11.5px] font-semibold hover:border-primary">
              <Layers className="h-3 w-3" />
              Unidad {filtros.unidades.length > 0 && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 ml-1">{filtros.unidades.length}</Badge>}
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">Unidades</span>
              {filtros.unidades.length > 0 && (
                <button onClick={() => setFiltros(f => ({ ...f, unidades: [] }))} className="text-[10.5px] text-muted-foreground hover:text-foreground">limpiar</button>
              )}
            </div>
            <ul className="space-y-0.5 max-h-60 overflow-y-auto">
              {unidadesDisponibles.map(u => (
                <li key={u.id}>
                  <button
                    onClick={() => setFiltros(f => ({ ...f, unidades: f.unidades.includes(u.id) ? f.unidades.filter(x => x !== u.id) : [...f.unidades, u.id] }))}
                    className="w-full text-left rounded-md px-2 py-1 text-[12px] hover:bg-muted/50 flex items-center gap-2"
                  >
                    <span className={cn("inline-flex h-3 w-3 items-center justify-center rounded border", filtros.unidades.includes(u.id) ? "bg-primary border-primary text-white" : "border-border")}>
                      {filtros.unidades.includes(u.id) && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: u.color }} />
                    <span className="truncate">{u.nombre}</span>
                  </button>
                </li>
              ))}
              {unidadesDisponibles.length === 0 && (
                <li className="text-[11px] text-muted-foreground italic px-2 py-1">No hay unidades planificadas en este curso.</li>
              )}
            </ul>
          </PopoverContent>
        </Popover>

        {(filtros.cursos.length > 0 || filtros.unidades.length > 0) && (
          <button
            onClick={() => setFiltros({ cursos: [], unidades: [] })}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:border-primary"
          >
            <X className="h-3 w-3" /> Limpiar todo
          </button>
        )}

        <span className="ml-auto text-[10.5px] text-muted-foreground italic">
          Atajos: <kbd className="rounded bg-muted px-1">S</kbd>/<kbd className="rounded bg-muted px-1">M</kbd>/<kbd className="rounded bg-muted px-1">D</kbd>/<kbd className="rounded bg-muted px-1">L</kbd>/<kbd className="rounded bg-muted px-1">G</kbd>/<kbd className="rounded bg-muted px-1">H</kbd> vistas
        </span>
      </div>

      {/* Switch de vistas */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 bg-background/85 px-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
          {VIEWS.map(v => {
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
                title={`Vista ${v.label} (atajo ${v.key_short})`}
              >
                <Icon className="h-3.5 w-3.5" />
                {v.label}
                <kbd className="ml-1 rounded bg-muted px-1 text-[9px]">{v.key_short}</kbd>
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
        </div>
      ) : (
        <>
          {vista === "semana" && (
            <SemanaView
              lunes={lunesActual}
              semana={semana}
              actividades={actividadesFiltradas}
              horario={horario.filter(h => !esTipoLibre(h.tipo) && (curso === "__todos__" || h.resumen === curso))}
              colorUnidad={colorDeUnidad}
              nombreUnidad={nombreUnidad}
              draggingActividad={draggingActividad}
              onDragStart={setDraggingActividad}
              onDragEnd={() => setDraggingActividad(null)}
              onDropDay={(actividad, nuevoDia) => updateActividad({ ...actividad, dia: nuevoDia })}
              onEdit={(act) => { setEditingActividad(act); setEditorOpen(true) }}
              onCreate={(dia, hora) => {
                const u = unidadesDisponibles[0]
                const cursoNueva = curso === "__todos__" ? (cursosDisponibles[0] || "") : curso
                const nueva: ActividadCronograma = {
                  id: `act_${Date.now()}`,
                  semana,
                  dia,
                  hora,
                  duracion: "45 min",
                  nombre: "Nueva actividad",
                  tipo: "actividad",
                  unidad: u?.id || "",
                  color: u?.color || "var(--primary)",
                  cursoOrigen: curso === "__todos__" ? cursoNueva : undefined,
                }
                setEditingActividad(nueva); setEditorOpen(true)
              }}
            />
          )}

          {vista === "mes" && (
            <MesView
              date={currentDate}
              actividades={actividadesFiltradas}
              colorUnidad={colorDeUnidad}
              onSelectDay={(d) => { setCurrentDate(d); goToVista("dia") }}
              onChangeMonth={(delta) => setCurrentDate(d => {
                const x = new Date(d); x.setMonth(x.getMonth() + delta); return x
              })}
            />
          )}

          {vista === "dia" && (
            <DiaView
              date={currentDate}
              actividades={actividadesFiltradas}
              horario={horario.filter(h => !esTipoLibre(h.tipo) && (curso === "__todos__" || h.resumen === curso))}
              colorUnidad={colorDeUnidad}
              nombreUnidad={nombreUnidad}
              onEdit={(act) => { setEditingActividad(act); setEditorOpen(true) }}
            />
          )}

          {vista === "list" && (
            <ListaView
              actividades={actividadesFiltradas}
              colorUnidad={colorDeUnidad}
              nombreUnidad={nombreUnidad}
              onEdit={(act) => { setEditingActividad(act); setEditorOpen(true) }}
              onDelete={eliminarActividad}
              currentYear={currentDate.getFullYear()}
            />
          )}

          {vista === "gantt" && (
            <GanttView
              actividades={actividadesFiltradas}
              unidades={unidadesDisponibles}
              currentYear={currentDate.getFullYear()}
            />
          )}

          {vista === "heatmap" && (
            <HeatmapView
              date={currentDate}
              actividades={actividadesFiltradas}
              onChangeMonth={(delta) => setCurrentDate(d => {
                const x = new Date(d); x.setMonth(x.getMonth() + delta); return x
              })}
            />
          )}
        </>
      )}

      <div className="mt-6 mb-4 flex items-center justify-center gap-3">
        {actividadesFiltradas.length > 0 && (
          <>
            <button
              onClick={() => {
                const year = currentDate.getFullYear()
                const sufijo = curso === "__todos__" ? "todos" : curso.replace(/\s+/g, "_")
                const ics = actividadesToICS(actividadesFiltradas, year, ASIGNATURA)
                descargarArchivo(ics, `cronograma_${ASIGNATURA}_${sufijo}.ics`, "text/calendar")
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-primary hover:text-foreground"
              title="Exportar a Google Calendar / iPhone"
            >
              <CalendarDays className="h-3.5 w-3.5" /> Exportar .ics
            </button>
            <button
              onClick={() => {
                const year = currentDate.getFullYear()
                const sufijo = curso === "__todos__" ? "todos" : curso.replace(/\s+/g, "_")
                const csv = actividadesToCSV(actividadesFiltradas, year)
                descargarArchivo(csv, `cronograma_${ASIGNATURA}_${sufijo}.csv`, "text/csv")
              }}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-primary hover:text-foreground"
              title="Exportar planilla CSV"
            >
              <FileText className="h-3.5 w-3.5" /> Exportar .csv
            </button>
          </>
        )}
      </div>

      {/* Command palette */}
      <CommandDialog open={openCommand} onOpenChange={setOpenCommand}>
        <CommandInput placeholder="Buscar actividad por nombre…" />
        <CommandList>
          <CommandEmpty>Sin coincidencias.</CommandEmpty>
          <CommandGroup heading="Cambiar vista">
            {VIEWS.map(v => {
              const Icon = v.icon
              return (
                <CommandItem key={v.key} value={`Vista ${v.label}`} onSelect={() => { setOpenCommand(false); goToVista(v.key) }}>
                  <Icon className="h-4 w-4" /> Vista {v.label} <kbd className="ml-auto rounded bg-muted px-1 text-[10px]">{v.key_short}</kbd>
                </CommandItem>
              )
            })}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actividades">
            {actividadesFiltradas.slice(0, 20).map(act => (
              <CommandItem
                key={act.id}
                value={`${act.nombre} ${act.dia} ${act.hora}`}
                onSelect={() => { setOpenCommand(false); setEditingActividad(act); setEditorOpen(true) }}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorDeUnidad(act.unidad) }} />
                <span className="truncate">{act.nombre}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">Sem {act.semana} · {act.dia.slice(0,3)} {act.hora}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {/* Editor */}
      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editingActividad?.nombre || "Editar actividad"}</SheetTitle>
          </SheetHeader>
          {editingActividad && (
            <EditorActividad
              actividad={editingActividad}
              unidades={unidadesDisponibles}
              cursosDisponibles={cursosDisponibles}
              modoTodos={curso === "__todos__"}
              onChange={(next) => setEditingActividad(next)}
              onSave={() => {
                if (editingActividad) updateActividad(editingActividad)
                setEditorOpen(false)
              }}
              onDelete={() => {
                if (editingActividad) eliminarActividad(editingActividad.id)
                setEditorOpen(false)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function KpiBox({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-[20px] font-extrabold leading-none">{value}</div>
      <div className="text-[10px] text-muted-foreground mt-1 capitalize">{sub}</div>
    </div>
  )
}

function SaveBadge({ status, onSave }: { status: "idle"|"saving"|"saved"|"error"; onSave: () => void }) {
  return (
    <div className="ml-auto inline-flex items-center gap-2">
      {status === "saving" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" /> Guardando
        </span>
      )}
      {status === "saved" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/40 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          <Check className="h-3 w-3" /> Guardado
        </span>
      )}
      {status === "error" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/40 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">Error</span>
      )}
      <button onClick={onSave} className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold backdrop-blur hover:bg-white/30">
        Guardar
      </button>
    </div>
  )
}

interface SemanaViewProps {
  lunes: Date
  semana: number
  actividades: ActividadCronograma[]
  horario: ClaseHorario[]
  colorUnidad: (id?: string) => string
  nombreUnidad: (id?: string) => string
  draggingActividad: ActividadCronograma | null
  onDragStart: (act: ActividadCronograma) => void
  onDragEnd: () => void
  onDropDay: (act: ActividadCronograma, nuevoDia: string) => void
  onEdit: (act: ActividadCronograma) => void
  onCreate: (dia: string, hora: string) => void
}

function SemanaView({ lunes, semana, actividades, horario, colorUnidad, nombreUnidad, draggingActividad, onDragStart, onDragEnd, onDropDay, onEdit, onCreate }: SemanaViewProps) {
  const actividadesSemana = actividades.filter(a => a.semana === semana)
  const horasInicio = horario.length > 0 ? Math.min(...horario.map(h => minutesFromHHMM(h.horaInicio))) : 8 * 60
  const horasFin = horario.length > 0 ? Math.max(...horario.map(h => minutesFromHHMM(h.horaFin))) : 17 * 60

  return (
    <div className="grid gap-3 lg:grid-cols-5">
      {DIAS_SEMANA.map(dia => {
        const fecha = getFechaReal(lunes, dia)
        const isHoy = dateKey(fecha) === dateKey(new Date())
        const actividadesDelDia = actividadesSemana.filter(a => a.dia === dia)
        const bloquesDia = horario.filter(h => h.dia === dia).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
        return (
          <div
            key={dia}
            onDragOver={(e) => { if (draggingActividad) e.preventDefault() }}
            onDrop={() => { if (draggingActividad) { onDropDay(draggingActividad, dia); onDragEnd() } }}
            className={cn(
              "rounded-[14px] border bg-card overflow-hidden transition-colors min-h-[200px]",
              isHoy ? "border-primary border-2" : "border-border",
              draggingActividad && "border-dashed"
            )}
          >
            {/* Encabezado del día con botón + Agregar siempre visible */}
            <div className={cn("border-b border-border px-3 py-2 flex items-center justify-between", isHoy && "bg-pink-light")}>
              <div>
                <div className={cn("text-[11px] font-bold uppercase", isHoy ? "text-primary" : "text-muted-foreground")}>{dia}</div>
                <div className={cn("text-[15px] font-extrabold", isHoy && "text-primary")}>{fecha.getDate()}</div>
              </div>
              <button
                onClick={() => onCreate(dia, "08:30")}
                className="rounded-full border border-border bg-background w-6 h-6 flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary text-[14px] font-bold transition-colors"
                title={`Agregar actividad el ${dia}`}
              >
                +
              </button>
            </div>
            <div className="p-2 space-y-1.5">
              {bloquesDia.map(b => (
                <div key={b.uid} className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-[10.5px]">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-2.5 w-2.5" />
                    <span className="font-mono">{b.horaInicio}–{b.horaFin}</span>
                  </div>
                  <div className="font-bold mt-0.5 truncate">{b.resumen}</div>
                </div>
              ))}
              {actividadesDelDia.map(act => (
                <div
                  key={act.id}
                  className="group relative w-full rounded-[8px] border-l-4 bg-background hover:shadow-sm transition-shadow"
                  style={{ borderLeftColor: colorUnidad(act.unidad) }}
                >
                  <button
                    draggable
                    onDragStart={() => onDragStart(act)}
                    onDragEnd={onDragEnd}
                    onClick={() => onEdit(act)}
                    className="w-full text-left px-2 py-1.5 cursor-grab active:cursor-grabbing"
                  >
                    <div className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground">
                      <GripVertical className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
                      {act.hora} · {act.duracion}
                    </div>
                    <div className="text-[11.5px] font-bold mt-0.5 truncate">{act.nombre}</div>
                    {act.cursoOrigen && (
                      <div className="text-[9.5px] font-semibold text-primary truncate mt-0.5">📚 {act.cursoOrigen}</div>
                    )}
                    {act.unidad && (
                      <div className="text-[9.5px] text-muted-foreground truncate mt-0.5">{nombreUnidad(act.unidad)}</div>
                    )}
                  </button>
                  {/* Link "Ver clase" → /ver-unidad */}
                  {act.unidad && (
                    <Link
                      href={buildUrl("/ver-unidad", withAsignatura({
                        curso: act.cursoOrigen || "",
                        unidad: normalizeKeyPart(act.unidad),
                      }, ""))}
                      onClick={e => e.stopPropagation()}
                      className="absolute bottom-1.5 right-1.5 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-bold bg-muted text-muted-foreground hover:bg-primary hover:text-white transition-all"
                      title="Ver contenido de la unidad"
                    >
                      Ver clase <ArrowRight className="w-2.5 h-2.5" />
                    </Link>
                  )}
                </div>
              ))}
              {actividadesDelDia.length === 0 && bloquesDia.length === 0 && (
                <p className="text-[10px] text-muted-foreground italic px-1 py-2">Sin actividades</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MesView({ date, actividades, colorUnidad, onSelectDay, onChangeMonth }: {
  date: Date
  actividades: ActividadCronograma[]
  colorUnidad: (id?: string) => string
  onSelectDay: (d: Date) => void
  onChangeMonth: (delta: number) => void
}) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = firstDay.getDay()
  const offset = (startWeekday + 6) % 7

  const dias: { date: Date; weekday: number }[] = []
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dt = new Date(year, month, d)
    dias.push({ date: dt, weekday: dt.getDay() })
  }

  const actividadesPorFecha = useMemo(() => {
    const map = new Map<string, ActividadCronograma[]>()
    actividades.forEach(act => {
      const lunesAct = getLunesDeSemana(act.semana, year)
      const fecha = getFechaReal(lunesAct, act.dia)
      const k = dateKey(fecha)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(act)
    })
    return map
  }, [actividades, year])

  return (
    <div className="rounded-[16px] border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => onChangeMonth(-1)} className="rounded-md border border-border p-1.5 hover:bg-background">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="px-3 text-[15px] font-extrabold capitalize min-w-[160px] text-center">
            {MESES[month]} {year}
          </h2>
          <button onClick={() => onChangeMonth(1)} className="rounded-md border border-border p-1.5 hover:bg-background">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS_MES.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`pad-${i}`} className="aspect-square min-h-[80px]" />
        ))}
        {dias.map(d => {
          const k = dateKey(d.date)
          const actsDia = actividadesPorFecha.get(k) || []
          const isHoy = k === dateKey(new Date())
          const isWeekend = d.weekday === 0 || d.weekday === 6
          return (
            <button
              key={k}
              onClick={() => onSelectDay(d.date)}
              className={cn(
                "rounded-[8px] border p-1.5 text-left flex flex-col gap-0.5 min-h-[80px] hover:border-primary transition-colors",
                isHoy ? "border-primary border-2 bg-pink-light" : "border-border bg-background",
                isWeekend && "opacity-60"
              )}
            >
              <span className={cn("text-[11px] font-bold", isHoy && "text-primary")}>{d.date.getDate()}</span>
              {actsDia.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {actsDia.slice(0, 3).map(act => (
                    <span
                      key={act.id}
                      className="text-[9px] font-semibold px-1 py-0.5 rounded truncate text-white"
                      style={{ background: colorUnidad(act.unidad) }}
                      title={act.nombre}
                    >
                      {act.hora.slice(0, 5)} {act.nombre}
                    </span>
                  ))}
                  {actsDia.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{actsDia.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DiaView({ date, actividades, horario, colorUnidad, nombreUnidad, onEdit }: {
  date: Date
  actividades: ActividadCronograma[]
  horario: ClaseHorario[]
  colorUnidad: (id?: string) => string
  nombreUnidad: (id?: string) => string
  onEdit: (act: ActividadCronograma) => void
}) {
  const diaIdx = date.getDay()
  const diaNombre = DIAS_BY_INDEX[diaIdx]
  const semana = weekNumber(date)
  if (!diaNombre) {
    return (
      <div className="rounded-[16px] border border-dashed border-border bg-card p-10 text-center text-muted-foreground">
        Sábado/Domingo no tienen clases programadas. Selecciona un día laboral.
      </div>
    )
  }
  const actividadesDelDia = actividades.filter(a => a.dia === diaNombre && a.semana === semana)
    .sort((a, b) => a.hora.localeCompare(b.hora))
  const bloquesDelDia = horario.filter(h => h.dia === diaNombre).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))

  return (
    <div className="space-y-3">
      <div className="rounded-[14px] border border-border bg-card p-4">
        <h2 className="text-[14px] font-extrabold capitalize">
          {diaNombre} {date.getDate()} de {MESES[date.getMonth()].toLowerCase()}
        </h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Semana {semana} · {actividadesDelDia.length} actividad(es) · {bloquesDelDia.length} bloque(s)
        </p>
      </div>

      <div className="space-y-2">
        {bloquesDelDia.map(b => (
          <div key={b.uid} className="rounded-[12px] border border-border bg-card p-3 flex items-center gap-3">
            <div className="flex h-10 w-14 flex-shrink-0 items-center justify-center rounded-[8px] text-white font-bold text-[10px]" style={{ background: b.color }}>
              {b.horaInicio.slice(0, 5)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-extrabold truncate">{b.resumen}</div>
              <div className="text-[10.5px] text-muted-foreground">{b.horaInicio} – {b.horaFin}</div>
            </div>
            <Badge variant="outline" className="text-[9.5px]">Bloque del horario</Badge>
          </div>
        ))}
      </div>

      <div className="rounded-[14px] border border-border bg-card p-4">
        <h3 className="text-[12.5px] font-extrabold mb-3">Actividades del cronograma</h3>
        {actividadesDelDia.length === 0 ? (
          <p className="text-[12px] text-muted-foreground italic">Sin actividades planificadas para este día.</p>
        ) : (
          <ul className="space-y-2">
            {actividadesDelDia.map(act => (
              <li key={act.id}>
                <button
                  onClick={() => onEdit(act)}
                  className="w-full flex items-start gap-3 rounded-[10px] border border-border bg-background p-3 hover:border-primary text-left"
                >
                  <span className="inline-block h-10 w-1 rounded-full flex-shrink-0" style={{ background: colorUnidad(act.unidad) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-bold">{act.nombre}</div>
                    <div className="text-[10.5px] text-muted-foreground mt-0.5">
                      {act.hora} · {act.duracion} · {nombreUnidad(act.unidad)}
                      {act.cursoOrigen && <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-pink-light px-1.5 py-0.5 font-semibold text-primary">📚 {act.cursoOrigen}</span>}
                    </div>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function ListaView({ actividades, colorUnidad, nombreUnidad, onEdit, onDelete, currentYear }: {
  actividades: ActividadCronograma[]
  colorUnidad: (id?: string) => string
  nombreUnidad: (id?: string) => string
  onEdit: (act: ActividadCronograma) => void
  onDelete: (id: string) => void
  currentYear: number
}) {
  const sorted = [...actividades].sort((a, b) => {
    if (a.semana !== b.semana) return a.semana - b.semana
    const da = DIAS_MAP[a.dia] || 0
    const db = DIAS_MAP[b.dia] || 0
    if (da !== db) return da - db
    return a.hora.localeCompare(b.hora)
  })
  return (
    <div className="rounded-[14px] border border-border bg-card overflow-hidden">
      {sorted.length === 0 ? (
        <p className="text-[12px] text-muted-foreground italic p-8 text-center">Sin actividades en este filtro.</p>
      ) : (
        <ul className="divide-y divide-border">
          {sorted.map(act => {
            const lunes = getLunesDeSemana(act.semana, currentYear)
            const fecha = getFechaReal(lunes, act.dia)
            return (
              <li key={act.id} className="group hover:bg-background/50">
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <span className="inline-block h-8 w-1 rounded-full flex-shrink-0" style={{ background: colorUnidad(act.unidad) }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-bold truncate flex items-center gap-1.5">
                      {act.nombre}
                      {act.cursoOrigen && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-pink-light px-1.5 py-0 text-[9px] font-bold text-primary">📚 {act.cursoOrigen}</span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground">
                      Sem {act.semana} · {act.dia} {fecha.getDate()}/{fecha.getMonth() + 1} · {act.hora} · {act.duracion}
                      {act.unidad && <span> · {nombreUnidad(act.unidad)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onEdit(act)}
                    className="opacity-0 group-hover:opacity-100 rounded-md border border-border bg-card px-2 py-1 text-[10.5px] font-semibold hover:border-primary"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => onDelete(act.id)}
                    className="opacity-0 group-hover:opacity-100 text-[10.5px] text-rose-600 hover:underline"
                  >
                    Borrar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function GanttView({ actividades, unidades, currentYear }: {
  actividades: ActividadCronograma[]
  unidades: UnidadInfo[]
  currentYear: number
}) {
  // Calcular rango de semanas por unidad
  const rangos = useMemo(() => {
    const map = new Map<string, { min: number; max: number; count: number }>()
    actividades.forEach(act => {
      const u = act.unidad || "(sin unidad)"
      const cur = map.get(u) || { min: act.semana, max: act.semana, count: 0 }
      cur.min = Math.min(cur.min, act.semana)
      cur.max = Math.max(cur.max, act.semana)
      cur.count++
      map.set(u, cur)
    })
    return Array.from(map.entries()).map(([unidadId, r]) => {
      const u = unidades.find(x => x.id === unidadId)
      return { unidadId, nombre: u?.nombre || "(sin unidad)", color: u?.color || "var(--muted)", min: r.min, max: r.max, count: r.count }
    }).sort((a, b) => a.min - b.min)
  }, [actividades, unidades])

  if (rangos.length === 0) {
    return (
      <div className="rounded-[16px] border border-dashed border-border bg-card p-10 text-center text-muted-foreground text-[12.5px]">
        No hay actividades para visualizar el Gantt.
      </div>
    )
  }

  const totalSemanas = 52
  const minSem = Math.min(...rangos.map(r => r.min), 1)
  const maxSem = Math.max(...rangos.map(r => r.max), totalSemanas)
  const rango = maxSem - minSem + 1

  return (
    <div className="rounded-[16px] border border-border bg-card p-5">
      <h2 className="text-[14px] font-extrabold mb-1">Distribución de unidades en el año</h2>
      <p className="text-[11px] text-muted-foreground mb-4">
        Cada barra muestra el rango de semanas en que la unidad tiene actividades planificadas.
      </p>

      {/* Header con semanas */}
      <div className="flex items-center gap-2 mb-2">
        <div className="w-40 flex-shrink-0" />
        <div className="flex-1 flex">
          {Array.from({ length: rango }).map((_, i) => {
            const sem = minSem + i
            return (
              <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground border-l border-border first:border-l-0 py-0.5">
                {sem % 4 === 0 || i === 0 || i === rango - 1 ? sem : ""}
              </div>
            )
          })}
        </div>
      </div>

      <div className="space-y-2">
        {rangos.map(r => {
          const offsetPct = ((r.min - minSem) / rango) * 100
          const widthPct = ((r.max - r.min + 1) / rango) * 100
          return (
            <div key={r.unidadId} className="flex items-center gap-2">
              <div className="w-40 flex-shrink-0 truncate text-[11.5px] font-semibold flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm flex-shrink-0" style={{ background: r.color }} />
                {r.nombre}
              </div>
              <div className="flex-1 relative h-7 bg-muted/30 rounded-[6px] overflow-hidden border border-border">
                <div
                  className="absolute top-0 bottom-0 rounded-[5px] flex items-center justify-center text-white text-[10px] font-bold px-2"
                  style={{
                    left: `${offsetPct}%`,
                    width: `${widthPct}%`,
                    background: r.color,
                  }}
                >
                  Sem {r.min}–{r.max} · {r.count} act
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HeatmapView({ date, actividades, onChangeMonth }: {
  date: Date
  actividades: ActividadCronograma[]
  onChangeMonth: (delta: number) => void
}) {
  const year = date.getFullYear()
  const month = date.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = firstDay.getDay()
  const offset = (startWeekday + 6) % 7

  const dias: Date[] = []
  for (let d = 1; d <= lastDay.getDate(); d++) dias.push(new Date(year, month, d))

  const conteoPorFecha = useMemo(() => {
    const map = new Map<string, number>()
    actividades.forEach(act => {
      const lunesAct = getLunesDeSemana(act.semana, year)
      const fecha = getFechaReal(lunesAct, act.dia)
      const k = dateKey(fecha)
      map.set(k, (map.get(k) || 0) + 1)
    })
    return map
  }, [actividades, year])

  const max = Math.max(0, ...Array.from(conteoPorFecha.values()))

  return (
    <div className="rounded-[16px] border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => onChangeMonth(-1)} className="rounded-md border border-border p-1.5 hover:bg-background">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="px-3 text-[15px] font-extrabold capitalize min-w-[160px] text-center">
            {MESES[month]} {year}
          </h2>
          <button onClick={() => onChangeMonth(1)} className="rounded-md border border-border p-1.5 hover:bg-background">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="text-muted-foreground">Menos</span>
          <div className="flex">
            {[0, 0.25, 0.5, 0.75, 1].map(o => (
              <div key={o} className="h-3 w-4 first:rounded-l last:rounded-r" style={{ background: o === 0 ? "var(--muted)" : `rgba(236, 72, 153, ${o})` }} />
            ))}
          </div>
          <span className="text-muted-foreground">Más</span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {DIAS_MES.map(d => (
          <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
        ))}
        {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
        {dias.map(d => {
          const k = dateKey(d)
          const c = conteoPorFecha.get(k) || 0
          const intensity = max > 0 ? c / max : 0
          const bg = c === 0 ? "transparent" : `rgba(236, 72, 153, ${0.15 + intensity * 0.85})`
          return (
            <div
              key={k}
              className="aspect-square rounded-[6px] border border-border p-1 flex flex-col justify-between"
              style={{ background: bg }}
              title={`${d.getDate()}/${month + 1}: ${c} actividades`}
            >
              <span className="text-[10px] font-bold">{d.getDate()}</span>
              {c > 0 && <span className="text-[10px] font-extrabold text-right">{c}</span>}
            </div>
          )
        })}
      </div>

      <p className="mt-4 text-[11px] text-muted-foreground italic">
        Pinta más oscuro los días con más actividades. Útil para detectar semanas sobrecargadas.
      </p>
    </div>
  )
}

interface EditorActividadProps {
  actividad: ActividadCronograma
  unidades: UnidadInfo[]
  cursosDisponibles: string[]
  modoTodos: boolean
  onChange: (next: ActividadCronograma) => void
  onSave: () => void
  onDelete: () => void
}

function EditorActividad({ actividad, unidades, cursosDisponibles, modoTodos, onChange, onSave, onDelete }: EditorActividadProps) {
  const set = (key: keyof ActividadCronograma, value: any) => onChange({ ...actividad, [key]: value })
  // Filtrar unidades por curso seleccionado en modo "Todos"
  const unidadesPorCurso = modoTodos && actividad.cursoOrigen
    ? unidades.filter(u => u.curso === actividad.cursoOrigen)
    : unidades
  return (
    <div className="mt-4 space-y-3">
      {modoTodos && (
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Curso</label>
          <select
            value={actividad.cursoOrigen || ""}
            onChange={e => set("cursoOrigen", e.target.value)}
            className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
          >
            <option value="">— Seleccionar curso —</option>
            {cursosDisponibles.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className="text-[11px] font-bold text-muted-foreground">Nombre</label>
        <input
          value={actividad.nombre}
          onChange={e => set("nombre", e.target.value)}
          className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Semana</label>
          <input
            type="number"
            min={1}
            max={52}
            value={actividad.semana}
            onChange={e => set("semana", Number(e.target.value))}
            className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Día</label>
          <select
            value={actividad.dia}
            onChange={e => set("dia", e.target.value)}
            className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
          >
            {DIAS_SEMANA.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Hora</label>
          <input
            type="time"
            value={actividad.hora}
            onChange={e => set("hora", e.target.value)}
            className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground">Duración</label>
          <input
            value={actividad.duracion}
            onChange={e => set("duracion", e.target.value)}
            placeholder="ej. 45 min"
            className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
          />
        </div>
      </div>
      <div>
        <label className="text-[11px] font-bold text-muted-foreground">Unidad</label>
        <select
          value={actividad.unidad || ""}
          onChange={e => set("unidad", e.target.value)}
          className="mt-1 w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
        >
          <option value="">— Sin unidad —</option>
          {unidadesPorCurso.map(u => <option key={`${u.curso}_${u.id}`} value={u.id}>{u.nombre}</option>)}
        </select>
      </div>

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
        <button onClick={onDelete} className="text-[11.5px] text-rose-600 hover:underline">
          Eliminar
        </button>
        <button
          onClick={onSave}
          className="rounded-[10px] bg-primary px-4 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
        >
          Guardar cambios
        </button>
      </div>
    </div>
  )
}
