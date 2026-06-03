"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  ArrowRight, Calendar, Check, Clock, Loader2, Users, X, BookOpen,
  AlertCircle, Sparkles, Sunrise, Sun, Moon, ListChecks, Bell,
  Zap, ChevronDown, ChevronRight, Coffee, Flame, Target, Activity, Hash,
  StickyNote, Plus, Trash2, ClipboardCheck, CalendarDays,
  TrendingUp, Lightbulb, Pin, MapPin, GraduationCap, BarChart3, UserRound,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { cargarEstadoClases, guardarEstadoClases, cargarHorarioSemanal, ClaseHorario, esTipoLibre } from "@/lib/horario"
import {
  cargarActividadClase, buscarActividadPorFecha, buscarClasePlanificadaPorFecha,
  guardarAnotacion, cargarAnotacion,
} from "@/lib/curriculo"
import type { ActividadClase } from "@/lib/curriculo"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { getFeatureFlags } from "@/lib/feature-flags"
import { apiFetch } from "@/lib/api-client"
import { useAuth } from "@/components/auth/auth-context"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { ResumenSemanal } from "@/components/edu-panel/dashboard/resumen-semanal"
import { Badge } from "@/components/ui/badge"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { cargarPreferencias, guardarPreferencias } from "@/lib/perfil"

const DAYS   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"]
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DIAS_HABILES = ["Lunes","Martes","Miércoles","Jueves","Viernes"]

type TabKey = "hoy" | "semana" | "mes" | "insights" | "pendientes"
const TABS: { key: TabKey; label: string; icon: typeof Clock }[] = [
  { key: "hoy",         label: "Hoy",        icon: Clock },
  { key: "semana",      label: "Semana",     icon: Calendar },
  { key: "mes",         label: "Mes",        icon: CalendarDays },
  { key: "insights",    label: "Insights",   icon: BarChart3 },
  { key: "pendientes",  label: "Pendientes", icon: Bell },
]

const STICKY_KEY = "edupanel_dashboard_stickies"

interface StickyNote {
  id: string
  texto: string
  color: "rosa" | "amarillo" | "verde" | "azul"
  ts: number
}

const STICKY_COLORS: Record<StickyNote["color"], { bg: string; text: string; border: string }> = {
  rosa:     { bg: "bg-pink-100 dark:bg-pink-900/30",     text: "text-pink-900 dark:text-pink-100",     border: "border-pink-300 dark:border-pink-800" },
  amarillo: { bg: "bg-amber-100 dark:bg-amber-900/30",   text: "text-amber-900 dark:text-amber-100",   border: "border-amber-300 dark:border-amber-800" },
  verde:    { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-900 dark:text-emerald-100", border: "border-emerald-300 dark:border-emerald-800" },
  azul:     { bg: "bg-blue-100 dark:bg-blue-900/30",     text: "text-blue-900 dark:text-blue-100",     border: "border-blue-300 dark:border-blue-800" },
}

interface CursoStats {
  curso: string
  color: string
  alumnos: number
  bloquesHoy: number
  ultimaFirma?: string
  asistenciaPct?: number
}

type ModalTab = "clase" | "anotaciones"

function fechaKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}
function timeToMin(s: string) {
  if (!s || typeof s !== "string") return 0
  const [h, m] = s.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

function getGreeting(date: Date): { greet: string; icon: typeof Sun; gradient: string; mood: string } {
  const h = date.getHours()
  if (h >= 5 && h < 12) return { greet: "Buenos días", icon: Sunrise, gradient: "from-amber-300 via-orange-400 to-rose-400", mood: "Empieza la jornada con energía" }
  if (h >= 12 && h < 14) return { greet: "Buenas tardes", icon: Sun, gradient: "from-orange-300 via-amber-400 to-yellow-300", mood: "Mantén el ritmo del aula" }
  if (h >= 14 && h < 19) return { greet: "Buenas tardes", icon: Coffee, gradient: "from-fuchsia-400 via-pink-400 to-rose-400", mood: "Última recta del día" }
  return { greet: "Buenas noches", icon: Moon, gradient: "from-violet-500 via-indigo-500 to-blue-600", mood: "Tiempo de planificar mañana" }
}

export function DashboardShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const { user } = useAuth()
  const tabParam = (searchParams.get("tab") as TabKey | null)
  const [activeTab, setActiveTab] = useState<TabKey>(tabParam ?? "hoy")

  const [now, setNow] = useState(new Date())
  const [estado, setEstado] = useState<Record<string, boolean>>({})
  const [horarioSemanal, setHorarioSemanal] = useState<ClaseHorario[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedDay, setSelectedDay] = useState(() => {
    const d = new Date()
    return DIAS_HABILES.includes(DAYS[d.getDay()]) ? DAYS[d.getDay()] : "Lunes"
  })

  // Panel expandido (en lugar de modal grande del v1)
  const [expandedClase, setExpandedClase] = useState<string | null>(null)
  const [innerTab, setInnerTab] = useState<ModalTab>("clase")
  const [actividadModal, setActividadModal] = useState<ActividadClase | null>(null)
  const [loadingPanel, setLoadingPanel] = useState(false)
  const [anotaciones, setAnotaciones] = useState("")
  const [claseNumero, setClaseNumero] = useState(1)
  const [unidadModal, setUnidadModal] = useState("unidad_1")
  const [unidadCurricularModal, setUnidadCurricularModal] = useState("unidad_1")
  const [claseVinculada, setClaseVinculada] = useState(false)
  const [savingAnotacion, setSavingAnotacion] = useState(false)
  const [anotacionGuardada, setAnotacionGuardada] = useState(false)
  const [fechaStrModal, setFechaStrModal] = useState("")

  // Stickies / recordatorios (localStorage)
  const [stickies, setStickies] = useState<StickyNote[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [newSticky, setNewSticky] = useState("")
  const [newStickyColor, setNewStickyColor] = useState<StickyNote["color"]>("amarillo")

  // Stats por curso
  const [cursoStats, setCursoStats] = useState<CursoStats[]>([])
  const [loadingStats, setLoadingStats] = useState(false)

  const claveHoy = fechaKey(new Date())
  const diaHoy = DAYS[new Date().getDay()]
  const esDiaLaboral = DIAS_HABILES.includes(diaHoy)

  useEffect(() => { setActiveTab(tabParam ?? "hoy") }, [tabParam])

  const goToTab = useCallback((key: TabKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("tab", key)
    router.replace(`/?${params.toString()}`, { scroll: false })
    setActiveTab(key)
  }, [router, searchParams])

  // Reloj — actualiza cada 60s
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Datos iniciales
  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([
      cargarEstadoClases(claveHoy),
      cargarHorarioSemanal(),
      cargarPreferencias(),
    ])
      .then(([est, hor, pref]) => {
        const tieneCursosLectivos = hor.some(item => !esTipoLibre(item.tipo) && item.resumen.trim())
        if (!pref?.onboardingCompletado && !tieneCursosLectivos) {
          router.replace("/perfil")
          return
        }
        if (!pref?.onboardingCompletado && tieneCursosLectivos) {
          guardarPreferencias({ ...(pref || {}), onboardingCompletado: true }).catch(console.error)
        }
        setEstado(est)
        setHorarioSemanal(hor)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user, claveHoy, router])

  // Cargar stickies desde localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STICKY_KEY)
      if (raw) setStickies(JSON.parse(raw))
    } catch { /* noop */ }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try { window.localStorage.setItem(STICKY_KEY, JSON.stringify(stickies)) } catch { /* noop */ }
  }, [stickies, hydrated])

  const addSticky = () => {
    if (!newSticky.trim()) return
    setStickies(prev => [{
      id: `s_${Date.now()}`,
      texto: newSticky.trim(),
      color: newStickyColor,
      ts: Date.now(),
    }, ...prev].slice(0, 10))
    setNewSticky("")
  }
  const removeSticky = (id: string) => setStickies(prev => prev.filter(s => s.id !== id))

  // Cargar stats por curso sin consultar libro/asistencia, que queda como prototipo.
  useEffect(() => {
    if (!user || horarioSemanal.length === 0) return
    const cursosAcademicos = Array.from(new Set(
      horarioSemanal
        .filter(h => !esTipoLibre(h.tipo))
        .map(h => ({ resumen: h.resumen.trim(), color: h.color }))
        .filter(x => x.resumen)
        .map(x => JSON.stringify(x))
    )).map(s => JSON.parse(s) as { resumen: string; color: string })

    setLoadingStats(true)
    Promise.all(cursosAcademicos.map(async ({ resumen: c, color }) => {
      const estudiantes = await cargarEstudiantes(c).catch(() => [])
      const bloquesHoy = horarioSemanal.filter(h => h.dia === diaHoy && h.resumen.trim() === c && !esTipoLibre(h.tipo)).length
      return {
        curso: c,
        color,
        alumnos: estudiantes.length,
        bloquesHoy,
        ultimaFirma: undefined,
        asistenciaPct: undefined,
      } as CursoStats
    })).then(setCursoStats).finally(() => setLoadingStats(false))
  }, [user, horarioSemanal, ASIGNATURA, diaHoy])

  const getClasesDelDia = useCallback((dia: string) => {
    return horarioSemanal
      .filter(c => c.dia === dia)
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
      .map(c => ({ ...c, completada: !!estado[c.uid] }))
  }, [horarioSemanal, estado])

  const clasesHoy = useMemo(() => esDiaLaboral ? getClasesDelDia(diaHoy) : [], [esDiaLaboral, diaHoy, getClasesDelDia])

  const clasesDelDiaSeleccionado = useMemo(() => getClasesDelDia(selectedDay), [getClasesDelDia, selectedDay])
  const bloquesLectivosHoy = useMemo(() => clasesHoy.filter(c => !esTipoLibre(c.tipo)), [clasesHoy])

  // Bloque actual / siguiente
  const { bloqueActual, bloqueSiguiente, progresoBloque } = useMemo(() => {
    const minNow = now.getHours() * 60 + now.getMinutes()
    let actual: typeof clasesHoy[number] | null = null
    let siguiente: typeof clasesHoy[number] | null = null
    let progreso = 0
    for (const c of clasesHoy) {
      const ini = timeToMin(c.horaInicio)
      const fin = timeToMin(c.horaFin)
      if (minNow >= ini && minNow < fin) {
        actual = c
        progreso = Math.round(((minNow - ini) / Math.max(1, fin - ini)) * 100)
      } else if (minNow < ini && !siguiente) {
        siguiente = c
      }
    }
    return { bloqueActual: actual, bloqueSiguiente: siguiente, progresoBloque: progreso }
  }, [clasesHoy, now])

  // Estadísticas
  const statsHoy = useMemo(() => {
    const total = bloquesLectivosHoy.length
    const completadas = bloquesLectivosHoy.filter(c => c.completada).length
    return { total, completadas, pct: total > 0 ? Math.round((completadas / total) * 100) : 0 }
  }, [bloquesLectivosHoy])

  const toggleEstado = (uid: string) => {
    setEstado(prev => {
      const next = { ...prev, [uid]: !prev[uid] }
      guardarEstadoClases(next, claveHoy).catch(console.error)
      return next
    })
  }

  // Cargar panel expandible
  const onExpandClase = async (clase: ClaseHorario) => {
    if (esTipoLibre(clase.tipo)) return
    if (expandedClase === clase.uid) {
      setExpandedClase(null)
      return
    }
    setExpandedClase(clase.uid)
    setInnerTab("clase")
    setLoadingPanel(true)
    setActividadModal(null)
    setAnotaciones("")
    setClaseVinculada(false)

    try {
      const targetDate = new Date(now)
      if (clase.dia) {
        const idx = DAYS.indexOf(clase.dia)
        if (idx !== -1) {
          const currentIdx = now.getDay()
          targetDate.setDate(now.getDate() + (idx - currentIdx))
        }
      }
      const fechaStr = fechaKey(targetDate)
      const fechaSlash = `${String(targetDate.getDate()).padStart(2,"0")}/${String(targetDate.getMonth()+1).padStart(2,"0")}/${targetDate.getFullYear()}`

      const cleanResumen = clase.resumen?.trim() || ""
      const cleanAsignatura = ASIGNATURA?.trim() || ""

      let claseN = 1, unidad = "unidad_1", unidadCurricular = "unidad_1"
      const encontrada = await buscarClasePlanificadaPorFecha(cleanAsignatura, cleanResumen, fechaSlash).catch(() => null)
      let actHoy: ActividadClase | null = null
      if (encontrada) {
        claseN = encontrada.numeroClase
        unidad = encontrada.unidadId
        unidadCurricular = encontrada.unidadCurricularId || encontrada.cronograma.unidadId || unidad
        setClaseVinculada(true)
      } else {
        actHoy = await buscarActividadPorFecha(cleanAsignatura, cleanResumen, fechaSlash).catch(() => null)
        if (actHoy) {
          claseN = actHoy.numeroClase
          unidad = actHoy.unidadId
          unidadCurricular = actHoy.unidadId
          setClaseVinculada(true)
        }
      }
      setClaseNumero(claseN)
      setUnidadModal(unidad)
      setUnidadCurricularModal(unidadCurricular)
      setFechaStrModal(fechaStr)

      const cargarActividadDetectada = async () => {
        if (actHoy) return actHoy
        const principal = await cargarActividadClase(cleanResumen, unidad, claseN, cleanAsignatura).catch(() => null)
        if (principal || unidadCurricular === unidad) return principal
        return cargarActividadClase(cleanResumen, unidadCurricular, claseN, cleanAsignatura).catch(() => null)
      }

      const [actividad, anotTxt] = await Promise.all([
        cargarActividadDetectada(),
        cargarAnotacion(cleanResumen, fechaStr, cleanAsignatura).catch(() => ""),
      ])
      setActividadModal(actividad)
      setAnotaciones(anotTxt || "")
    } finally {
      setLoadingPanel(false)
    }
  }

  const guardarAnotacionPanel = async (cursoStr: string) => {
    setSavingAnotacion(true)
    try {
      let finalAnotaciones = anotaciones
      const flags = (await getFeatureFlags().catch(() => ({}))) as Record<string, any>
      if (flags["corrector-tono"]?.active) {
        const checkRes = await apiFetch("/api/corregir-anotacion", {
          method: "POST",
          body: JSON.stringify({ texto: anotaciones })
        }).then(r => r.json()).catch(() => null)

        if (checkRes?.resultado?.riesgoso) {
          const conf = window.confirm(
            `⚠️ ALERTA DE SEGURIDAD LEGAL (IA)\n\nSe detectó lenguaje subjetivo o potencialmente conflictivo:\n"${checkRes.resultado.analisis}"\n\n¿Deseas aplicar la siguiente redacción alternativa profesional y segura?\n\n"${checkRes.resultado.sugerencia}"`
          )
          if (conf) {
            finalAnotaciones = checkRes.resultado.sugerencia
            setAnotaciones(checkRes.resultado.sugerencia)
          }
        }
      }

      await guardarAnotacion(cursoStr, fechaStrModal, finalAnotaciones, ASIGNATURA)
      setAnotacionGuardada(true)
      setTimeout(() => setAnotacionGuardada(false), 3000)
    } catch (err) {
      console.error("Error saving annotation", err)
    } finally {
      setSavingAnotacion(false)
    }
  }

  const greeting = getGreeting(now)
  const GreetIcon = greeting.icon

  // Atajos discretos: H abre la proxima clase; 1-5 cambia el dia.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return
      if (e.key.toLowerCase() === "h") {
        e.preventDefault()
        const next = [bloqueSiguiente, ...clasesHoy.filter(c => !c.completada)].find(c => c && !esTipoLibre(c.tipo))
        if (next) onExpandClase(next as ClaseHorario)
      } else if (["1","2","3","4","5"].includes(e.key)) {
        e.preventDefault()
        const idx = Number(e.key) - 1
        setSelectedDay(DIAS_HABILES[idx])
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clasesHoy, bloqueSiguiente, expandedClase])

  // Pendientes
  const pendientes = useMemo(() => {
    const items: { id: string; clase: ClaseHorario; tipo: "no_completada" | "no_firmada"; titulo: string }[] = []
    bloquesLectivosHoy.forEach(c => {
      if (!c.completada) {
        items.push({ id: `${c.uid}-comp`, clase: c, tipo: "no_completada", titulo: `${c.resumen} · ${c.horaInicio}-${c.horaFin} sin marcar como dictada` })
      }
    })
    return items
  }, [bloquesLectivosHoy])

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 pb-10">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-[20px] bg-gradient-to-br ${greeting.gradient} px-6 py-7 sm:px-8 sm:py-8 text-white mb-6`}>
        <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-black/10 blur-2xl" />
        <div className="relative grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-[12px] font-bold opacity-90">
              <GreetIcon className="h-3.5 w-3.5" />
              {greeting.greet}, {user?.displayName?.split(" ")[0] || "profe"}
            </div>
            <h1 className="mt-1 text-[24px] sm:text-[30px] font-extrabold leading-tight">
              {greeting.mood}
            </h1>
            <p className="mt-1 text-[12.5px] text-white/85">
              {DAYS[now.getDay()]} {now.getDate()} de {MONTHS[now.getMonth()].toLowerCase()} · {now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
            </p>

            {bloqueActual ? (
              <div className="mt-5 rounded-[14px] bg-white/15 backdrop-blur p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide opacity-90">
                  <Flame className="h-3 w-3" /> Bloque actual
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-[18px] font-extrabold">{bloqueActual.resumen}</span>
                  <span className="text-[12px] opacity-85">{bloqueActual.horaInicio} – {bloqueActual.horaFin}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div className="h-full bg-white transition-all" style={{ width: `${progresoBloque}%` }} />
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] opacity-80">
                  <span>{esTipoLibre(bloqueActual.tipo) ? "Bloque no lectivo" : `${progresoBloque}% completado`}</span>
                  {esTipoLibre(bloqueActual.tipo) ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 font-bold">
                      Sin registro
                    </span>
                  ) : (
                    <button
                      onClick={() => onExpandClase(bloqueActual as ClaseHorario)}
                      className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-0.5 font-bold hover:bg-white/30"
                    >
                      Abrir <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ) : bloqueSiguiente ? (
              <div className="mt-5 rounded-[14px] bg-white/15 backdrop-blur p-4">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide opacity-90">
                  <Clock className="h-3 w-3" /> Próximo bloque
                </div>
                <div className="mt-1 flex flex-wrap items-baseline gap-2">
                  <span className="text-[16px] font-extrabold">{bloqueSiguiente.resumen}</span>
                  <span className="text-[12px] opacity-85">{bloqueSiguiente.horaInicio} – {bloqueSiguiente.horaFin}</span>
                </div>
              </div>
            ) : esDiaLaboral && bloquesLectivosHoy.length > 0 ? (
              <div className="mt-5 rounded-[14px] bg-white/15 backdrop-blur p-4 text-[12px] opacity-90">
                Jornada finalizada — todas las clases registradas.
              </div>
            ) : (
              <div className="mt-5 rounded-[14px] bg-white/15 backdrop-blur p-4 text-[12px] opacity-90">
                Hoy no tienes clases programadas.
              </div>
            )}
          </div>

          {/* KPIs hero */}
          <div className="grid grid-cols-2 gap-2.5 self-end">
            <KpiHero label="Clases hoy" value={`${statsHoy.completadas}/${statsHoy.total}`} sub={`${statsHoy.pct}% completadas`} />
            <KpiHero label="Pendientes" value={pendientes.length.toString()} sub={pendientes.length === 0 ? "todo en orden" : "abrir lista"} />
            <KpiHero label="Hora actual" value={now.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })} sub={DAYS[now.getDay()]} />
            <KpiHero label="Asignatura" value={ASIGNATURA.slice(0, 8)} sub="activa" />
          </div>
        </div>
      </div>

      <div className="mb-6" />
      {/* Tabs */}
      <div className="sticky top-0 z-10 -mx-3 mb-5 bg-background/85 px-3 backdrop-blur sm:-mx-5 sm:px-5">
        <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1">
          {TABS.map(tab => {
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
                {tab.key === "pendientes" && pendientes.length > 0 && (
                  <Badge variant="destructive" className="text-[9px] h-4 px-1.5">{pendientes.length}</Badge>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
        </div>
      ) : activeTab === "hoy" ? (
        <>
          <QuickActionsBar asignatura={ASIGNATURA} cursosStats={cursoStats} />
          <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
            <div className="min-w-0">
              <CursosMiniStats stats={cursoStats} loading={loadingStats} asignatura={ASIGNATURA} />
              <div className="mt-5">
                <HoyView
                  esDiaLaboral={esDiaLaboral}
                  clasesHoy={clasesHoy}
                  selectedDay={selectedDay}
                  setSelectedDay={setSelectedDay}
                  clasesDelDiaSeleccionado={clasesDelDiaSeleccionado}
                  horarioSemanal={horarioSemanal}
                  expandedClase={expandedClase}
                  onToggleExpand={onExpandClase}
                  onToggleEstado={toggleEstado}
                  actividadModal={actividadModal}
                  loadingPanel={loadingPanel}
                  innerTab={innerTab}
                  setInnerTab={setInnerTab}
                  asignatura={ASIGNATURA}
                  claseNumero={claseNumero}
                  unidadModal={unidadModal}
                  unidadCurricularModal={unidadCurricularModal}
                  claseVinculada={claseVinculada}
                  anotaciones={anotaciones}
                  setAnotaciones={setAnotaciones}
                  savingAnotacion={savingAnotacion}
                  anotacionGuardada={anotacionGuardada}
                  onGuardarAnotacion={guardarAnotacionPanel}
                  now={now}
                />
              </div>
            </div>
            <aside className="space-y-5 lg:sticky lg:top-32 lg:self-start">
              <StickyNotesPanel
                stickies={stickies}
                newSticky={newSticky}
                setNewSticky={setNewSticky}
                newColor={newStickyColor}
                setNewColor={setNewStickyColor}
                onAdd={addSticky}
                onRemove={removeSticky}
              />
              <InsightsCard horario={horarioSemanal} clasesHoy={clasesHoy} now={now} cursoStats={cursoStats} />
            </aside>
          </div>
        </>
      ) : activeTab === "semana" ? (
        <SemanaTab horario={horarioSemanal} fecha={now} asignatura={ASIGNATURA} cursoStats={cursoStats} />
      ) : activeTab === "mes" ? (
        <MesTab horario={horarioSemanal} fecha={now} estado={estado} cursoStats={cursoStats} />
      ) : activeTab === "insights" ? (
        <InsightsTab horario={horarioSemanal} cursoStats={cursoStats} estado={estado} />
      ) : (
        <PendientesView
          pendientes={pendientes}
          onExpand={onExpandClase}
        />
      )}

    </div>
  )
}

function KpiHero({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-[12px] bg-white/15 backdrop-blur p-3">
      <div className="text-[10px] font-bold uppercase opacity-80">{label}</div>
      <div className="mt-0.5 text-[18px] font-extrabold">{value}</div>
      <div className="text-[10px] opacity-75">{sub}</div>
    </div>
  )
}

interface HoyViewProps {
  esDiaLaboral: boolean
  clasesHoy: (ClaseHorario & { completada: boolean })[]
  selectedDay: string
  setSelectedDay: (d: string) => void
  clasesDelDiaSeleccionado: (ClaseHorario & { completada: boolean })[]
  horarioSemanal: ClaseHorario[]
  expandedClase: string | null
  onToggleExpand: (clase: ClaseHorario) => void
  onToggleEstado: (uid: string) => void
  actividadModal: ActividadClase | null
  loadingPanel: boolean
  innerTab: ModalTab
  setInnerTab: (t: ModalTab) => void
  asignatura: string
  claseNumero: number
  unidadModal: string
  unidadCurricularModal: string
  claseVinculada: boolean
  anotaciones: string
  setAnotaciones: (v: string) => void
  savingAnotacion: boolean
  anotacionGuardada: boolean
  onGuardarAnotacion: (uid: string) => void
  now: Date
}

function HoyView(props: HoyViewProps) {
  const {
    esDiaLaboral, clasesHoy, selectedDay, setSelectedDay, clasesDelDiaSeleccionado,
    expandedClase, onToggleExpand, onToggleEstado,
    actividadModal, loadingPanel, innerTab, setInnerTab,
    asignatura, claseNumero, unidadModal, unidadCurricularModal, claseVinculada,
    anotaciones, setAnotaciones,
    savingAnotacion, anotacionGuardada,
    onGuardarAnotacion, now,
  } = props

  return (
    <div className="space-y-5">
      {/* Switch día */}
      <div className="flex flex-wrap items-center gap-1.5">
        {DIAS_HABILES.map(d => (
          <button
            key={d}
            onClick={() => setSelectedDay(d)}
            className={cn(
              "rounded-[10px] border px-3 py-1.5 text-[12px] font-semibold transition-colors",
              selectedDay === d
                ? "bg-pink-light border-primary text-primary"
                : "border-border bg-card hover:border-primary"
            )}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      {clasesDelDiaSeleccionado.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-border bg-card p-10 text-center">
          <Coffee className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-[13px] font-bold">Sin clases programadas el {selectedDay.toLowerCase()}</p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Configura tu horario en <Link href="/perfil" className="underline">Mi Perfil</Link>.
          </p>
        </div>
      ) : (
        <div className="relative space-y-3 before:absolute before:left-[26px] before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {clasesDelDiaSeleccionado.map(clase => {
            const isExpanded = expandedClase === clase.uid
            const noLectivo = esTipoLibre(clase.tipo)
            const isNow = selectedDay === DAYS[now.getDay()] &&
              now.getHours() * 60 + now.getMinutes() >= timeToMin(clase.horaInicio) &&
              now.getHours() * 60 + now.getMinutes() < timeToMin(clase.horaFin)
            return (
              <div key={clase.uid} className="relative pl-12">
                <div
                  className={cn(
                    "absolute left-[18px] top-3 h-4 w-4 rounded-full border-2 z-10",
                    !noLectivo && clase.completada ? "bg-emerald-500 border-emerald-500" : isNow ? "bg-primary border-primary animate-pulse" : "bg-card border-border"
                  )}
                  style={(noLectivo || !clase.completada) && !isNow ? { borderColor: clase.color } : undefined}
                />
                <article className={cn(
                  "rounded-[14px] border bg-card transition-all",
                  isNow && !isExpanded ? "border-primary shadow-md" : "border-border",
                  isExpanded && !noLectivo && "ring-2 ring-primary",
                  noLectivo && "bg-muted/20"
                )}>
                  <div
                    onClick={() => { if (!noLectivo) onToggleExpand(clase as ClaseHorario) }}
                    className={cn("w-full flex items-center gap-3 p-4 text-left cursor-pointer", noLectivo && "cursor-default")}
                    role={noLectivo ? undefined : "button"}
                    tabIndex={noLectivo ? undefined : 0}
                  >
                    <div
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] text-white font-bold text-[12px]"
                      style={{ backgroundColor: clase.color }}
                    >
                      {clase.horaInicio.slice(0, 2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-extrabold truncate">{clase.resumen}</span>
                        {noLectivo && (
                          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300 border-slate-300 text-[9px] h-4">
                            No lectivo
                          </Badge>
                        )}
                        {!noLectivo && clase.completada && (
                          <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-300 text-[9px] h-4">
                            <Check className="h-2.5 w-2.5 mr-0.5" /> Dictada
                          </Badge>
                        )}
                        {!noLectivo && isNow && !clase.completada && (
                          <Badge className="bg-primary text-white border-primary text-[9px] h-4">EN CURSO</Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{clase.horaInicio} – {clase.horaFin}</span>
                        {clase.tipo && clase.tipo !== "clase" && (
                          <span className="capitalize">· {clase.tipo}</span>
                        )}
                      </div>
                    </div>
                    {noLectivo ? (
                      <span className="rounded-full border border-border bg-background px-2.5 py-1 text-[10.5px] font-bold text-muted-foreground">
                        Sin registro
                      </span>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleEstado(clase.uid) }}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[10.5px] font-bold transition-colors",
                          clase.completada ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-background border border-border hover:border-primary"
                        )}
                      >
                        {clase.completada ? "✓ Hecha" : "Marcar"}
                      </button>
                    )}
                    {!noLectivo && <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />}
                  </div>

                  {isExpanded && !noLectivo && (
                    <div className="border-t border-border p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-1 border-b border-border pb-1 -mx-1">
                        {([
                          { k: "clase",        label: "Clase",        icon: BookOpen },
                          { k: "anotaciones",  label: "Anotaciones",  icon: AlertCircle },
                        ] as const).map(t => {
                          const Icon = t.icon
                          return (
                            <button
                              key={t.k}
                              onClick={() => setInnerTab(t.k)}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                                innerTab === t.k ? "bg-pink-light text-primary" : "text-muted-foreground hover:text-foreground"
                              )}
                            >
                              <Icon className="h-3 w-3" /> {t.label}
                            </button>
                          )
                        })}
                      </div>

                      {loadingPanel ? (
                        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                        </div>
                      ) : (
                        <>
                          {innerTab === "clase" && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                <Hash className="h-3 w-3" /> Clase #{claseNumero} · {unidadModal}
                              </div>
                              {actividadModal ? (
                                <div className="rounded-[10px] border border-border bg-background p-3">
                                  <h4 className="text-[13px] font-extrabold">Clase {actividadModal.numeroClase} · {actividadModal.unidadId}</h4>
                                  {actividadModal.objetivo && (
                                    <p className="text-[12px] text-muted-foreground mt-1">{actividadModal.objetivo}</p>
                                  )}
                                  <Link
                                    href={buildUrl("/actividades", withAsignatura({ curso: clase.resumen, unidad: unidadCurricularModal, unitIdLocal: actividadModal.unidadId || unidadModal, clase: String(claseNumero) }, asignatura))}
                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                  >
                                    Editar en Actividades <ArrowRight className="h-3 w-3" />
                                  </Link>
                                </div>
                              ) : (
                                <div className="rounded-[10px] border border-dashed border-border bg-background p-3">
                                  <p className="text-[12px] text-muted-foreground italic">
                                    {claseVinculada
                                      ? "Esta fecha esta vinculada en el cronograma, pero todavia no tiene actividad redactada."
                                      : "No hay actividad planificada para esta clase."}
                                  </p>
                                  <Link
                                    href={buildUrl("/actividades", withAsignatura({ curso: clase.resumen, unidad: unidadCurricularModal, unitIdLocal: unidadModal, clase: String(claseNumero) }, asignatura))}
                                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
                                  >
                                    Abrir actividad <ArrowRight className="h-3 w-3" />
                                  </Link>
                                </div>
                              )}
                            </div>
                          )}

                          {innerTab === "anotaciones" && (
                            <div className="space-y-2">
                              <textarea
                                value={anotaciones}
                                onChange={e => setAnotaciones(e.target.value)}
                                placeholder="Escribe una anotación rápida sobre esta clase…"
                                rows={4}
                                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary"
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => onGuardarAnotacion(clase.resumen)}
                                  disabled={savingAnotacion}
                                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary text-white px-3 py-1.5 text-[11px] font-bold hover:opacity-90 disabled:opacity-60"
                                >
                                  {savingAnotacion ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  Guardar
                                </button>
                                {anotacionGuardada && (
                                  <span className="text-[11px] font-bold text-emerald-600">¡Guardado!</span>
                                )}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </article>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PendientesView({ pendientes, onExpand }: {
  pendientes: { id: string; clase: ClaseHorario; tipo: "no_completada" | "no_firmada"; titulo: string }[]
  onExpand: (clase: ClaseHorario) => void
}) {
  if (pendientes.length === 0) {
    return (
      <div className="rounded-[16px] border border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 p-8 text-center">
        <Check className="mx-auto h-8 w-8 text-emerald-600 dark:text-emerald-300" />
        <h3 className="mt-2 text-[14px] font-extrabold text-emerald-900 dark:text-emerald-100">¡Todo en orden!</h3>
        <p className="mt-1 text-[12px] text-emerald-800 dark:text-emerald-200/80">
          No tienes pendientes para hoy.
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground mb-2">
        <ListChecks className="inline h-3.5 w-3.5 mr-1" />
        Click en una tarjeta para abrir y resolver.
      </p>
      {pendientes.map(p => (
        <button
          key={p.id}
          onClick={() => onExpand(p.clase)}
          className="w-full flex items-center gap-3 rounded-[12px] border border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-3 text-left hover:border-amber-500 transition-colors"
        >
          <Bell className="h-4 w-4 text-amber-600 dark:text-amber-300 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h4 className="text-[12.5px] font-extrabold text-amber-900 dark:text-amber-100">{p.titulo}</h4>
            <p className="text-[10.5px] text-amber-700 dark:text-amber-200/80">{p.clase.resumen} · {p.clase.dia} {p.clase.horaInicio}</p>
          </div>
          <ArrowRight className="h-3.5 w-3.5 text-amber-700 dark:text-amber-300 flex-shrink-0" />
        </button>
      ))}
    </div>
  )
}

// ─── Quick Actions Bar ────────────────────────────────────────────────────────
function QuickActionsBar({ asignatura, cursosStats }: { asignatura: string; cursosStats: CursoStats[] }) {
  const acciones = [
    { label: "Calificar",         icon: ClipboardCheck, href: buildUrl("/calificaciones", withAsignatura({}, asignatura)), cls: "from-emerald-500 to-teal-500" },
    { label: "Ver cronograma",    icon: CalendarDays,   href: buildUrl("/cronograma", withAsignatura({}, asignatura)),    cls: "from-cyan-500 to-blue-500" },
    { label: "Editar clase",      icon: Lightbulb,      href: buildUrl("/actividades", withAsignatura({}, asignatura)),       cls: "from-fuchsia-500 to-pink-500" },
    { label: "Perfil 360",        icon: UserRound,      href: buildUrl("/perfil-360", withAsignatura({}, asignatura)),    cls: "from-indigo-500 to-violet-500" },
  ]
  return (
    <section className="rounded-[14px] border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-extrabold inline-flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" /> Acciones rápidas
        </h3>
        <span className="text-[10.5px] text-muted-foreground">
          {cursosStats.length} cursos · {cursosStats.reduce((s, c) => s + c.alumnos, 0)} estudiantes
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {acciones.map(a => {
          const Icon = a.icon
          return (
            <Link
              key={a.label}
              href={a.href}
              className={`group relative overflow-hidden rounded-[12px] bg-gradient-to-br ${a.cls} px-3 py-3 text-white hover:-translate-y-0.5 transition-transform`}
            >
              <Icon className="h-4 w-4" />
              <div className="mt-1.5 text-[12px] font-bold leading-tight">{a.label}</div>
              <ArrowRight className="absolute right-2 top-2 h-3 w-3 opacity-0 transition-opacity group-hover:opacity-80" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}

// ─── Mini stats por curso ────────────────────────────────────────────────────
function CursosMiniStats({ stats, loading, asignatura }: { stats: CursoStats[]; loading: boolean; asignatura: string }) {
  if (loading) {
    return (
      <section className="rounded-[14px] border border-border bg-card p-4 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-[12px]">Cargando estadísticas por curso…</span>
      </section>
    )
  }
  if (stats.length === 0) {
    return (
      <section className="rounded-[14px] border border-dashed border-border bg-card p-4 text-center">
        <p className="text-[12px] text-muted-foreground">
          Aún no hay cursos con clases regulares en tu horario.
        </p>
      </section>
    )
  }
  return (
    <section>
      <h3 className="text-[12.5px] font-extrabold mb-2 inline-flex items-center gap-1.5">
        <GraduationCap className="h-3.5 w-3.5 text-primary" /> Tus cursos
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map(s => (
          <Link
            key={s.curso}
            href={buildUrl("/perfil-360", withAsignatura({ curso: s.curso }, asignatura))}
            className="group flex items-center gap-3 rounded-[12px] border border-border bg-card p-3 hover:border-primary transition-colors"
          >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] text-white font-bold text-[11px]" style={{ backgroundColor: s.color }}>
              {s.curso.slice(0, 3).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold truncate">{s.curso}</div>
              <div className="mt-0.5 flex items-center gap-2 text-[10.5px] text-muted-foreground">
                <span><Users className="inline h-2.5 w-2.5" /> {s.alumnos}</span>
                {s.bloquesHoy > 0 && (
                  <span className="font-semibold text-primary">· hoy {s.bloquesHoy}b</span>
                )}
                {s.asistenciaPct != null && (
                  <span className={cn(
                    "font-semibold",
                    s.asistenciaPct >= 85 ? "text-emerald-600" :
                    s.asistenciaPct >= 70 ? "text-amber-600" :
                                            "text-rose-600"
                  )}>· {s.asistenciaPct}%</span>
                )}
              </div>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>
        ))}
      </div>
    </section>
  )
}

// ─── Sticky Notes / Recordatorios ─────────────────────────────────────────────
function StickyNotesPanel({ stickies, newSticky, setNewSticky, newColor, setNewColor, onAdd, onRemove }: {
  stickies: StickyNote[]
  newSticky: string
  setNewSticky: (s: string) => void
  newColor: StickyNote["color"]
  setNewColor: (c: StickyNote["color"]) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  return (
    <section className="rounded-[14px] border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[12.5px] font-extrabold inline-flex items-center gap-1.5">
          <StickyNote className="h-3.5 w-3.5 text-primary" /> Recordatorios
        </h3>
        <span className="text-[10px] text-muted-foreground">{stickies.length}/10</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-1">
          {(Object.keys(STICKY_COLORS) as StickyNote["color"][]).map(c => (
            <button
              key={c}
              onClick={() => setNewColor(c)}
              className={cn(
                "h-5 w-5 rounded-full border-2 transition-all",
                STICKY_COLORS[c].bg,
                newColor === c ? "ring-2 ring-primary ring-offset-1 scale-110" : "opacity-70"
              )}
              title={c}
            />
          ))}
        </div>
        <div className="flex items-stretch gap-1">
          <input
            value={newSticky}
            onChange={e => setNewSticky(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") onAdd() }}
            placeholder="Agregar recordatorio…"
            className="flex-1 rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary"
            disabled={stickies.length >= 10}
          />
          <button
            onClick={onAdd}
            disabled={!newSticky.trim() || stickies.length >= 10}
            className="rounded-[8px] bg-primary px-2 text-white hover:opacity-90 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {stickies.length > 0 ? (
        <ul className="mt-3 space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
          {stickies.map(s => {
            const c = STICKY_COLORS[s.color]
            return (
              <li
                key={s.id}
                className={cn("group relative rounded-[10px] border p-2.5 text-[12px] leading-snug", c.bg, c.text, c.border)}
              >
                <div className="pr-5 whitespace-pre-line">{s.texto}</div>
                <button
                  onClick={() => onRemove(s.id)}
                  className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100"
                  title="Eliminar"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 text-[11px] text-muted-foreground italic text-center">
          Sin recordatorios. Agrégalos con Enter.
        </p>
      )}
    </section>
  )
}

// ─── Insights Card (lateral en tab Hoy) ───────────────────────────────────────
function InsightsCard({ horario, clasesHoy, now, cursoStats }: {
  horario: ClaseHorario[]
  clasesHoy: (ClaseHorario & { completada: boolean })[]
  now: Date
  cursoStats: CursoStats[]
}) {
  const hHabiles = horario.filter(h => !esTipoLibre(h.tipo))
  const horasSemanales = hHabiles.reduce((acc, h) => {
    const ini = timeToMin(h.horaInicio)
    const fin = timeToMin(h.horaFin)
    return acc + Math.max(0, fin - ini)
  }, 0) / 60

  const totalAlumnos = cursoStats.reduce((s, c) => s + c.alumnos, 0)
  const clasesLectivasHoy = clasesHoy.filter(c => !esTipoLibre(c.tipo))
  const completadasHoy = clasesLectivasHoy.filter(c => c.completada).length
  const restantes = clasesLectivasHoy.length - completadasHoy

  return (
    <section className="rounded-[14px] border border-border bg-card p-4">
      <h3 className="text-[12.5px] font-extrabold mb-3 inline-flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5 text-primary" /> Tu día en números
      </h3>
      <ul className="space-y-2 text-[12px]">
        <li className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-light text-primary"><Users className="h-3.5 w-3.5" /></div>
          <span className="flex-1">Alumnos totales</span>
          <span className="font-extrabold">{totalAlumnos}</span>
        </li>
        <li className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"><Clock className="h-3.5 w-3.5" /></div>
          <span className="flex-1">Horas/semana</span>
          <span className="font-extrabold">{horasSemanales.toFixed(1)} h</span>
        </li>
        <li className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"><Activity className="h-3.5 w-3.5" /></div>
          <span className="flex-1">Libro de clases</span>
          <span className="font-extrabold text-amber-600">Prototipo</span>
        </li>
        <li className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"><Flame className="h-3.5 w-3.5" /></div>
          <span className="flex-1">Restantes hoy</span>
          <span className="font-extrabold">{restantes}</span>
        </li>
      </ul>

      <div className="mt-4 rounded-[10px] bg-pink-light p-3">
        <p className="text-[11.5px] text-primary leading-relaxed">
          <Sparkles className="inline h-3 w-3 mr-1" />
          {clasesLectivasHoy.length === 0
            ? "Día tranquilo. Aprovecha para planificar la próxima semana."
            : completadasHoy === clasesLectivasHoy.length
            ? `¡Tremendo! Completaste tus ${clasesLectivasHoy.length} clases del día.`
            : `Te quedan ${restantes} clase${restantes === 1 ? "" : "s"}. Tú puedes!`
          }
        </p>
      </div>
    </section>
  )
}

// ─── Tab Semana mejorada ──────────────────────────────────────────────────────
function SemanaTab({ horario, fecha, asignatura, cursoStats }: {
  horario: ClaseHorario[]
  fecha: Date
  asignatura: string
  cursoStats: CursoStats[]
}) {
  // Distribución por día
  const distribucion = DIAS_HABILES.map(d => ({
    dia: d,
    bloques: horario.filter(h => h.dia === d && !esTipoLibre(h.tipo)).length,
  }))
  const maxBloques = Math.max(1, ...distribucion.map(d => d.bloques))

  return (
    <div className="space-y-5">
      <div className="rounded-[14px] border border-border bg-card p-2">
        <ResumenSemanal asignatura={asignatura} horario={horario} fecha={fecha} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[14px] border border-border bg-card p-4">
          <h3 className="text-[13px] font-extrabold mb-3 inline-flex items-center gap-2">
            <BarChart3 className="h-3.5 w-3.5 text-primary" /> Distribución de la semana
          </h3>
          <div className="space-y-2">
            {distribucion.map(d => (
              <div key={d.dia} className="flex items-center gap-2 text-[11.5px]">
                <span className="w-20 font-semibold">{d.dia}</span>
                <div className="flex-1 h-5 rounded-full bg-muted/40 overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-pink-500 to-fuchsia-500 transition-all"
                    style={{ width: `${(d.bloques / maxBloques) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono font-semibold text-muted-foreground">{d.bloques}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[14px] border border-border bg-card p-4">
          <h3 className="text-[13px] font-extrabold mb-3 inline-flex items-center gap-2">
            <Pin className="h-3.5 w-3.5 text-primary" /> Carga por curso
          </h3>
          {cursoStats.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic">Sin datos de cursos.</p>
          ) : (
            <ul className="space-y-2 text-[12px]">
              {cursoStats.map(s => {
                const bloquesSemana = horario.filter(h => h.resumen.trim() === s.curso && !esTipoLibre(h.tipo)).length
                return (
                  <li key={s.curso} className="flex items-center gap-2">
                    <span className="inline-block h-3 w-3 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                    <span className="flex-1 truncate font-medium">{s.curso}</span>
                    <span className="font-extrabold">{bloquesSemana}b</span>
                    <span className="w-12 text-right text-muted-foreground">{s.alumnos} 👤</span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Tab Mes ──────────────────────────────────────────────────────────────────
function MesTab({ horario, fecha, estado, cursoStats }: {
  horario: ClaseHorario[]
  fecha: Date
  estado: Record<string, boolean>
  cursoStats: CursoStats[]
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date(fecha.getFullYear(), fecha.getMonth(), 1))
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = firstDay.getDay()
  const offset = (startWeekday + 6) % 7

  const dias: Date[] = []
  for (let d = 1; d <= lastDay.getDate(); d++) dias.push(new Date(year, month, d))

  const bloquesAcademicos = horario.filter(h => !esTipoLibre(h.tipo))

  const cambiarMes = (delta: number) => {
    const x = new Date(currentMonth)
    x.setMonth(x.getMonth() + delta)
    setCurrentMonth(x)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button onClick={() => cambiarMes(-1)} className="rounded-md border border-border p-1.5 hover:bg-background">
              <ChevronRight className="h-4 w-4 rotate-180" />
            </button>
            <h2 className="px-3 text-[15px] font-extrabold capitalize min-w-[160px] text-center">
              {MONTHS[month]} {year}
            </h2>
            <button onClick={() => cambiarMes(1)} className="rounded-md border border-border p-1.5 hover:bg-background">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {bloquesAcademicos.length} clases/semana programadas
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-muted-foreground py-1">{d}</div>
          ))}
          {Array.from({ length: offset }).map((_, i) => <div key={`pad-${i}`} className="aspect-square" />)}
          {dias.map(d => {
            const diaNombre = DAYS[d.getDay()]
            const esLaboral = DIAS_HABILES.includes(diaNombre)
            const bloquesDelDia = bloquesAcademicos.filter(h => h.dia === diaNombre)
            const isHoy = d.toDateString() === new Date().toDateString()
            const completados = bloquesDelDia.filter(b => estado[b.uid]).length
            const todasCompletadas = bloquesDelDia.length > 0 && completados === bloquesDelDia.length

            return (
              <div
                key={d.toISOString()}
                className={cn(
                  "aspect-square rounded-[8px] border p-1 flex flex-col gap-0.5 min-h-[80px]",
                  isHoy ? "border-primary border-2 bg-pink-light" :
                  esLaboral ? "border-border bg-background" :
                              "border-transparent bg-muted/20",
                  todasCompletadas && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/40"
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("text-[11px] font-bold", isHoy && "text-primary", !esLaboral && "text-muted-foreground")}>{d.getDate()}</span>
                  {todasCompletadas && <Check className="h-2.5 w-2.5 text-emerald-600" />}
                </div>
                {esLaboral && bloquesDelDia.length > 0 && (
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {bloquesDelDia.slice(0, 3).map(b => (
                      <span
                        key={b.uid}
                        className="text-[8.5px] font-bold px-1 py-0.5 rounded truncate text-white"
                        style={{ background: b.color, opacity: estado[b.uid] ? 0.7 : 1 }}
                        title={`${b.resumen} ${b.horaInicio}-${b.horaFin}`}
                      >
                        {b.horaInicio.slice(0, 5)} {b.resumen.slice(0, 8)}
                      </span>
                    ))}
                    {bloquesDelDia.length > 3 && (
                      <span className="text-[9px] text-muted-foreground">+{bloquesDelDia.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[10.5px]">
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-200 dark:bg-emerald-900/60" /> <span className="text-muted-foreground">Día completo</span></span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-pink-light border border-primary" /> <span className="text-muted-foreground">Hoy</span></span>
          <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-muted/40" /> <span className="text-muted-foreground">Fin de semana</span></span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCardLarge label="Cursos" value={cursoStats.length.toString()} sub="académicos" icon={GraduationCap} cls="from-violet-500 to-fuchsia-500" />
        <KpiCardLarge label="Total alumnos" value={cursoStats.reduce((s, c) => s + c.alumnos, 0).toString()} sub="bajo tu cargo" icon={Users} cls="from-cyan-500 to-blue-500" />
        <KpiCardLarge label="Bloques/semana" value={bloquesAcademicos.length.toString()} sub="académicos" icon={Calendar} cls="from-emerald-500 to-teal-500" />
      </div>
    </div>
  )
}

function KpiCardLarge({ label, value, sub, icon: Icon, cls }: { label: string; value: string; sub: string; icon: typeof Users; cls: string }) {
  return (
    <div className={`relative overflow-hidden rounded-[14px] bg-gradient-to-br ${cls} p-4 text-white`}>
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-white/10 blur-xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <Icon className="h-5 w-5 opacity-80" />
          <span className="text-[10px] font-bold uppercase opacity-80">{label}</span>
        </div>
        <div className="mt-2 text-[28px] font-extrabold leading-none">{value}</div>
        <div className="text-[11px] opacity-80 mt-1">{sub}</div>
      </div>
    </div>
  )
}

// ─── Tab Insights ─────────────────────────────────────────────────────────────
function InsightsTab({ horario, cursoStats, estado }: {
  horario: ClaseHorario[]
  cursoStats: CursoStats[]
  estado: Record<string, boolean>
}) {
  const distribucionAsist: { curso: string; color: string; pct: number }[] = []

  const horarioAcademico = horario.filter(h => !esTipoLibre(h.tipo))
  const horarioLibre = horario.filter(h => esTipoLibre(h.tipo))

  const completadasHoy = Object.values(estado).filter(Boolean).length
  const totalHoyEnHorario = horarioAcademico.filter(h => h.dia === DAYS[new Date().getDay()]).length

  const insights: { titulo: string; texto: string; icon: typeof Sparkles; tono: "ok" | "amber" | "rojo" | "info" }[] = []
  if (cursoStats.length === 0) {
    insights.push({ titulo: "Sin cursos configurados", texto: "Agrega bloques con tipo 'clase' en Mi Perfil para empezar.", icon: AlertCircle, tono: "amber" })
  }
  if (totalHoyEnHorario > 0 && completadasHoy === totalHoyEnHorario) {
    insights.push({ titulo: "Día perfecto", texto: "Marcaste todas tus clases del día como completadas.", icon: Check, tono: "ok" })
  }
  if (horarioLibre.length > 0) {
    insights.push({ titulo: `${horarioLibre.length} bloque(s) libre(s)`, texto: "Almuerzo, recreo, planificación. Estos no cuentan como clase.", icon: Coffee, tono: "info" })
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[14px] border border-border bg-card p-5">
          <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Insights de tu mes
          </h3>
          {insights.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic">Sin insights destacados aún. Mientras más uses la plataforma, más datos podemos analizar.</p>
          ) : (
            <ul className="space-y-2">
              {insights.map((ins, i) => {
                const Icon = ins.icon
                const tono =
                  ins.tono === "ok"   ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100" :
                  ins.tono === "amber"? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100" :
                  ins.tono === "rojo" ? "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100" :
                                        "border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 text-blue-900 dark:text-blue-100"
                return (
                  <li key={i} className={cn("flex items-start gap-2 rounded-[10px] border p-3", tono)}>
                    <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <h4 className="text-[12.5px] font-extrabold">{ins.titulo}</h4>
                      <p className="text-[11.5px] opacity-90 mt-0.5">{ins.texto}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="rounded-[14px] border border-border bg-card p-5">
          <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" /> Asistencia por curso (prototipo)
          </h3>
          {distribucionAsist.length === 0 ? (
            <p className="text-[12px] text-muted-foreground italic">Módulo visible como prototipo. No calcula ni registra asistencia real.</p>
          ) : (
            <div className="space-y-2.5">
              {distribucionAsist.map(c => (
                <div key={c.curso} className="space-y-1">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <div className="flex items-center gap-1.5">
                      <span className="h-3 w-3 rounded-sm flex-shrink-0" style={{ background: c.color }} />
                      <span className="font-semibold truncate">{c.curso}</span>
                    </div>
                    <span className={cn(
                      "font-extrabold",
                      c.pct >= 85 ? "text-emerald-600" :
                      c.pct >= 70 ? "text-amber-600" :
                      c.pct > 0   ? "text-rose-600" : "text-muted-foreground"
                    )}>
                      {c.pct > 0 ? `${c.pct}%` : "—"}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        c.pct >= 85 ? "bg-emerald-500" :
                        c.pct >= 70 ? "bg-amber-500" :
                                      "bg-rose-500"
                      )}
                      style={{ width: `${Math.min(100, c.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-[14px] border border-border bg-card p-5">
        <h3 className="text-[14px] font-extrabold mb-3 inline-flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary" /> Mapa de tu semana
        </h3>
        <div className="grid gap-1 grid-cols-5">
          {DIAS_HABILES.map(d => {
            const bloques = horarioAcademico.filter(h => h.dia === d).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
            return (
              <div key={d} className="rounded-[10px] border border-border bg-background p-2">
                <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">{d.slice(0, 3)}</div>
                <div className="space-y-0.5">
                  {bloques.length === 0 ? (
                    <span className="text-[10px] text-muted-foreground italic">Libre</span>
                  ) : (
                    bloques.map(b => (
                      <div
                        key={b.uid}
                        className="text-[9px] px-1 py-0.5 rounded text-white truncate"
                        style={{ background: b.color }}
                        title={`${b.resumen} ${b.horaInicio}-${b.horaFin}`}
                      >
                        {b.horaInicio.slice(0, 5)}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
