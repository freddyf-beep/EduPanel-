"use client"

import { useAuth } from "@/components/auth/auth-context"
import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  cargarPerfil, guardarPerfil, PerfilUsuario,
  cargarInfoColegio, guardarInfoColegio, InfoColegio,
  cargarPreferencias, guardarPreferencias,
} from "@/lib/perfil"
import { getAsignaturasDisponibles } from "@/lib/curriculo"
import {
  agruparHorarioPorCurso, cargarHorarioSemanal, colisionaConHorario,
  guardarHorarioSemanal, ClaseHorario, esTipoLibre, TipoHorario,
} from "@/lib/horario"
import {
  cargarNivelMapping, guardarNivelMapping, NIVELES_CURRICULARES, type NivelMapping,
  cargarCursoTipos, guardarCursoTipos, type CursoTipoMap, type TipoCurricular,
} from "@/lib/nivel-mapping"
import {
  cargarEstudiantes, guardarEstudiantes, compareEstudiantes, Estudiante,
  extractImportedStudents, mergeImportedStudents,
} from "@/lib/estudiantes"
import {
  desconectarGoogleCalendar, getGoogleCalendarToken,
  isGoogleCalendarAutosyncEnabled, isGoogleCalendarConnected,
  setGoogleCalendarAutosync, sincronizarCronogramasGoogle,
} from "@/lib/google-calendar"
import {
  desconectarGoogleDrive,
  isGoogleDriveAutosaveEnabled,
  isGoogleDriveConnected,
  setGoogleDriveAutosave,
} from "@/lib/google-drive"
import { DEFAULT_ASIGNATURA, SUBJECT_STORAGE_KEY, UNIT_COLORS } from "@/lib/shared"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { MigracionPerfilBanner } from "@/components/edu-panel/perfil/migracion-perfil-banner"
import { BloqueWizard } from "@/components/edu-panel/perfil/bloque-wizard"
import { DriveWorkspaceActions } from "@/components/edu-panel/drive/drive-workspace-actions"
import {
  LayoutDashboard, CalendarRange, Folder, BookMarked, IdCard, Plug,
  Loader2, Plus, Trash2, Pencil, Clock, Users, Calendar, CheckCircle,
  AlertCircle, X, Upload, School, Sparkles, ArrowRight, ChevronRight,
  GraduationCap, Briefcase, FileText, Hash, RefreshCw, Save,
  Coffee, Brain, BedDouble, Music, ClipboardList, BookOpen, Palette, Check,
  GripVertical, HardDrive, ShieldCheck,
} from "lucide-react"

// ─────────────────────────────────────────────────────────────────────────────
//   Tipos y constantes
// ─────────────────────────────────────────────────────────────────────────────

type TabKey = "resumen" | "semana" | "cursos" | "asignaturas" | "identidad" | "conexiones"

const TABS: Array<{ key: TabKey; label: string; icon: any; descripcion: string }> = [
  { key: "resumen",      label: "Resumen",        icon: LayoutDashboard, descripcion: "Vista general de tu trabajo docente" },
  { key: "semana",       label: "Mi Semana",      icon: CalendarRange,   descripcion: "Grilla visual de tu horario" },
  { key: "cursos",       label: "Mis Cursos",     icon: Folder,          descripcion: "Cursos, bloques, niveles y estudiantes" },
  { key: "asignaturas",  label: "Asignaturas",    icon: BookMarked,      descripcion: "Qué enseñas y a qué nivel" },
  { key: "identidad",    label: "Identidad",      icon: IdCard,          descripcion: "Datos profesionales y colegio" },
  { key: "conexiones",   label: "Conexiones",     icon: Plug,            descripcion: "Google Calendar y otros" },
]

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"] as const

const TIPO_META: Record<TipoHorario, { label: string; icon: any; libre: boolean }> = {
  clase:         { label: "Clase",          icon: BookOpen,      libre: false },
  taller:        { label: "Taller",         icon: Music,         libre: false },
  consejo:       { label: "Consejo",        icon: ClipboardList, libre: true  },
  orientacion:   { label: "Orientación",    icon: Users,         libre: false },
  trabajo_colaborativo: { label: "Trabajo colaborativo", icon: Users, libre: true },
  no_lectivo:    { label: "No lectivo",     icon: FileText,      libre: true  },
  almuerzo:      { label: "Almuerzo",       icon: Coffee,        libre: true  },
  planificacion: { label: "Planificación",  icon: Brain,         libre: true  },
  recreo:        { label: "Recreo",         icon: BedDouble,     libre: true  },
  libre:         { label: "Bloque libre",   icon: Clock,         libre: true  },
}

const ETIQUETA_TIPO_LIBRE: Record<string, string> = {
  consejo: "Consejo de profesores",
  trabajo_colaborativo: "Trabajo colaborativo",
  no_lectivo: "Bloque no lectivo",
  almuerzo: "Almuerzo",
  planificacion: "Planificación",
  recreo: "Recreo",
  libre: "Bloque libre",
}

// Presets de banner del perfil v2. El usuario puede elegir uno o usar custom.
const BANNER_PRESETS: Array<{ key: string; label: string; css: string }> = [
  { key: "rosa",      label: "Rosa",      css: "linear-gradient(135deg, #EC4899 0%, #F472B6 50%, #EC4899 100%)" },
  { key: "oceano",    label: "Océano",    css: "linear-gradient(135deg, #0EA5E9 0%, #38BDF8 50%, #0284C7 100%)" },
  { key: "atardecer", label: "Atardecer", css: "linear-gradient(135deg, #F97316 0%, #FB7185 50%, #A855F7 100%)" },
  { key: "esmeralda", label: "Esmeralda", css: "linear-gradient(135deg, #10B981 0%, #34D399 50%, #059669 100%)" },
  { key: "indigo",    label: "Índigo",    css: "linear-gradient(135deg, #4F46E5 0%, #7C3AED 50%, #6366F1 100%)" },
  { key: "grafito",   label: "Grafito",   css: "linear-gradient(135deg, #1F2937 0%, #374151 50%, #111827 100%)" },
  { key: "bosque",    label: "Bosque",    css: "linear-gradient(135deg, #064E3B 0%, #10B981 50%, #064E3B 100%)" },
  { key: "lavanda",   label: "Lavanda",   css: "linear-gradient(135deg, #A78BFA 0%, #F472B6 50%, #C084FC 100%)" },
]
const DEFAULT_BANNER_KEY = "rosa"

function resolveBannerCss(style: string | undefined): string {
  if (!style) return BANNER_PRESETS[0].css
  const preset = BANNER_PRESETS.find(p => p.key === style)
  if (preset) return preset.css
  return style // CSS literal directo
}

// ─────────────────────────────────────────────────────────────────────────────
//   Helpers
// ─────────────────────────────────────────────────────────────────────────────

function horaToMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

function duracionBloque(b: ClaseHorario): number {
  return Math.max(0, horaToMinutos(b.horaFin) - horaToMinutos(b.horaInicio))
}

function formatHorasMin(minutos: number): string {
  if (minutos <= 0) return "0 h"
  const horas = minutos / 60
  return Number.isInteger(horas) ? `${horas} h` : `${horas.toFixed(1)} h`
}

function colorPorIndice(index: number): string {
  return UNIT_COLORS[index % UNIT_COLORS.length]
}

function getNextStudentOrder(ests: Estudiante[]): number {
  const max = ests.reduce((m, e) => {
    const o = typeof e.orden === "number" && Number.isFinite(e.orden) ? e.orden : 0
    return Math.max(m, o)
  }, 0)
  return max + 1
}

// ─────────────────────────────────────────────────────────────────────────────
//   UI atómica
// ─────────────────────────────────────────────────────────────────────────────

function Kpi({
  icon: Icon, label, value, accent, hint,
}: {
  icon: any; label: string; value: string | number; accent: string; hint?: string
}) {
  return (
    <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div
          className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
          style={{ backgroundColor: `${accent}1a`, color: accent }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-[20px] font-extrabold leading-tight text-foreground">{value}</div>
          {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ icon: Icon, title, hint }: { icon: any; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h2 className="text-[15px] font-extrabold text-foreground">{title}</h2>
      {hint && <span className="text-[12px] text-muted-foreground">— {hint}</span>}
    </div>
  )
}

function SaveBadge({ status }: { status: "idle" | "saving" | "saved" | "error" }) {
  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
      </span>
    )
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-600">
        <CheckCircle className="h-3 w-3" /> Guardado
      </span>
    )
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-500">
        <AlertCircle className="h-3 w-3" /> Error
      </span>
    )
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
//   Componente principal
// ─────────────────────────────────────────────────────────────────────────────

export function PerfilShell({ isOnboardingMode = false }: { isOnboardingMode?: boolean }) {
  const { user, signInWithGoogleCalendar, signInWithGoogleDrive } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const routeBase = "/perfil"

  const tabFromUrl = (searchParams.get("tab") as TabKey) || "resumen"
  const [tab, setTab] = useState<TabKey>(TABS.find(t => t.key === tabFromUrl) ? tabFromUrl : "resumen")

  // ── Loading global ──
  const [loading, setLoading] = useState(true)

  // ── Datos centrales ──
  const [perfil, setPerfil] = useState<PerfilUsuario>({ tipoProfesor: "", especialidad: "", estudios: "", biografia: "" })
  const [colegio, setColegio] = useState<InfoColegio>({ nombre: "" })
  const [horario, setHorario] = useState<ClaseHorario[]>([])
  const [nivelMapping, setNivelMapping] = useState<NivelMapping>({})
  const [cursoTipos, setCursoTipos] = useState<CursoTipoMap>({})
  const [asignaturasDisponibles, setAsignaturasDisponibles] = useState<string[]>([])
  const [asignaturasHabilitadas, setAsignaturasHabilitadas] = useState<string[] | null>(null)
  const [bannerStyle, setBannerStyle] = useState<string>(DEFAULT_BANNER_KEY)

  // Estudiantes por curso (cache lazy)
  const [estudiantesPorCurso, setEstudiantesPorCurso] = useState<Record<string, Estudiante[]>>({})
  const [estudiantesLoaded, setEstudiantesLoaded] = useState<Record<string, boolean>>({})

  // ── Estados de guardado ──
  const [savePerfil, setSavePerfil] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveColegio, setSaveColegio] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveHorario, setSaveHorario] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveMapping, setSaveMapping] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [saveAsignaturas, setSaveAsignaturas] = useState<"idle" | "saving" | "saved" | "error">("idle")

  // ── Calendar ──
  const [calendarConnected, setCalendarConnected] = useState(false)
  const [calendarAutosync, setCalendarAutosyncState] = useState(true)
  const [connectingCalendar, setConnectingCalendar] = useState(false)
  const [syncingCalendar, setSyncingCalendar] = useState(false)
  const [calendarMessage, setCalendarMessage] = useState<string | null>(null)

  // ── Drive ──
  const [driveConnected, setDriveConnected] = useState(false)
  const [driveAutosave, setDriveAutosaveState] = useState(false)
  const [connectingDrive, setConnectingDrive] = useState(false)
  const [driveMessage, setDriveMessage] = useState<string | null>(null)

  // ── Refs autosave ──
  const ignoreFirstHorarioRef = useRef(true)
  const ignoreFirstMappingRef = useRef(true)
  const horarioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mappingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const colegioTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ignoreFirstColegioRef = useRef(true)

  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const logoDerInputRef = useRef<HTMLInputElement | null>(null)

  // ── Derivados ──
  const cursosDisponibles = useMemo(
    () => Array.from(new Set(horario.filter(h => !esTipoLibre(h.tipo)).map(h => h.resumen))),
    [horario]
  )
  const horarioPorCurso = useMemo(
    () => Array.from(agruparHorarioPorCurso(horario).entries()).sort((a, b) => a[0].localeCompare(b[0], "es")),
    [horario]
  )
  const bloquesLibres = useMemo(
    () => {
      const order: Record<string, number> = { Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5 }
      return horario
        .filter(b => esTipoLibre(b.tipo))
        .sort((a, b) => (order[a.dia] ?? 99) - (order[b.dia] ?? 99) || a.horaInicio.localeCompare(b.horaInicio))
    },
    [horario]
  )

  // Stats globales
  const totalMinutosClases = useMemo(() => {
    return horario.filter(h => !esTipoLibre(h.tipo)).reduce((acc, b) => acc + duracionBloque(b), 0)
  }, [horario])
  const totalMinutosLibres = useMemo(() => {
    return horario.filter(h => esTipoLibre(h.tipo)).reduce((acc, b) => acc + duracionBloque(b), 0)
  }, [horario])
  const totalEstudiantes = useMemo(() => {
    return Object.values(estudiantesPorCurso).reduce((acc, arr) => acc + arr.length, 0)
  }, [estudiantesPorCurso])
  const totalPie = useMemo(() => {
    return Object.values(estudiantesPorCurso).reduce((acc, arr) => acc + arr.filter(e => e.pie).length, 0)
  }, [estudiantesPorCurso])

  // Solo cuenta como "sin nivel" si el curso es de tipo "oficial" (default).
  // Talleres y libres no requieren nivel curricular.
  const cursosSinNivel = useMemo(
    () => cursosDisponibles.filter(c => {
      const tipo = cursoTipos[c] ?? "oficial"
      return tipo === "oficial" && !nivelMapping[c]
    }),
    [cursosDisponibles, nivelMapping, cursoTipos]
  )

  // ── Carga inicial ──
  useEffect(() => {
    Promise.allSettled([
      cargarPerfil(),
      cargarHorarioSemanal(),
      cargarNivelMapping(),
      cargarInfoColegio(),
      cargarPreferencias(),
      getAsignaturasDisponibles(),
      cargarCursoTipos(),
    ])
      .then((results) => {
        const [perfilResult, horarioResult, mappingResult, colegioResult, prefResult, asignaturasResult, tiposResult] = results
        const pData = perfilResult.status === "fulfilled" ? perfilResult.value : null
        const hData = horarioResult.status === "fulfilled" ? horarioResult.value : null
        const mapping = mappingResult.status === "fulfilled" ? mappingResult.value : null
        const colegioData = colegioResult.status === "fulfilled" ? colegioResult.value : null
        const prefData = prefResult.status === "fulfilled" ? prefResult.value : null
        const asignaturas = asignaturasResult.status === "fulfilled" ? asignaturasResult.value : [] as string[]
        const tipos = tiposResult.status === "fulfilled" ? tiposResult.value : {} as CursoTipoMap
        const failedLoads = results.filter(result => result.status === "rejected")

        if (failedLoads.length > 0) {
          console.warn("[perfil] algunas secciones no pudieron cargarse", failedLoads)
          toast({
            title: "Carga parcial del perfil",
            description: "Algunas secciones no respondieron. Tus datos guardados no se borraron; intenta refrescar si algo aparece vacio.",
            variant: "destructive",
          })
        }

        if (pData) setPerfil(pData)
        if (hData) setHorario(hData)
        if (mapping) setNivelMapping(mapping)
        if (colegioData) setColegio(colegioData)
        setAsignaturasDisponibles(asignaturas)
        setAsignaturasHabilitadas(prefData?.asignaturasHabilitadas ?? [...asignaturas])
        if (prefData?.bannerStyle) setBannerStyle(prefData.bannerStyle)
        if (tipos) setCursoTipos(tipos)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // Auto-cargar estudiantes de TODOS los cursos al inicio (para stats)
  useEffect(() => {
    if (!cursosDisponibles.length) return
    cursosDisponibles.forEach(curso => {
      if (estudiantesLoaded[curso]) return
      cargarEstudiantes(curso)
        .then(arr => {
          setEstudiantesPorCurso(prev => ({ ...prev, [curso]: arr }))
          setEstudiantesLoaded(prev => ({ ...prev, [curso]: true }))
        })
        .catch(console.error)
    })
  }, [cursosDisponibles]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCalendarConnected(isGoogleCalendarConnected())
    setCalendarAutosyncState(isGoogleCalendarAutosyncEnabled())
    setDriveConnected(isGoogleDriveConnected())
    setDriveAutosaveState(isGoogleDriveAutosaveEnabled())
  }, [])

  // Sync tab → URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === "resumen") params.delete("tab")
    else params.set("tab", tab)
    const qs = params.toString()
    router.replace(qs ? `${routeBase}?${qs}` : routeBase, { scroll: false })
  }, [tab, routeBase]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosaves ──
  useEffect(() => {
    if (ignoreFirstHorarioRef.current) { ignoreFirstHorarioRef.current = false; return }
    if (horarioTimerRef.current) clearTimeout(horarioTimerRef.current)
    setSaveHorario("saving")
    horarioTimerRef.current = setTimeout(async () => {
      try {
        await guardarHorarioSemanal(horario)
        setSaveHorario("saved")
        setTimeout(() => setSaveHorario("idle"), 1500)
      } catch (err) {
        console.error(err)
        setSaveHorario("error")
        toast({ title: "No se pudo guardar el horario", variant: "destructive" })
      }
    }, 1500)
    return () => { if (horarioTimerRef.current) clearTimeout(horarioTimerRef.current) }
  }, [horario])

  useEffect(() => {
    if (ignoreFirstMappingRef.current) { ignoreFirstMappingRef.current = false; return }
    if (mappingTimerRef.current) clearTimeout(mappingTimerRef.current)
    setSaveMapping("saving")
    mappingTimerRef.current = setTimeout(async () => {
      try {
        await guardarNivelMapping(nivelMapping)
        await guardarCursoTipos(cursoTipos)
        setSaveMapping("saved")
        setTimeout(() => setSaveMapping("idle"), 1500)
      } catch (err) {
        console.error(err)
        setSaveMapping("error")
      }
    }, 1500)
    return () => { if (mappingTimerRef.current) clearTimeout(mappingTimerRef.current) }
  }, [nivelMapping, cursoTipos])

  useEffect(() => {
    if (ignoreFirstColegioRef.current) { ignoreFirstColegioRef.current = false; return }
    if (colegioTimerRef.current) clearTimeout(colegioTimerRef.current)
    setSaveColegio("saving")
    colegioTimerRef.current = setTimeout(async () => {
      try {
        await guardarInfoColegio(colegio)
        setSaveColegio("saved")
        setTimeout(() => setSaveColegio("idle"), 1500)
      } catch (err) {
        console.error(err)
        setSaveColegio("error")
      }
    }, 2000)
    return () => { if (colegioTimerRef.current) clearTimeout(colegioTimerRef.current) }
  }, [colegio])

  // ── Handlers ──
  const handleSavePerfil = async () => {
    setSavePerfil("saving")
    try {
      await guardarPerfil(perfil)
      setSavePerfil("saved")
      setTimeout(() => setSavePerfil("idle"), 2000)
    } catch (err) {
      console.error(err)
      setSavePerfil("error")
      toast({ title: "No se pudo guardar el perfil", variant: "destructive" })
    }
  }

  const handleToggleAsignatura = async (nombre: string) => {
    if (asignaturasHabilitadas === null) return
    const yaEsta = asignaturasHabilitadas.includes(nombre)
    const next = yaEsta ? asignaturasHabilitadas.filter(a => a !== nombre) : [...asignaturasHabilitadas, nombre]
    setAsignaturasHabilitadas(next)
    setSaveAsignaturas("saving")
    try {
      await guardarPreferencias({ asignaturasHabilitadas: next, bannerStyle })
      setSaveAsignaturas("saved")
      setTimeout(() => setSaveAsignaturas("idle"), 1500)
    } catch {
      setAsignaturasHabilitadas(asignaturasHabilitadas)
      setSaveAsignaturas("error")
    }
  }

  const handleChangeBanner = async (style: string) => {
    const prev = bannerStyle
    setBannerStyle(style)
    try {
      await guardarPreferencias({ asignaturasHabilitadas: asignaturasHabilitadas ?? [], bannerStyle: style })
    } catch (err) {
      console.error(err)
      setBannerStyle(prev)
      toast({ title: "No se pudo guardar el fondo", variant: "destructive" })
    }
  }

  // Bloques: agregar / actualizar / borrar
  const upsertBloque = (b: ClaseHorario) => {
    setHorario(prev => {
      const exists = prev.some(x => x.uid === b.uid)
      return exists ? prev.map(x => x.uid === b.uid ? b : x) : [...prev, b]
    })
  }
  const removeBloque = (uid: string) => {
    setHorario(prev => prev.filter(x => x.uid !== uid))
  }
  const removeCursoCompleto = (curso: string) => {
    setHorario(prev => prev.filter(x => x.resumen !== curso))
  }
  const renombrarCurso = (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return
    setHorario(prev => prev.map(x => x.resumen === oldName ? { ...x, resumen: newName } : x))
    if (nivelMapping[oldName]) {
      setNivelMapping(prev => {
        const next = { ...prev, [newName]: prev[oldName] }
        delete next[oldName]
        return next
      })
    }
  }
  const cambiarColorCurso = (curso: string, color: string) => {
    setHorario(prev => prev.map(x => x.resumen === curso ? { ...x, color } : x))
  }

  // Estudiantes
  const setEstudiantesCurso = (curso: string, ests: Estudiante[]) => {
    setEstudiantesPorCurso(prev => ({ ...prev, [curso]: ests }))
  }
  const guardarEstudiantesCurso = async (curso: string) => {
    try {
      await guardarEstudiantes(curso, estudiantesPorCurso[curso] || [])
    } catch (err) {
      console.error(err)
      toast({ title: `Error al guardar estudiantes de ${curso}`, variant: "destructive" })
    }
  }

  // Calendar
  const handleConnectCalendar = async () => {
    setConnectingCalendar(true); setCalendarMessage(null)
    try {
      await signInWithGoogleCalendar()
      setCalendarConnected(true)
      setCalendarAutosyncState(isGoogleCalendarAutosyncEnabled())
      setCalendarMessage("Google Calendar conectado.")
    } catch (err) {
      console.error(err)
      setCalendarMessage("No se pudo conectar Google Calendar.")
    } finally { setConnectingCalendar(false) }
  }
  const handleDisconnectCalendar = () => {
    desconectarGoogleCalendar()
    setCalendarConnected(false)
    setCalendarMessage("Google Calendar desconectado.")
  }
  const handleSyncCalendarNow = async () => {
    const token = getGoogleCalendarToken()
    if (!token) { setCalendarConnected(false); setCalendarMessage("Reconecta Google Calendar."); return }
    setSyncingCalendar(true); setCalendarMessage(null)
    try {
      const asignatura = typeof window !== "undefined"
        ? window.localStorage.getItem(SUBJECT_STORAGE_KEY) || DEFAULT_ASIGNATURA
        : DEFAULT_ASIGNATURA
      const res = await sincronizarCronogramasGoogle({
        accessToken: token, asignatura, year: new Date().getFullYear(),
      })
      setCalendarMessage(`Sincronizado: ${res.creados} nuevos, ${res.actualizados} actualizados, ${res.eliminados} eliminados.`)
    } catch (err) {
      console.error(err)
      setCalendarMessage("No se pudo sincronizar. Reconecta Google Calendar e intenta de nuevo.")
    } finally { setSyncingCalendar(false) }
  }

  // Drive
  const handleConnectDrive = async () => {
    setConnectingDrive(true); setDriveMessage(null)
    try {
      await signInWithGoogleDrive()
      setDriveConnected(isGoogleDriveConnected())
      setDriveAutosaveState(isGoogleDriveAutosaveEnabled())
      setDriveMessage(isGoogleDriveAutosaveEnabled()
        ? "Google Drive conectado. Auto-respaldo Drive activado."
        : "Google Drive conectado."
      )
    } catch (err) {
      console.error(err)
      setDriveMessage("No se pudo conectar Google Drive.")
    } finally { setConnectingDrive(false) }
  }
  const handleDisconnectDrive = () => {
    desconectarGoogleDrive()
    setDriveConnected(false)
    setDriveAutosaveState(false)
    setDriveMessage("Google Drive desconectado.")
  }

  // Logos uploader
  const makeLogoUploader = (field: "logoBase64" | "logoDerBase64") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]; if (!file) return
      if (file.size > 1024 * 1024) { toast({ title: "El logo no debe superar 1 MB", variant: "destructive" }); return }
      const reader = new FileReader()
      reader.onload = ev => {
        const img = new Image()
        img.onload = () => {
          const maxPx = 300
          const scale = Math.min(1, maxPx / Math.max(img.width, img.height))
          const canvas = document.createElement("canvas")
          canvas.width = Math.round(img.width * scale)
          canvas.height = Math.round(img.height * scale)
          canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
          const base64 = canvas.toDataURL("image/jpeg", 0.85)
          setColegio(prev => ({ ...prev, [field]: base64 }))
        }
        img.src = ev.target?.result as string
      }
      reader.readAsDataURL(file)
    }
  const handleLogoUpload = makeLogoUploader("logoBase64")
  const handleLogoDerUpload = makeLogoUploader("logoDerBase64")

  // Lista de asignaturas a sugerir en autocomplete: las habilitadas, o todas las disponibles
  // IMPORTANTE: este useMemo va ANTES de cualquier early return para no romper el orden de hooks.
  const asignaturasSugeridas = useMemo(() => {
    const base = (asignaturasHabilitadas && asignaturasHabilitadas.length > 0)
      ? asignaturasHabilitadas
      : asignaturasDisponibles
    // Añadir cualquier asignatura que ya esté en uso pero no esté en la lista (compatibilidad)
    const enUso = new Set(horario.map(b => (b.asignatura || "").trim()).filter(Boolean))
    const merged = new Set([...base, ...enUso])
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "es"))
  }, [asignaturasHabilitadas, asignaturasDisponibles, horario])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // Configuración % completa
  const totalSetup = 5 // perfil, colegio, horario, mapping, estudiantes
  let setupDone = 0
  if (perfil.tipoProfesor) setupDone++
  if (colegio.nombre) setupDone++
  if (cursosDisponibles.length > 0) setupDone++
  if (cursosDisponibles.length > 0 && cursosSinNivel.length === 0) setupDone++
  if (totalEstudiantes > 0) setupDone++
  const setupPct = Math.round((setupDone / totalSetup) * 100)
  const onboardingReady = cursosDisponibles.length > 0

  const handleFinishOnboarding = async () => {
    if (!onboardingReady) {
      setTab("semana")
      toast({
        title: "Falta tu primer curso",
        description: "Crea al menos un bloque lectivo para entrar al dashboard.",
        variant: "destructive",
      })
      return
    }
    setLoading(true)
    try {
      const prevPref = await cargarPreferencias()
      await guardarPreferencias({ ...(prevPref || {}), onboardingCompletado: true })
      router.push("/")
    } catch (err) {
      console.error(err)
      setLoading(false)
      toast({ title: "No se pudo finalizar el inicio", variant: "destructive" })
    }
  }

  return (
    <div className="mx-auto max-w-[1320px] space-y-6 px-0 pt-2 sm:pt-4 lg:pt-6 pb-20">

      {isOnboardingMode && (
        <div className="sticky top-0 z-50 rounded-xl border-2 border-primary bg-primary/10 p-4 shadow-lg backdrop-blur mb-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-foreground flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              ¡Te damos la bienvenida a EduPanel!
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Este es tu panel inicial. Configura cursos, asignaturas, identidad y conexiones antes de entrar al dashboard diario.
            </p>
          </div>
          <button
            onClick={handleFinishOnboarding}
            disabled={!onboardingReady}
            title={onboardingReady ? "Entrar al dashboard" : "Primero crea al menos un curso con bloques lectivos"}
            className="flex-shrink-0 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-extrabold text-primary-foreground transition-all hover:scale-105 shadow-md disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          >
            Entrar al Dashboard <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── Hero ─── */}
      <HeroBanner
        user={user}
        perfil={perfil}
        colegio={colegio}
        cursosCount={cursosDisponibles.length}
        bloquesCount={horario.filter(h => !esTipoLibre(h.tipo)).length}
        estudiantesCount={totalEstudiantes}
        horasSemanales={formatHorasMin(totalMinutosClases)}
        pieCount={totalPie}
        setupPct={setupPct}
        bloquesLibres={bloquesLibres.length}
        horasLibres={formatHorasMin(totalMinutosLibres)}
        bannerStyle={bannerStyle}
        onChangeBanner={handleChangeBanner}
      />

      {/* ─── Tabs ─── */}
      <TabsBar tab={tab} setTab={setTab} />

      {/* ─── Contenido ─── */}
      <div className="pb-12">
        {tab === "resumen" && (
          <ResumenView
            perfil={perfil}
            colegio={colegio}
            horario={horario}
            cursos={cursosDisponibles}
            horarioPorCurso={horarioPorCurso}
            estudiantesPorCurso={estudiantesPorCurso}
            nivelMapping={nivelMapping}
            cursosSinNivel={cursosSinNivel}
            bloquesLibres={bloquesLibres}
            setupPct={setupPct}
            setTab={setTab}
          />
        )}
        {tab === "semana" && (
          <SemanaView
            horario={horario}
            upsertBloque={upsertBloque}
            removeBloque={removeBloque}
            saveStatus={saveHorario}
            asignaturasSugeridas={asignaturasSugeridas}
          />
        )}
        {tab === "cursos" && (
          <CursosView
            horario={horario}
            horarioPorCurso={horarioPorCurso}
            nivelMapping={nivelMapping}
            setNivelMapping={setNivelMapping}
            cursoTipos={cursoTipos}
            setCursoTipos={setCursoTipos}
            estudiantesPorCurso={estudiantesPorCurso}
            estudiantesLoaded={estudiantesLoaded}
            setEstudiantesCurso={setEstudiantesCurso}
            guardarEstudiantesCurso={guardarEstudiantesCurso}
            upsertBloque={upsertBloque}
            removeBloque={removeBloque}
            removeCursoCompleto={removeCursoCompleto}
            renombrarCurso={renombrarCurso}
            cambiarColorCurso={cambiarColorCurso}
            saveHorario={saveHorario}
            saveMapping={saveMapping}
            asignaturasSugeridas={asignaturasSugeridas}
          />
        )}
        {tab === "asignaturas" && (
          <AsignaturasView
            asignaturasDisponibles={asignaturasDisponibles}
            asignaturasHabilitadas={asignaturasHabilitadas}
            handleToggleAsignatura={handleToggleAsignatura}
            saveStatus={saveAsignaturas}
            cursosDisponibles={cursosDisponibles}
            nivelMapping={nivelMapping}
            setNivelMapping={setNivelMapping}
            cursoTipos={cursoTipos}
            setCursoTipos={setCursoTipos}
            saveMapping={saveMapping}
          />
        )}
        {tab === "identidad" && (
          <IdentidadView
            perfil={perfil}
            setPerfil={setPerfil}
            colegio={colegio}
            setColegio={setColegio}
            handleSavePerfil={handleSavePerfil}
            savePerfil={savePerfil}
            saveColegio={saveColegio}
            logoInputRef={logoInputRef}
            logoDerInputRef={logoDerInputRef}
            handleLogoUpload={handleLogoUpload}
            handleLogoDerUpload={handleLogoDerUpload}
          />
        )}
        {tab === "conexiones" && (
          <ConexionesViewV2
            calendarConnected={calendarConnected}
            calendarAutosync={calendarAutosync}
            connectingCalendar={connectingCalendar}
            syncingCalendar={syncingCalendar}
            calendarMessage={calendarMessage}
            handleConnectCalendar={handleConnectCalendar}
            handleDisconnectCalendar={handleDisconnectCalendar}
            handleSyncCalendarNow={handleSyncCalendarNow}
            setCalendarAutosync={(v: boolean) => { setGoogleCalendarAutosync(v); setCalendarAutosyncState(v) }}
            driveConnected={driveConnected}
            driveAutosave={driveAutosave}
            connectingDrive={connectingDrive}
            driveMessage={driveMessage}
            handleConnectDrive={handleConnectDrive}
            handleDisconnectDrive={handleDisconnectDrive}
            setDriveAutosave={(v: boolean) => {
              setGoogleDriveAutosave(v)
              setDriveAutosaveState(v)
              setDriveMessage(v ? "Auto-respaldo Drive activado. Se actualizara Word y JSON al guardar." : "Auto-respaldo Drive desactivado.")
            }}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Hero banner
// ─────────────────────────────────────────────────────────────────────────────

function HeroBanner({
  user, perfil, colegio, cursosCount, bloquesCount, estudiantesCount, horasSemanales,
  pieCount, setupPct, bloquesLibres, horasLibres, bannerStyle, onChangeBanner,
}: any) {
  const nombre = user?.displayName?.split(" ").slice(0, 2).join(" ") || "Profesor"
  const [showBannerPicker, setShowBannerPicker] = useState(false)
  const bannerCss = resolveBannerCss(bannerStyle)

  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card shadow-sm">
      {/* Banda superior con gradient personalizable */}
      <div className="relative h-32 sm:h-36" aria-hidden style={{ background: bannerCss }}>
        {/* Patrón decorativo sutil */}
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{
          backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 70% 30%, white 1px, transparent 1px)",
          backgroundSize: "44px 44px, 60px 60px",
        }} />

        {/* Botón editar fondo */}
        <div className="absolute right-3 top-3 z-20">
          <button
            type="button"
            onClick={() => setShowBannerPicker(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[11.5px] font-bold text-slate-900 shadow-md backdrop-blur transition-colors hover:bg-white"
            title="Cambiar fondo del banner"
          >
            <Palette className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Editar fondo</span>
          </button>
          {showBannerPicker && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setShowBannerPicker(false)}
              />
              <div className="absolute right-0 top-full z-20 mt-2 w-[280px] rounded-[14px] border border-border bg-card p-3 shadow-xl">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
                    Estilo del fondo
                  </p>
                  <button
                    onClick={() => setShowBannerPicker(false)}
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {BANNER_PRESETS.map(p => {
                    const active = bannerStyle === p.key
                    return (
                      <button
                        key={p.key}
                        onClick={() => { onChangeBanner(p.key); setShowBannerPicker(false) }}
                        className={cn(
                          "group relative flex h-14 items-end overflow-hidden rounded-[10px] border-2 px-2 pb-1 text-[10.5px] font-extrabold text-white shadow-sm transition-all hover:scale-[1.02]",
                          active ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                        )}
                        style={{ background: p.css }}
                        title={p.label}
                      >
                        <span className="drop-shadow">{p.label}</span>
                        {active && (
                          <span className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-white/90 text-primary shadow">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-2 border-t border-border pt-2 text-[10.5px] text-muted-foreground">
                  Tu elección se guarda automáticamente.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Barra de identidad debajo del banner — el avatar SUBE para sobresalir, no es cubierto */}
      <div className="relative px-5 pb-5 sm:px-7 sm:pb-7">
        <div className="-mt-14 flex flex-col gap-4 sm:flex-row sm:items-end">
          {/* Avatar — z-10 para asegurar que esté encima */}
          <div className="relative z-10 flex-shrink-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt="Foto"
                className="h-24 w-24 rounded-2xl border-4 border-card bg-card object-cover shadow-lg sm:h-28 sm:w-28"
              />
            ) : (
              <div className="grid h-24 w-24 place-items-center rounded-2xl border-4 border-card bg-gradient-to-br from-primary to-pink-mid text-3xl font-extrabold text-white shadow-lg sm:h-28 sm:w-28">
                {(user?.displayName || "U").charAt(0)}
              </div>
            )}
            <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-card bg-green-500 shadow" />
          </div>

          {/* Texto y barra de progreso — alineados al pie del avatar */}
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0">
                <h1 className="truncate text-[22px] font-extrabold text-foreground sm:text-[26px]">{nombre}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted-foreground">
                  {perfil?.tipoProfesor && (
                    <span className="inline-flex items-center gap-1 font-semibold">
                      <Briefcase className="h-3.5 w-3.5" /> {perfil.tipoProfesor}
                    </span>
                  )}
                  {perfil?.especialidad && (
                    <span className="inline-flex items-center gap-1">
                      <Music className="h-3.5 w-3.5" /> {perfil.especialidad}
                    </span>
                  )}
                  {colegio?.nombre && (
                    <span className="inline-flex items-center gap-1">
                      <School className="h-3.5 w-3.5" /> {colegio.nombre}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-start gap-1 sm:items-end">
                {setupPct < 100 ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Configuración</span>
                      <span className="text-[14px] font-extrabold text-primary">{setupPct}%</span>
                    </div>
                    <div className="h-2 w-44 overflow-hidden rounded-full bg-foreground/10">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${setupPct}%` }} />
                    </div>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11.5px] font-bold text-emerald-700 dark:bg-emerald-500/25 dark:text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Perfil completo
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi icon={Folder}   label="Cursos"          value={cursosCount}      accent="#EC4899" />
          <Kpi icon={Clock}    label="Bloques clase"   value={bloquesCount}     accent="#3B82F6" hint={horasSemanales + " semanales"} />
          <Kpi icon={Users}    label="Estudiantes"     value={estudiantesCount} accent="#22C55E" />
          <Kpi icon={Hash}     label="PIE"             value={pieCount}         accent="#F59E0B" hint={estudiantesCount > 0 ? `${Math.round(pieCount / estudiantesCount * 100)}% del total` : ""} />
          <Kpi icon={Coffee}   label="Bloques libres"  value={bloquesLibres}    accent="#8B5CF6" hint={horasLibres + " sem."} />
          <Kpi icon={Sparkles} label="Tu perfil"       value={`${setupPct}%`}   accent={setupPct === 100 ? "#22C55E" : "#14B8A6"} hint={setupPct === 100 ? "Perfil completo" : "completado"} />
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Tabs bar
// ─────────────────────────────────────────────────────────────────────────────

function TabsBar({ tab, setTab }: { tab: TabKey; setTab: (t: TabKey) => void }) {
  return (
    <div className="sticky top-[58px] z-10 -mx-2 overflow-x-auto rounded-[14px] border border-border bg-card/95 px-2 py-2 shadow-sm backdrop-blur sm:mx-0">
      <div className="flex w-max items-center gap-1 sm:w-full">
        {TABS.map(t => {
          const Icon = t.icon
          const active = t.key === tab
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "group flex flex-shrink-0 items-center gap-2 rounded-[10px] px-3 py-2 text-[12.5px] font-bold transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
              title={t.descripcion}
            >
              <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "" : "text-muted-foreground group-hover:text-foreground")} />
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Vista: Resumen
// ─────────────────────────────────────────────────────────────────────────────

function ResumenView({
  perfil, colegio, horario, cursos, horarioPorCurso, estudiantesPorCurso, nivelMapping,
  cursosSinNivel, bloquesLibres, setupPct, setTab,
}: any) {
  const checklistItems: Array<{ ok: boolean; label: string; tab: TabKey; hint?: string }> = [
    { ok: !!perfil?.tipoProfesor,                                  label: "Define tu rol docente",                  tab: "identidad", hint: "Ed. Básica, Media o Diferencial" },
    { ok: !!colegio?.nombre,                                       label: "Agrega el nombre de tu colegio",         tab: "identidad" },
    { ok: cursos.length > 0,                                       label: "Crea al menos un curso con bloques",     tab: "semana" },
    { ok: cursos.length > 0 && cursosSinNivel.length === 0,        label: "Asocia cada curso a un nivel curricular", tab: "asignaturas", hint: cursosSinNivel.length > 0 ? `Falta: ${cursosSinNivel.join(", ")}` : "" },
    { ok: Object.values(estudiantesPorCurso).some((arr: any) => arr.length > 0), label: "Carga estudiantes en al menos un curso", tab: "cursos" },
  ]

  return (
    <div className="space-y-0">
      {/* Banner de migración: solo visible si hay datos legados */}
      <MigracionPerfilBanner onDone={() => window.location.reload()} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Columna izquierda: 2/3 */}
        <div className="space-y-5 lg:col-span-2">
          {/* Cards de cursos con info clave */}
        <div className="rounded-[16px] border border-border bg-card p-5">
          <SectionTitle icon={Folder} title="Mis cursos" hint={cursos.length === 0 ? "Aún no agregas ninguno" : `${cursos.length} curso${cursos.length === 1 ? "" : "s"}`} />
          {cursos.length === 0 ? (
            <button
              onClick={() => setTab("semana")}
              className="flex w-full flex-col items-center gap-2 rounded-[12px] border-2 border-dashed border-border bg-background p-8 text-center transition-colors hover:border-primary hover:bg-pink-light/30"
            >
              <CalendarRange className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-[13px] text-muted-foreground">No tienes cursos. Empieza creando bloques en <strong>Mi Semana</strong>.</p>
              <span className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-bold text-white">
                Crear primer bloque <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </button>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {horarioPorCurso.map(([curso, bloques]: [string, ClaseHorario[]], i: number) => {
                const minutos = bloques.reduce((acc, b) => acc + duracionBloque(b), 0)
                const ests = estudiantesPorCurso[curso] || []
                const piec = ests.filter((e: any) => e.pie).length
                const nivel = nivelMapping[curso]
                const colorBase = bloques[0]?.color || colorPorIndice(i)
                return (
                  <button
                    key={curso}
                    onClick={() => setTab("cursos")}
                    className="group flex flex-col gap-2 rounded-[12px] border border-border bg-background p-4 text-left transition-all hover:border-primary hover:shadow-md"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: colorBase }} />
                      <span className="text-[14px] font-extrabold text-foreground">{curso}</span>
                      {!nivel && (
                        <span className="ml-auto rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          Sin nivel
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {bloques.length} bloque{bloques.length === 1 ? "" : "s"} · {formatHorasMin(minutos)}</span>
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {ests.length} alumno{ests.length === 1 ? "" : "s"}</span>
                      {piec > 0 && (
                        <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                          <Hash className="h-3 w-3" /> {piec} PIE
                        </span>
                      )}
                    </div>
                    {nivel && (
                      <div className="text-[11.5px] font-semibold text-primary">→ {nivel}</div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Vista mini de la semana */}
        <div className="rounded-[16px] border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle icon={CalendarRange} title="Vista rápida de la semana" />
            <button
              onClick={() => setTab("semana")}
              className="text-[12px] font-bold text-primary hover:underline"
            >
              Ver completo →
            </button>
          </div>
          <MiniSemana horario={horario} />
        </div>
        </div> {/* cierre col-span-2 */}

        {/* Columna derecha: 1/3 */}
        <div className="space-y-5">
        {/* Checklist de configuración */}
        <div className="rounded-[16px] border border-border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <SectionTitle icon={Sparkles} title="Tu progreso" />
            <span className="rounded-full bg-pink-light px-2.5 py-0.5 text-[11px] font-extrabold text-primary">{setupPct}%</span>
          </div>
          <ul className="space-y-2.5">
            {checklistItems.map((item, idx) => (
              <li key={idx}>
                <button
                  onClick={() => setTab(item.tab)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-[10px] border p-2.5 text-left transition-colors",
                    item.ok
                      ? "border-green-200 bg-green-50/50 hover:bg-green-50"
                      : "border-border bg-background hover:border-primary hover:bg-pink-light/20"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full border-2 text-white",
                    item.ok ? "border-green-500 bg-green-500" : "border-border bg-card"
                  )}>
                    {item.ok && <CheckCircle className="h-3 w-3" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className={cn("text-[12.5px] font-bold", item.ok ? "text-green-700 line-through" : "text-foreground")}>
                      {item.label}
                    </div>
                    {item.hint && (
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{item.hint}</div>
                    )}
                  </div>
                  {!item.ok && <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground" />}
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* Atajos */}
        <div className="rounded-[16px] border border-border bg-card p-5">
          <SectionTitle icon={Plug} title="Atajos rápidos" />
          <div className="space-y-2">
            <ShortcutRow icon={CalendarRange} label="Editar mi semana"        onClick={() => setTab("semana")} />
            <ShortcutRow icon={Folder}        label="Configurar mis cursos"    onClick={() => setTab("cursos")} />
            <ShortcutRow icon={BookMarked}    label="Asignaturas y niveles"    onClick={() => setTab("asignaturas")} />
            <ShortcutRow icon={IdCard}        label="Datos del colegio"        onClick={() => setTab("identidad")} />
            <ShortcutRow icon={Plug}          label="Conectar Google Calendar" onClick={() => setTab("conexiones")} />
          </div>
        </div>
      </div>
    </div>
    </div>
  )
}

function ShortcutRow({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-[10px] border border-transparent px-3 py-2 text-left text-[12.5px] font-semibold text-foreground transition-colors hover:border-border hover:bg-background"
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
    </button>
  )
}

// Mini semana — pequeño grid resumen
function MiniSemana({ horario }: { horario: ClaseHorario[] }) {
  const dias = DIAS
  return (
    <div className="grid grid-cols-5 gap-2">
      {dias.map(dia => {
        const items = horario
          .filter(b => b.dia === dia)
          .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
        return (
          <div key={dia} className="space-y-1">
            <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-muted-foreground">{dia.slice(0, 3)}</div>
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed border-border bg-muted/20 py-3 text-center text-[10px] text-muted-foreground">—</div>
            ) : (
              items.map(b => (
                <div
                  key={b.uid}
                  className="rounded-md px-1.5 py-1 text-[10px] font-bold text-white shadow-sm"
                  style={{ background: b.color || "#9CA3AF" }}
                  title={`${b.resumen} · ${b.horaInicio}-${b.horaFin}`}
                >
                  <div className="truncate leading-tight">{b.resumen}</div>
                  <div className="text-[9px] font-semibold opacity-90">{b.horaInicio}</div>
                </div>
              ))
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Form de bloque (reutilizable)
// ─────────────────────────────────────────────────────────────────────────────

type BloqueFormState = {
  uid?: string
  dia: ClaseHorario["dia"]
  horaInicio: string
  horaFin: string
  resumen: string
  tipo: TipoHorario
  color: string
  asignatura?: string
}

const BLOQUE_FORM_INICIAL: BloqueFormState = {
  dia: "Lunes", horaInicio: "08:00", horaFin: "09:30",
  resumen: "", tipo: "clase", color: "#3B82F6", asignatura: "",
}

function BloqueForm({
  initial, onSubmit, onCancel, allBloques, presetCurso, presetAsignatura,
  asignaturasSugeridas,
}: {
  initial?: BloqueFormState
  onSubmit: (b: ClaseHorario) => void
  onCancel?: () => void
  allBloques: ClaseHorario[]
  presetCurso?: string
  presetAsignatura?: string
  asignaturasSugeridas?: string[]
}) {
  const baseInicial = initial
    || { ...BLOQUE_FORM_INICIAL, ...(presetCurso ? { resumen: presetCurso } : {}), ...(presetAsignatura ? { asignatura: presetAsignatura } : {}) }
  const [form, setForm] = useState<BloqueFormState>(baseInicial)

  const isEditing = !!initial?.uid
  const tipoLibre = esTipoLibre(form.tipo)
  const colision = colisionaConHorario(
    allBloques,
    { ...form, uid: form.uid || "__nuevo__" } as ClaseHorario,
    form.uid
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.resumen.trim() || !form.horaInicio || !form.horaFin) {
      toast({ title: "Faltan datos", description: "Completa nombre, inicio y fin.", variant: "destructive" })
      return
    }
    if (!tipoLibre && !form.asignatura?.trim()) {
      toast({ title: "Falta asignatura", description: "Asocia el bloque a una asignatura.", variant: "destructive" })
      return
    }
    if (horaToMinutos(form.horaFin) <= horaToMinutos(form.horaInicio)) {
      toast({ title: "Hora inválida", description: "La hora de fin debe ser posterior al inicio.", variant: "destructive" })
      return
    }
    const uid = form.uid || `${form.dia.toLowerCase().slice(0,3)}-${form.resumen.replace(/\s+/g,"").toLowerCase()}-${Date.now()}`
    const payload: ClaseHorario = {
      uid,
      dia: form.dia,
      horaInicio: form.horaInicio,
      horaFin: form.horaFin,
      resumen: form.resumen,
      tipo: form.tipo,
      color: form.color,
      ...(tipoLibre ? {} : { asignatura: form.asignatura?.trim() }),
    }
    onSubmit(payload)
    if (!isEditing) {
      // Reset solo el resumen — mantiene tipo/color/asignatura para crear bloques en cadena
      setForm(prev => ({ ...prev, resumen: presetCurso || "" }))
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex flex-wrap items-end gap-3 rounded-[12px] border p-4 transition-colors",
        isEditing ? "border-primary bg-pink-light/40" : "border-border bg-background"
      )}
    >
      <div className="flex min-w-[120px] flex-1 flex-col gap-1">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Día</label>
        <select
          value={form.dia}
          onChange={e => setForm(p => ({ ...p, dia: e.target.value as ClaseHorario["dia"] }))}
          className="h-9 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary"
        >
          {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <div className="flex min-w-[160px] flex-1 flex-col gap-1">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
          {tipoLibre ? "Etiqueta" : (presetCurso ? "Curso" : "Curso (Ej. 4° A)")}
        </label>
        <input
          type="text"
          value={form.resumen}
          onChange={e => setForm(p => ({ ...p, resumen: e.target.value }))}
          placeholder={tipoLibre ? ETIQUETA_TIPO_LIBRE[form.tipo] : "Ej. 4° A"}
          disabled={!!presetCurso && !tipoLibre}
          className="h-9 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary disabled:bg-muted/40"
        />
      </div>

      {!tipoLibre && (
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Asignatura</label>
          <input
            type="text"
            value={form.asignatura || ""}
            onChange={e => setForm(p => ({ ...p, asignatura: e.target.value }))}
            placeholder="Ej. Música, Lenguaje..."
            list="asignaturas-sugeridas"
            disabled={!!presetAsignatura}
            className="h-9 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary disabled:bg-muted/40"
          />
          <datalist id="asignaturas-sugeridas">
            {(asignaturasSugeridas || []).map(a => <option key={a} value={a} />)}
          </datalist>
        </div>
      )}

      <div className="flex w-full flex-col gap-1 sm:w-[100px]">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Inicio</label>
        <input
          type="time"
          value={form.horaInicio}
          onChange={e => setForm(p => ({ ...p, horaInicio: e.target.value }))}
          className="h-9 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary"
        />
      </div>

      <div className="flex w-full flex-col gap-1 sm:w-[100px]">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Fin</label>
        <input
          type="time"
          value={form.horaFin}
          onChange={e => setForm(p => ({ ...p, horaFin: e.target.value }))}
          className="h-9 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary"
        />
      </div>

      <div className="flex min-w-[140px] flex-1 flex-col gap-1">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Tipo</label>
        <select
          value={form.tipo}
          onChange={e => {
            const next = e.target.value as TipoHorario
            const labelsLibres = Object.values(ETIQUETA_TIPO_LIBRE)
            const debePrellenar = esTipoLibre(next) && (!form.resumen.trim() || labelsLibres.includes(form.resumen.trim()))
            const nuevoResumen = debePrellenar ? (ETIQUETA_TIPO_LIBRE[next] || form.resumen) : form.resumen
            setForm(p => ({ ...p, tipo: next, resumen: nuevoResumen }))
          }}
          className="h-9 rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary"
        >
          <optgroup label="Bloques con curso">
            <option value="clase">Clase regular</option>
            <option value="taller">Taller</option>
            <option value="orientacion">Orientación</option>
          </optgroup>
          <optgroup label="Bloques no lectivos">
            <option value="almuerzo">Almuerzo</option>
            <option value="planificacion">Planificación</option>
            <option value="recreo">Recreo</option>
            <option value="trabajo_colaborativo">Trabajo colaborativo</option>
            <option value="consejo">Consejo de profesores</option>
            <option value="no_lectivo">Bloque no lectivo</option>
            <option value="libre">Bloque libre</option>
          </optgroup>
        </select>
      </div>

      <div className="flex w-full flex-col gap-1 sm:w-[68px]">
        <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Color</label>
        <input
          type="color"
          value={form.color}
          onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
          className="h-9 cursor-pointer rounded-lg border border-border p-1"
        />
      </div>

      {colision && form.resumen && (
        <div className="flex w-full items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          <AlertCircle className="h-3.5 w-3.5" />
          Choca con {colision.resumen} ({colision.horaInicio}–{colision.horaFin})
        </div>
      )}

      <div className="flex w-full items-center gap-2 sm:w-auto">
        <button
          type="submit"
          className={cn(
            "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-[12.5px] font-bold text-white transition-colors sm:flex-none",
            isEditing ? "bg-primary hover:opacity-90" : "bg-slate-900 hover:bg-slate-800"
          )}
        >
          {isEditing ? <RefreshCw className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {isEditing ? "Actualizar" : "Añadir"}
        </button>
        {isEditing && onCancel && (
          <button type="button" onClick={onCancel} className="text-[12px] font-bold text-muted-foreground hover:text-foreground">
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Vista: Mi Semana (grid visual)
// ─────────────────────────────────────────────────────────────────────────────

type GrupoNoLectivo = {
  key: string
  tipo: TipoHorario
  resumen: string
  bloques: ClaseHorario[]
  dias: ClaseHorario["dia"][]
  mismaHora: boolean
  horaInicio: string
  horaFin: string
  color: string
  totalMinutos: number
}

function SemanaView({
  horario, upsertBloque, removeBloque, saveStatus, asignaturasSugeridas,
}: {
  horario: ClaseHorario[]
  upsertBloque: (b: ClaseHorario) => void
  removeBloque: (uid: string) => void
  saveStatus: "idle" | "saving" | "saved" | "error"
  asignaturasSugeridas: string[]
}) {
  const [editingBloque, setEditingBloque] = useState<ClaseHorario | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [editingGrupoNoLectivo, setEditingGrupoNoLectivo] = useState<GrupoNoLectivo | null>(null)
  const cursosSugeridos = useMemo(
    () => Array.from(new Set(horario.filter(h => !esTipoLibre(h.tipo)).map(h => h.resumen))),
    [horario]
  )
  const gruposNoLectivos = useMemo<GrupoNoLectivo[]>(() => {
    const grupos = new Map<string, ClaseHorario[]>()
    horario.filter(b => esTipoLibre(b.tipo)).forEach(b => {
      const key = `${b.tipo}::${b.resumen.trim().toLowerCase()}`
      grupos.set(key, [...(grupos.get(key) || []), b])
    })

    return Array.from(grupos.entries()).map(([key, bloques]) => {
      const ordenados = [...bloques].sort((a, b) => DIAS.indexOf(a.dia) - DIAS.indexOf(b.dia) || a.horaInicio.localeCompare(b.horaInicio))
      const primera = ordenados[0]
      const mismaHora = ordenados.every(b => b.horaInicio === primera.horaInicio && b.horaFin === primera.horaFin)
      return {
        key,
        tipo: primera.tipo,
        resumen: primera.resumen,
        bloques: ordenados,
        dias: ordenados.map(b => b.dia),
        mismaHora,
        horaInicio: primera.horaInicio,
        horaFin: primera.horaFin,
        color: primera.color,
        totalMinutos: ordenados.reduce((acc, b) => acc + duracionBloque(b), 0),
      }
    }).sort((a, b) => a.resumen.localeCompare(b.resumen, "es"))
  }, [horario])

  // Calcular rango de horas dinámico
  const minutosMin = horario.length > 0
    ? Math.min(...horario.map(b => horaToMinutos(b.horaInicio))) - 30
    : 8 * 60 - 30
  const minutosMax = horario.length > 0
    ? Math.max(...horario.map(b => horaToMinutos(b.horaFin))) + 30
    : 17 * 60 + 30
  const minHora = Math.max(0, Math.floor(minutosMin / 60))
  const maxHora = Math.min(24, Math.ceil(minutosMax / 60))
  const totalMinutos = (maxHora - minHora) * 60
  const PX_PER_MIN = 1.2

  const handleSubmit = (b: ClaseHorario) => {
    upsertBloque(b)
    setEditingBloque(null)
    setShowForm(false)
  }

  const startEdit = (b: ClaseHorario) => {
    setEditingBloque(b)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <div className="space-y-5">
      {/* Header con acciones */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <SectionTitle icon={CalendarRange} title={editingBloque ? "Editar bloque" : "Constructor de horario"} hint="Crea bloques de clases o libres" />
            <p className="text-[12px] text-muted-foreground">
              Vista visual de tu semana. Haz clic en un bloque para editarlo, o agrega uno nuevo desde el formulario de abajo.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <SaveBadge status={saveStatus} />
            {!showForm && (
              <button
                onClick={() => setShowWizard(true)}
                className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[12.5px] font-bold text-white hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Nuevo bloque
              </button>
            )}
          </div>
        </div>

        {showForm && editingBloque && (
          <div className="mt-4">
            <BloqueForm
              initial={{
                uid: editingBloque.uid,
                dia: editingBloque.dia,
                horaInicio: editingBloque.horaInicio,
                horaFin: editingBloque.horaFin,
                resumen: editingBloque.resumen,
                tipo: editingBloque.tipo,
                color: editingBloque.color,
                asignatura: editingBloque.asignatura,
              }}
              allBloques={horario}
              asignaturasSugeridas={asignaturasSugeridas}
              onSubmit={handleSubmit}
              onCancel={() => { setEditingBloque(null); setShowForm(false) }}
            />
          </div>
        )}
      </div>

      <BloqueWizard
        open={showWizard}
        onClose={() => setShowWizard(false)}
        existingBloques={horario}
        asignaturasSugeridas={asignaturasSugeridas}
        cursosSugeridos={cursosSugeridos}
        onCreate={(bloques) => bloques.forEach(b => upsertBloque(b))}
      />

      {gruposNoLectivos.length > 0 && (
        <div className="rounded-[16px] border border-border bg-card p-5">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <SectionTitle icon={Coffee} title="Bloques no lectivos" hint="Edita almuerzo, recreos y trabajo colaborativo como grupo" />
              <p className="text-[12px] text-muted-foreground">
                Estos bloques se ven en tu semana, pero no cuentan como clase, pendiente, leccionario ni asistencia.
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold text-muted-foreground">
              {gruposNoLectivos.length} grupo{gruposNoLectivos.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {gruposNoLectivos.map(grupo => {
              const meta = TIPO_META[grupo.tipo]
              const Icon = meta.icon
              const horarioTexto = grupo.mismaHora ? `${grupo.horaInicio}-${grupo.horaFin}` : "Horarios distintos"
              return (
                <div key={grupo.key} className="rounded-[12px] border border-border bg-background p-3">
                  <div className="flex items-start gap-3">
                    <span className="mt-1 h-3 w-3 rounded-full" style={{ background: grupo.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <h3 className="truncate text-[13.5px] font-extrabold">{grupo.resumen}</h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                          {meta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[11.5px] text-muted-foreground">
                        {grupo.dias.join(", ")} · {horarioTexto} · {formatHorasMin(grupo.totalMinutos)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingGrupoNoLectivo(grupo)}
                      className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px] font-bold text-foreground hover:border-primary hover:text-primary"
                    >
                      Editar grupo
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {editingGrupoNoLectivo && (
        <GrupoNoLectivoEditor
          grupo={editingGrupoNoLectivo}
          allBloques={horario}
          onCancel={() => setEditingGrupoNoLectivo(null)}
          onSave={(updates) => {
            editingGrupoNoLectivo.bloques.forEach(b => upsertBloque({ ...b, ...updates }))
            setEditingGrupoNoLectivo(null)
          }}
          onDelete={() => {
            editingGrupoNoLectivo.bloques.forEach(b => removeBloque(b.uid))
            setEditingGrupoNoLectivo(null)
          }}
        />
      )}

      {/* Grid visual de la semana */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[14px] font-extrabold text-foreground">Vista calendario</h3>
          <span className="text-[11px] text-muted-foreground">
            {horario.length} bloque{horario.length === 1 ? "" : "s"} · {minHora}:00–{maxHora}:00
          </span>
        </div>

        {horario.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[12px] border-2 border-dashed border-border bg-background p-12 text-center">
            <CalendarRange className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-[13px] text-muted-foreground">Tu semana está vacía. Agrega tu primer bloque arriba.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[700px] grid-cols-[60px_repeat(5,1fr)] gap-1 rounded-[12px] border border-border bg-background p-2">
              {/* Fila de encabezados */}
              <div />
              {DIAS.map(dia => (
                <div key={dia} className="rounded-md bg-card px-2 py-1.5 text-center text-[11px] font-extrabold uppercase tracking-wide text-foreground">
                  {dia}
                </div>
              ))}

              {/* Columna de horas + columnas de días con bloques en posición absoluta */}
              <div className="relative" style={{ height: `${totalMinutos * PX_PER_MIN}px` }}>
                {Array.from({ length: maxHora - minHora + 1 }).map((_, i) => {
                  const hour = minHora + i
                  return (
                    <div
                      key={hour}
                      className="absolute left-0 right-0 text-[10px] font-bold text-muted-foreground"
                      style={{ top: `${i * 60 * PX_PER_MIN}px` }}
                    >
                      {hour}:00
                    </div>
                  )
                })}
              </div>

              {DIAS.map(dia => {
                const bloquesDia = horario.filter(b => b.dia === dia)
                return (
                  <div
                    key={dia}
                    className="relative overflow-hidden rounded-md bg-muted/20"
                    style={{ height: `${totalMinutos * PX_PER_MIN}px` }}
                  >
                    {/* Líneas horarias */}
                    {Array.from({ length: maxHora - minHora }).map((_, i) => (
                      <div
                        key={i}
                        className="absolute left-0 right-0 border-t border-border/50"
                        style={{ top: `${i * 60 * PX_PER_MIN}px` }}
                      />
                    ))}
                    {/* Bloques */}
                    {bloquesDia.map(b => {
                      const top = (horaToMinutos(b.horaInicio) - minHora * 60) * PX_PER_MIN
                      const height = Math.max(20, duracionBloque(b) * PX_PER_MIN - 2)
                      const meta = TIPO_META[b.tipo]
                      const Icon = meta.icon
                      return (
                        <button
                          key={b.uid}
                          onClick={() => startEdit(b)}
                          className={cn(
                            "absolute left-1 right-1 flex flex-col gap-0.5 overflow-hidden rounded-md px-1.5 py-1 text-left text-white shadow-sm transition-all hover:scale-[1.02] hover:shadow-md",
                            meta.libre && "opacity-90"
                          )}
                          style={{ top: `${top}px`, height: `${height}px`, background: b.color || "#9CA3AF" }}
                        >
                          <div className="flex items-center gap-1 text-[10px] font-extrabold leading-tight">
                            <Icon className="h-2.5 w-2.5 flex-shrink-0" />
                            <span className="truncate">{b.resumen}</span>
                          </div>
                          {b.asignatura && height >= 30 && (
                            <div className="truncate text-[9.5px] font-bold opacity-95">{b.asignatura}</div>
                          )}
                          {height >= 48 && (
                            <div className="text-[9px] font-semibold opacity-90">{b.horaInicio}–{b.horaFin}</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Lista de bloques (alternativa accesible) */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <SectionTitle icon={Clock} title="Lista detallada" hint="Edita o elimina bloques uno por uno" />
        {horario.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground italic">Sin bloques aún.</p>
        ) : (
          <div className="space-y-2">
            {DIAS.map(dia => {
              const bloquesDia = horario
                .filter(b => b.dia === dia)
                .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
              if (bloquesDia.length === 0) return null
              return (
                <div key={dia}>
                  <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">{dia}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {bloquesDia.map(b => {
                      const meta = TIPO_META[b.tipo]
                      const Icon = meta.icon
                      return (
                        <div
                          key={b.uid}
                          className="group flex items-center gap-2 rounded-[10px] border border-border bg-background px-3 py-2 text-[12px]"
                        >
                          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: b.color }} />
                          <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                          <span className="font-bold text-foreground">{b.resumen}</span>
                          {b.asignatura && (
                            <span className="rounded bg-pink-light px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              {b.asignatura}
                            </span>
                          )}
                          <span className="text-muted-foreground">{b.horaInicio}–{b.horaFin}</span>
                          <button
                            onClick={() => startEdit(b)}
                            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-blue-500"
                            title="Editar"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => removeBloque(b.uid)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-500"
                            title="Eliminar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Vista: Mis Cursos (cards detalladas)
// ─────────────────────────────────────────────────────────────────────────────

function GrupoNoLectivoEditor({
  grupo, allBloques, onSave, onDelete, onCancel,
}: {
  grupo: GrupoNoLectivo
  allBloques: ClaseHorario[]
  onSave: (updates: Pick<ClaseHorario, "resumen" | "horaInicio" | "horaFin" | "color">) => void
  onDelete: () => void
  onCancel: () => void
}) {
  const [resumen, setResumen] = useState(grupo.resumen)
  const [horaInicio, setHoraInicio] = useState(grupo.mismaHora ? grupo.horaInicio : "")
  const [horaFin, setHoraFin] = useState(grupo.mismaHora ? grupo.horaFin : "")
  const [color, setColor] = useState(grupo.color)
  const meta = TIPO_META[grupo.tipo]
  const Icon = meta.icon

  const handleSave = () => {
    if (!resumen.trim() || !horaInicio || !horaFin) {
      toast({ title: "Faltan datos", description: "Completa etiqueta, inicio y fin.", variant: "destructive" })
      return
    }
    if (horaToMinutos(horaFin) <= horaToMinutos(horaInicio)) {
      toast({ title: "Hora invalida", description: "La hora de fin debe ser posterior al inicio.", variant: "destructive" })
      return
    }

    const colisiones = grupo.bloques
      .map(b => colisionaConHorario(allBloques, { ...b, resumen: resumen.trim(), horaInicio, horaFin, color }, b.uid))
      .filter(Boolean)

    if (colisiones.length > 0) {
      toast({
        title: "Hay choques de horario",
        description: "Ajusta el rango antes de aplicar este cambio al grupo.",
        variant: "destructive",
      })
      return
    }

    onSave({ resumen: resumen.trim(), horaInicio, horaFin, color })
  }

  const handleDelete = () => {
    if (!window.confirm(`Eliminar ${grupo.bloques.length} bloque(s) de "${grupo.resumen}"?`)) return
    onDelete()
  }

  return (
    <div className="fixed inset-0 z-[720] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-[560px] rounded-[18px] border border-border bg-card shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${color}22`, color }}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-[15px] font-extrabold">Editar bloque no lectivo</h2>
              <p className="text-[11px] text-muted-foreground">
                Se aplicara a {grupo.dias.join(", ")}
              </p>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Etiqueta</label>
              <input
                value={resumen}
                onChange={e => setResumen(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-semibold outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Color</label>
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-border bg-background p-1"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Inicio</label>
              <input
                type="time"
                value={horaInicio}
                onChange={e => setHoraInicio(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-semibold outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Fin</label>
              <input
                type="time"
                value={horaFin}
                onChange={e => setHoraFin(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-semibold outline-none focus:border-primary"
              />
            </div>
          </div>

          {!grupo.mismaHora && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] font-semibold text-amber-800">
              Este grupo tenia horarios distintos por dia. Al guardar, todos quedaran con el mismo inicio y fin.
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-border px-5 py-4 sm:flex-row sm:items-center">
          <button type="button" onClick={handleDelete} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-bold text-red-600 hover:bg-red-100">
            <Trash2 className="h-3.5 w-3.5" /> Eliminar grupo
          </button>
          <div className="flex-1" />
          <button type="button" onClick={onCancel} className="rounded-lg px-3 py-2 text-[12px] font-bold text-muted-foreground hover:bg-muted">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground hover:opacity-90">
            <Save className="h-3.5 w-3.5" /> Aplicar al grupo
          </button>
        </div>
      </div>
    </div>
  )
}

function CursosView({
  horario, horarioPorCurso, nivelMapping, setNivelMapping, cursoTipos, setCursoTipos,
  estudiantesPorCurso, estudiantesLoaded, setEstudiantesCurso, guardarEstudiantesCurso,
  upsertBloque, removeBloque, removeCursoCompleto, renombrarCurso, cambiarColorCurso,
  saveHorario, saveMapping, asignaturasSugeridas,
}: any) {
  const cursos: Array<[string, ClaseHorario[]]> = horarioPorCurso

  if (cursos.length === 0) {
    return (
      <div className="rounded-[16px] border border-border bg-card p-12 text-center">
        <Folder className="mx-auto mb-3 h-12 w-12 text-muted-foreground/30" />
        <p className="text-[13px] text-muted-foreground">No tienes cursos. Empieza creando bloques en <strong>Mi Semana</strong>.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-muted-foreground">
          Cada curso muestra sus bloques semanales, nivel curricular asociado, y la lista de estudiantes.
        </p>
        <div className="flex items-center gap-2">
          <SaveBadge status={saveHorario} />
          <SaveBadge status={saveMapping} />
        </div>
      </div>

      {cursos.map(([curso, bloques], i) => (
        <CursoCard
          key={curso}
          curso={curso}
          bloques={bloques}
          colorIndex={i}
          allHorario={horario}
          nivel={nivelMapping[curso] || ""}
          setNivel={(v: string) => setNivelMapping((prev: NivelMapping) => ({ ...prev, [curso]: v }))}
          tipoCurricular={(cursoTipos?.[curso] ?? "oficial") as TipoCurricular}
          setTipoCurricular={(t: TipoCurricular) => {
            setCursoTipos((prev: CursoTipoMap) => {
              const next = { ...prev }
              if (t === "oficial") delete next[curso]
              else next[curso] = t
              return next
            })
            // Si el tipo deja de ser oficial, limpia el nivel para evitar mostrar uno obsoleto
            if (t !== "oficial") {
              setNivelMapping((prev: NivelMapping) => {
                const next = { ...prev }
                delete next[curso]
                return next
              })
            }
          }}
          estudiantes={estudiantesPorCurso[curso] || []}
          estudiantesLoaded={!!estudiantesLoaded[curso]}
          setEstudiantes={(arr: Estudiante[]) => setEstudiantesCurso(curso, arr)}
          onSaveEstudiantes={() => guardarEstudiantesCurso(curso)}
          upsertBloque={upsertBloque}
          removeBloque={removeBloque}
          removeCurso={() => removeCursoCompleto(curso)}
          renombrarCurso={(nuevo: string) => renombrarCurso(curso, nuevo)}
          cambiarColor={(c: string) => cambiarColorCurso(curso, c)}
          asignaturasSugeridas={asignaturasSugeridas}
        />
      ))}
    </div>
  )
}

function CursoCard({
  curso, bloques, colorIndex, allHorario, nivel, setNivel,
  tipoCurricular, setTipoCurricular,
  estudiantes, estudiantesLoaded, setEstudiantes, onSaveEstudiantes,
  upsertBloque, removeBloque, removeCurso, renombrarCurso, cambiarColor,
  asignaturasSugeridas,
}: any) {
  const [expanded, setExpanded] = useState<"estudiantes" | null>(null)
  const [editingBloque, setEditingBloque] = useState<ClaseHorario | null>(null)
  const [addingBloqueFor, setAddingBloqueFor] = useState<string | null>(null) // asignatura
  const [showAddAsignatura, setShowAddAsignatura] = useState(false)
  const [nuevaAsignatura, setNuevaAsignatura] = useState("")
  const [renombrando, setRenombrando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState(curso)
  const [nuevoEstudiante, setNuevoEstudiante] = useState("")
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [pieExpanded, setPieExpanded] = useState<string | null>(null)
  const [renombrandoAsig, setRenombrandoAsig] = useState<string | null>(null)
  const [tempAsigName, setTempAsigName] = useState("")
  const [showImportTutorial, setShowImportTutorial] = useState(false)
  const [importingJson, setImportingJson] = useState(false)
  const [importFeedback, setImportFeedback] = useState<{ type: "idle" | "success" | "error"; message: string }>({ type: "idle", message: "" })
  const [promptCopied, setPromptCopied] = useState(false)
  const importInputRef = useRef<HTMLInputElement | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const minutos = bloques.reduce((acc: number, b: ClaseHorario) => acc + duracionBloque(b), 0)
  const colorBase = bloques[0]?.color || colorPorIndice(colorIndex)
  const piec = estudiantes.filter((e: Estudiante) => e.pie).length
  const estudiantesOrdenados = [...estudiantes].sort(compareEstudiantes)

  // Agrupar bloques por asignatura. Bloques sin asignatura van a "Sin asignatura".
  const bloquesPorAsignatura = useMemo(() => {
    const map = new Map<string, ClaseHorario[]>()
    bloques.forEach((b: ClaseHorario) => {
      const key = (b.asignatura || "").trim() || "Sin asignatura"
      const arr = map.get(key) || []
      arr.push(b)
      map.set(key, arr)
    })
    // Ordenar bloques de cada asignatura por día y hora
    const order: Record<string, number> = { Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5 }
    map.forEach((arr, k) => {
      map.set(k, [...arr].sort((a, b) => (order[a.dia] ?? 99) - (order[b.dia] ?? 99) || a.horaInicio.localeCompare(b.horaInicio)))
    })
    return Array.from(map.entries()).sort((a, b) => {
      // "Sin asignatura" al final
      if (a[0] === "Sin asignatura") return 1
      if (b[0] === "Sin asignatura") return -1
      return a[0].localeCompare(b[0], "es")
    })
  }, [bloques])

  const handleAddEstudiante = (e: React.FormEvent) => {
    e.preventDefault()
    if (!nuevoEstudiante.trim()) return
    const nuevo: Estudiante = {
      id: `est_${Date.now()}`,
      nombre: nuevoEstudiante.trim(),
      orden: getNextStudentOrder(estudiantes),
    }
    setEstudiantes([...estudiantes, nuevo])
    setNuevoEstudiante("")
  }

  const handleImportJsonFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    setImportingJson(true)
    setImportFeedback({ type: "idle", message: "" })
    try {
      const raw = await file.text()
      const payload = JSON.parse(raw)
      const importados = extractImportedStudents(payload)
      if (importados.length === 0) {
        throw new Error("El JSON no contiene estudiantes reconocibles. Revisa el formato.")
      }
      const { agregados, actualizados, resultado } = mergeImportedStudents(estudiantes, importados)
      setEstudiantes(resultado)
      if (agregados > 0 || actualizados > 0) {
        const partes: string[] = []
        if (agregados > 0) partes.push(`${agregados} agregado${agregados === 1 ? "" : "s"}`)
        if (actualizados > 0) partes.push(`${actualizados} actualizado${actualizados === 1 ? "" : "s"}`)
        setImportFeedback({ type: "success", message: `Listo: ${partes.join(" · ")}.` })
        toast({ title: "Importación exitosa", description: partes.join(" · ") })
      } else {
        setImportFeedback({ type: "success", message: "El JSON se leyó bien, pero no había cambios para aplicar." })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo leer el archivo JSON."
      setImportFeedback({ type: "error", message })
      toast({ title: "Error al importar", description: message, variant: "destructive" })
    } finally {
      setImportingJson(false)
      if (importInputRef.current) importInputRef.current.value = ""
    }
  }

  const PROMPT_IMPORT = `Extrae los nombres de los estudiantes de esta imagen y devuelvelos como JSON valido en este formato exacto, sin texto adicional, dentro de un bloque \`\`\`json:

{
  "estudiantes": [
    { "numero": 1, "nombre1": "Juan", "nombre2": "Pablo", "apellido1": "Perez", "apellido2": "Soto" },
    { "numero": 2, "nombre1": "Maria", "apellido1": "Gonzalez", "apellido2": "Rojas" }
  ]
}

Si la imagen no contiene segundos nombres o segundos apellidos, omite esos campos. Manten el orden y la numeracion tal como aparece en la imagen original.`

  const copiarPrompt = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT_IMPORT)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 2000)
    } catch {
      toast({ title: "No pude copiar", description: "Selecciona y copia manualmente.", variant: "destructive" })
    }
  }

  const handleDragStart = (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", id)
  }

  const handleDragOver = (id: string) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (id !== dragOverId) setDragOverId(id)
  }

  const handleDragLeave = () => setDragOverId(null)

  const handleDrop = (targetId: string) => (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sourceId = draggingId || e.dataTransfer.getData("text/plain")
    setDragOverId(null)
    setDraggingId(null)
    if (!sourceId || sourceId === targetId) return
    const ordered = [...estudiantesOrdenados]
    const fromIndex = ordered.findIndex((s: Estudiante) => s.id === sourceId)
    const toIndex = ordered.findIndex((s: Estudiante) => s.id === targetId)
    if (fromIndex === -1 || toIndex === -1) return
    const [moved] = ordered.splice(fromIndex, 1)
    ordered.splice(toIndex, 0, moved)
    // Reasignar orden secuencial 1..N
    const reordenados = ordered.map((s: Estudiante, idx: number) => ({ ...s, orden: idx + 1 }))
    setEstudiantes(reordenados)
  }

  const handleDragEnd = () => {
    setDraggingId(null)
    setDragOverId(null)
  }

  const handleRenombrarAsignatura = (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || trimmed === oldName) {
      setRenombrandoAsig(null)
      return
    }
    // Actualizar todos los bloques del curso que tenían oldName
    const target = oldName === "Sin asignatura" ? undefined : oldName
    bloques.forEach((b: ClaseHorario) => {
      const cur = (b.asignatura || "").trim() || undefined
      if (cur === target) {
        upsertBloque({ ...b, asignatura: trimmed })
      }
    })
    setRenombrandoAsig(null)
  }

  const handleAgregarAsignatura = () => {
    const nombre = nuevaAsignatura.trim()
    if (!nombre) {
      toast({ title: "Falta el nombre", description: "Escribe el nombre de la asignatura.", variant: "destructive" })
      return
    }
    setShowAddAsignatura(false)
    setNuevaAsignatura("")
    // Abrir el form de nuevo bloque para esta asignatura
    setAddingBloqueFor(nombre)
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-sm">
      {/* Banda de color */}
      <div className="h-1.5" style={{ background: colorBase }} />

      {/* Header del curso */}
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="color"
            value={colorBase}
            onChange={e => cambiarColor(e.target.value)}
            title="Color del curso"
            className="h-10 w-10 cursor-pointer flex-shrink-0 rounded-xl border border-border p-1"
          />
          <div className="min-w-0 flex-1">
            {renombrando ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={nuevoNombre}
                  onChange={e => setNuevoNombre(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { renombrarCurso(nuevoNombre); setRenombrando(false) }
                    if (e.key === "Escape") { setNuevoNombre(curso); setRenombrando(false) }
                  }}
                  className="h-9 flex-1 rounded-lg border border-border bg-background px-2 text-[16px] font-extrabold outline-none focus:border-primary"
                />
                <button
                  onClick={() => { renombrarCurso(nuevoNombre); setRenombrando(false) }}
                  className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  Guardar
                </button>
                <button
                  onClick={() => { setNuevoNombre(curso); setRenombrando(false) }}
                  className="text-[11px] font-bold text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="truncate text-[18px] font-extrabold text-foreground">{curso}</h3>
                <button
                  onClick={() => setRenombrando(true)}
                  title="Renombrar curso"
                  className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-blue-500"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <BookMarked className="h-3 w-3" /> {bloquesPorAsignatura.length} asignatura{bloquesPorAsignatura.length === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" /> {bloques.length} bloque{bloques.length === 1 ? "" : "s"} · {formatHorasMin(minutos)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {estudiantes.length} alumno{estudiantes.length === 1 ? "" : "s"}
              </span>
              {piec > 0 && (
                <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                  <Hash className="h-3 w-3" /> {piec} PIE
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Tipo curricular + Nivel */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[260px]">
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Tipo de curso</label>
            <div className="mt-1 inline-flex w-full overflow-hidden rounded-lg border border-border bg-background">
              {([
                { v: "oficial", label: "Oficial Mineduc", title: "Curso ligado al currículum nacional, requiere nivel" },
                { v: "taller",  label: "Taller",          title: "Sin currículum oficial (taller, academia, electivo)" },
                { v: "libre",   label: "Libre",           title: "Uso personal sin asociación curricular" },
              ] as const).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTipoCurricular?.(opt.v)}
                  title={opt.title}
                  className={cn(
                    "flex-1 px-2 py-1.5 text-[10.5px] font-bold transition-colors",
                    tipoCurricular === opt.v
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted/60"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {tipoCurricular === "oficial" ? (
            <div>
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Nivel curricular</label>
              <select
                value={nivel}
                onChange={e => setNivel(e.target.value)}
                className={cn(
                  "mt-1 h-9 w-full rounded-lg border bg-background px-2 text-[12.5px] font-semibold outline-none transition-colors focus:border-primary",
                  nivel ? "border-border" : "border-amber-300 bg-amber-50/30 text-amber-700"
                )}
              >
                <option value="">— Sin configurar —</option>
                {NIVELES_CURRICULARES.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border bg-muted/20 px-2 py-1.5 text-[10.5px] text-muted-foreground">
              {tipoCurricular === "taller"
                ? "Este curso no requiere nivel curricular Mineduc."
                : "Curso libre — sin currículum asociado."}
            </p>
          )}
        </div>
      </div>

      {/* Sección de Asignaturas (jerarquía: curso → asignaturas → bloques) */}
      <div className="border-t border-border bg-muted/20 px-5 py-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
            <BookMarked className="mr-1 inline h-3 w-3" /> Asignaturas y horario
          </p>
          {!showAddAsignatura && (
            <button
              onClick={() => setShowAddAsignatura(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-white hover:opacity-90"
            >
              <Plus className="h-3 w-3" /> Agregar asignatura
            </button>
          )}
        </div>

        {/* Form rápido para nueva asignatura */}
        {showAddAsignatura && (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-[12px] border border-primary bg-pink-light/30 p-3">
            <div className="min-w-[200px] flex-1">
              <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Nombre de la asignatura</label>
              <input
                autoFocus
                type="text"
                value={nuevaAsignatura}
                onChange={e => setNuevaAsignatura(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") handleAgregarAsignatura()
                  if (e.key === "Escape") { setShowAddAsignatura(false); setNuevaAsignatura("") }
                }}
                placeholder="Ej. Música, Lenguaje, Matemáticas…"
                list="asignaturas-sugeridas-card"
                className="mt-1 h-9 w-full rounded-lg border border-border bg-card px-2 text-[12.5px] outline-none focus:border-primary"
              />
              <datalist id="asignaturas-sugeridas-card">
                {(asignaturasSugeridas || []).map((a: string) => <option key={a} value={a} />)}
              </datalist>
            </div>
            <button
              onClick={handleAgregarAsignatura}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-[12px] font-bold text-white hover:opacity-90"
            >
              <ArrowRight className="h-3.5 w-3.5" /> Continuar
            </button>
            <button
              onClick={() => { setShowAddAsignatura(false); setNuevaAsignatura("") }}
              className="text-[11.5px] font-bold text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Lista de asignaturas */}
        {bloquesPorAsignatura.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-card p-6 text-center text-[12px] text-muted-foreground">
            Este curso aún no tiene asignaturas. Agrega una para comenzar.
          </div>
        ) : (
          <div className="space-y-3">
            {bloquesPorAsignatura.map(([asignatura, bs]) => {
              const sinAsignatura = asignatura === "Sin asignatura"
              const minutosAsig = bs.reduce((acc, b) => acc + duracionBloque(b), 0)
              const isRenaming = renombrandoAsig === asignatura
              return (
                <div
                  key={asignatura}
                  className={cn(
                    "rounded-[12px] border bg-card",
                    sinAsignatura ? "border-amber-200 bg-amber-50/30" : "border-border"
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {sinAsignatura ? (
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-amber-700" />
                      ) : (
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: bs[0]?.color || colorBase }} />
                      )}
                      {isRenaming ? (
                        <div className="flex flex-1 items-center gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={tempAsigName}
                            onChange={e => setTempAsigName(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") handleRenombrarAsignatura(asignatura, tempAsigName)
                              if (e.key === "Escape") setRenombrandoAsig(null)
                            }}
                            className="h-7 flex-1 rounded border border-border bg-background px-2 text-[13px] font-extrabold outline-none focus:border-primary"
                          />
                          <button
                            onClick={() => handleRenombrarAsignatura(asignatura, tempAsigName)}
                            className="rounded bg-primary px-2 py-0.5 text-[10px] font-bold text-white"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => setRenombrandoAsig(null)}
                            className="text-[10px] font-bold text-muted-foreground"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className={cn("truncate text-[13.5px] font-extrabold", sinAsignatura ? "text-amber-800" : "text-foreground")}>
                            {asignatura}
                          </span>
                          {!sinAsignatura && (
                            <button
                              onClick={() => { setRenombrandoAsig(asignatura); setTempAsigName(asignatura) }}
                              title="Renombrar"
                              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-blue-500"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          <span className="text-[11px] text-muted-foreground">
                            · {bs.length} bloque{bs.length === 1 ? "" : "s"} · {formatHorasMin(minutosAsig)}
                          </span>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => { setAddingBloqueFor(asignatura); setEditingBloque(null) }}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[10.5px] font-bold text-muted-foreground hover:border-primary hover:text-primary"
                    >
                      <Plus className="h-3 w-3" /> Bloque
                    </button>
                  </div>

                  {/* Bloques de la asignatura */}
                  <div className="border-t border-border px-4 py-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {bs.map(b => {
                        const meta = TIPO_META[b.tipo]
                        const Icon = meta.icon
                        return (
                          <div
                            key={b.uid}
                            className="group flex items-center gap-2 rounded-[10px] border border-border bg-background px-3 py-2 text-[12px]"
                          >
                            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: b.color }} />
                            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                            <span className="font-bold text-foreground">{b.dia}</span>
                            <span className="text-muted-foreground">{b.horaInicio}–{b.horaFin}</span>
                            <button
                              onClick={() => { setEditingBloque(b); setAddingBloqueFor(null) }}
                              className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted hover:text-blue-500"
                              title="Editar"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => removeBloque(b.uid)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-500"
                              title="Eliminar"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )
                      })}
                    </div>

                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Form de editar bloque (modal-like) */}
        {editingBloque && (
          <div className="mt-3">
            <BloqueForm
              initial={{
                uid: editingBloque.uid,
                dia: editingBloque.dia,
                horaInicio: editingBloque.horaInicio,
                horaFin: editingBloque.horaFin,
                resumen: editingBloque.resumen,
                tipo: editingBloque.tipo,
                color: editingBloque.color,
                asignatura: editingBloque.asignatura,
              }}
              allBloques={allHorario}
              presetCurso={curso}
              asignaturasSugeridas={asignaturasSugeridas}
              onSubmit={(b) => {
                upsertBloque(b)
                setEditingBloque(null)
              }}
              onCancel={() => setEditingBloque(null)}
            />
          </div>
        )}

        {/* Form de nueva asignatura — agregar bloque inicial */}
        <BloqueWizard
          open={addingBloqueFor !== null}
          onClose={() => setAddingBloqueFor(null)}
          existingBloques={allHorario}
          presetCurso={curso}
          presetAsignatura={addingBloqueFor && addingBloqueFor !== "Sin asignatura" ? addingBloqueFor : undefined}
          asignaturasSugeridas={asignaturasSugeridas}
          cursosSugeridos={[curso]}
          onCreate={(bloques) => {
            bloques.forEach((b: ClaseHorario) => upsertBloque(b))
            setAddingBloqueFor(null)
          }}
        />
      </div>

      {/* Sección expandible: Estudiantes */}
      {expanded === "estudiantes" && (
        <div className="border-t border-border bg-background px-5 py-4">
          {!estudiantesLoaded ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Importar JSON + Tutorial */}
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportJsonFile}
                className="hidden"
              />
              <div className="mb-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2">
                    <Upload className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                    <div className="space-y-0.5">
                      <p className="text-[12px] font-bold text-foreground">Importar lista desde JSON</p>
                      <p className="text-[11px] text-muted-foreground">
                        Sube un archivo .json con tus alumnos. Acepta arrays de nombres o formato Gemini.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowImportTutorial(v => !v)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-[11px] font-bold text-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <ClipboardList className="h-3.5 w-3.5" />
                      {showImportTutorial ? "Ocultar tutorial" : "¿Cómo crear el JSON?"}
                    </button>
                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      disabled={importingJson}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11.5px] font-bold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
                    >
                      {importingJson ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      {importingJson ? "Leyendo..." : "Importar JSON"}
                    </button>
                  </div>
                </div>

                {importFeedback.type !== "idle" && (
                  <div className={cn(
                    "mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11.5px] font-medium",
                    importFeedback.type === "success"
                      ? "border-emerald-300 bg-emerald-50/60 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
                      : "border-red-300 bg-red-50/60 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                  )}>
                    {importFeedback.type === "success"
                      ? <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />}
                    <span>{importFeedback.message}</span>
                  </div>
                )}

                {showImportTutorial && (
                  <div className="mt-3 space-y-3 rounded-lg border border-border bg-card p-3">
                    <p className="text-[11.5px] font-bold uppercase tracking-wide text-muted-foreground">
                      Pasos para generar tu JSON con IA
                    </p>
                    <ol className="space-y-2 text-[12px] text-foreground">
                      <li className="flex gap-2">
                        <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">1</span>
                        <span>Saca foto a tu lista de alumnos (formato libre: lista, tabla, captura de pantalla, etc.).</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">2</span>
                        <span>Abre tu IA de confianza (ChatGPT, Gemini o Claude) y sube la imagen.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">3</span>
                        <span>Pega este prompt junto con la imagen:</span>
                      </li>
                    </ol>
                    <div className="relative">
                      <pre className="max-h-48 overflow-auto rounded-lg border border-border bg-background p-3 text-[10.5px] leading-relaxed text-foreground whitespace-pre-wrap">{PROMPT_IMPORT}</pre>
                      <button
                        type="button"
                        onClick={copiarPrompt}
                        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 text-[10px] font-bold text-foreground hover:border-primary hover:text-primary"
                      >
                        {promptCopied ? <Check className="h-3 w-3 text-emerald-600" /> : <Upload className="h-3 w-3" />}
                        {promptCopied ? "Copiado" : "Copiar prompt"}
                      </button>
                    </div>
                    <ol start={4} className="space-y-2 text-[12px] text-foreground">
                      <li className="flex gap-2">
                        <span className="mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">4</span>
                        <span>Copia el JSON que te dé, pégalo en un archivo <code className="rounded bg-muted px-1 py-0.5 text-[10.5px]">alumnos.json</code> y súbelo aquí.</span>
                      </li>
                    </ol>
                    <details className="rounded-lg border border-dashed border-border bg-background p-2.5">
                      <summary className="cursor-pointer text-[11px] font-bold text-muted-foreground">
                        ¿Ya tienes los nombres en una lista? Formato simple alternativo
                      </summary>
                      <pre className="mt-2 overflow-auto rounded bg-muted/40 p-2 text-[10.5px] text-foreground">{`["Juan Tapia", "Maria Soto", "Carlos Rojas"]`}</pre>
                    </details>
                  </div>
                )}
              </div>

              <form onSubmit={handleAddEstudiante} className="mb-3 flex gap-2">
                <input
                  type="text"
                  value={nuevoEstudiante}
                  onChange={e => setNuevoEstudiante(e.target.value)}
                  placeholder="Nombre del estudiante (ej: Juan Tapia)"
                  className="h-9 flex-1 rounded-lg border border-border bg-card px-3 text-[12.5px] outline-none focus:border-primary"
                />
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-slate-800">
                  <Plus className="h-3.5 w-3.5" /> Añadir
                </button>
                <button
                  type="button"
                  onClick={onSaveEstudiantes}
                  className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-[12px] font-bold text-foreground hover:border-primary"
                >
                  <Save className="h-3.5 w-3.5" /> Guardar
                </button>
              </form>

              {estudiantesOrdenados.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border bg-muted/20 py-6 text-center text-[12px] text-muted-foreground">
                  Aún no hay estudiantes. Añade el primero arriba.
                </p>
              ) : (
                <div className="overflow-hidden rounded-[10px] border border-border bg-card">
                  {estudiantesOrdenados.map((est: Estudiante) => {
                    const pieOpen = est.pie && pieExpanded === est.id
                    const isDragging = draggingId === est.id
                    const isDropTarget = dragOverId === est.id && draggingId !== null && draggingId !== est.id
                    return (
                      <div
                        key={est.id}
                        onDragOver={handleDragOver(est.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop(est.id)}
                        onDragEnd={handleDragEnd}
                        className={cn(
                          "border-b border-border last:border-b-0 transition-colors",
                          isDragging && "opacity-40",
                          isDropTarget && "border-t-2 border-t-primary bg-primary/5"
                        )}
                      >
                        <div className="flex items-center gap-2 px-3 py-2 group hover:bg-muted/30">
                          <div
                            draggable
                            onDragStart={handleDragStart(est.id)}
                            title="Arrastra para reordenar"
                            className="grid h-7 w-5 cursor-grab place-items-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
                          >
                            <GripVertical className="h-4 w-4" />
                          </div>
                          <input
                            type="number"
                            min="1"
                            value={est.orden ?? ""}
                            onChange={e => {
                              const v = Number(e.target.value)
                              setEstudiantes(estudiantes.map((x: Estudiante) => x.id === est.id ? { ...x, orden: Number.isFinite(v) ? Math.max(1, Math.trunc(v)) : undefined } : x))
                            }}
                            className="h-7 w-12 rounded border border-border bg-background px-1 text-center text-[11px] font-bold outline-none focus:border-primary"
                          />
                          <span className="flex-1 truncate text-[12.5px] font-medium text-foreground">{est.nombre}</span>
                          {est.pie && (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 border border-amber-200">
                              PIE{est.pieDiagnostico ? ` · ${est.pieDiagnostico}` : ""}
                            </span>
                          )}
                          <button
                            onClick={() => setEstudiantes(estudiantes.map((x: Estudiante) => x.id === est.id ? { ...x, pie: !x.pie } : x))}
                            className={cn(
                              "rounded px-2 py-0.5 text-[10px] font-bold transition-colors",
                              est.pie
                                ? "bg-amber-50 text-amber-800 border border-amber-200"
                                : "border border-border text-muted-foreground hover:border-amber-200 hover:text-amber-800"
                            )}
                          >
                            PIE
                          </button>
                          {est.pie && (
                            <button
                              onClick={() => setPieExpanded(pieExpanded === est.id ? null : est.id)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted"
                              title="Detalles PIE"
                            >
                              <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", pieOpen && "rotate-90")} />
                            </button>
                          )}
                          <button
                            onClick={() => setEstudiantes(estudiantes.filter((x: Estudiante) => x.id !== est.id))}
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {pieOpen && (
                          <div className="space-y-2 border-t border-amber-200/50 bg-amber-50/30 px-4 py-3">
                            <div>
                              <label className="text-[10px] font-bold uppercase text-muted-foreground">Diagnóstico</label>
                              <select
                                value={est.pieDiagnostico || ""}
                                onChange={e => setEstudiantes(estudiantes.map((x: Estudiante) => x.id === est.id ? { ...x, pieDiagnostico: e.target.value } : x))}
                                className="mt-1 h-7 w-full rounded border border-border bg-card px-2 text-[11px] outline-none"
                              >
                                <option value="">— Seleccionar —</option>
                                <option value="TEL">TEL — Trast. Específico del Lenguaje</option>
                                <option value="DEA">DEA — Dificultad Específica de Aprendizaje</option>
                                <option value="DI">DI — Discapacidad Intelectual</option>
                                <option value="FIL">FIL — Func. Intelectual Limítrofe</option>
                                <option value="TEA">TEA — Trast. del Espectro Autista</option>
                                <option value="TDAH">TDAH — Déficit Atencional</option>
                                <option value="Disc. Visual">Discapacidad Visual</option>
                                <option value="Disc. Auditiva">Discapacidad Auditiva</option>
                                <option value="Disc. Motora">Discapacidad Motora</option>
                                <option value="Trast. Psiquiátrico">Trastorno Psiquiátrico</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-muted-foreground">Especialista</label>
                              <input
                                type="text"
                                value={est.pieEspecialista || ""}
                                onChange={e => setEstudiantes(estudiantes.map((x: Estudiante) => x.id === est.id ? { ...x, pieEspecialista: e.target.value } : x))}
                                placeholder="Nombre del especialista"
                                className="mt-1 h-7 w-full rounded border border-border bg-card px-2 text-[11px] outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] font-bold uppercase text-muted-foreground">Notas de adecuación</label>
                              <textarea
                                value={est.pieNotas || ""}
                                onChange={e => setEstudiantes(estudiantes.map((x: Estudiante) => x.id === est.id ? { ...x, pieNotas: e.target.value } : x))}
                                rows={2}
                                className="mt-1 w-full resize-none rounded border border-border bg-card px-2 py-1 text-[11px] outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Footer con acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-5 py-3">
        <button
          onClick={() => setExpanded(expanded === "estudiantes" ? null : "estudiantes")}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] font-bold transition-colors",
            expanded === "estudiantes"
              ? "border-primary bg-pink-light text-primary"
              : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
          )}
        >
          <Users className="h-3.5 w-3.5" />
          {expanded === "estudiantes" ? "Ocultar estudiantes" : `Estudiantes (${estudiantes.length})`}
        </button>

        {confirmRemove ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-red-600">¿Eliminar curso completo?</span>
            <button
              onClick={() => { removeCurso(); setConfirmRemove(false) }}
              className="rounded-lg bg-red-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-600"
            >
              Sí, eliminar
            </button>
            <button
              onClick={() => setConfirmRemove(false)}
              className="text-[11px] font-bold text-muted-foreground hover:text-foreground"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmRemove(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/50 px-3 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" /> Eliminar curso
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Vista: Asignaturas
// ─────────────────────────────────────────────────────────────────────────────

function AsignaturasView({
  asignaturasDisponibles, asignaturasHabilitadas, handleToggleAsignatura, saveStatus,
  cursosDisponibles, nivelMapping, setNivelMapping, cursoTipos, setCursoTipos, saveMapping,
}: any) {
  return (
    <div className="space-y-5">
      {/* Asignaturas habilitadas */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle icon={BookMarked} title="Asignaturas que enseño" hint="Filtra el switcher del header" />
          <SaveBadge status={saveStatus} />
        </div>
        <p className="mb-4 text-[12px] text-muted-foreground">
          Solo las marcadas aparecerán en el selector de asignatura del header. Si desmarcas todas, se mostrarán todas (compatibilidad).
        </p>
        {asignaturasDisponibles.length === 0 ? (
          <p className="text-[12.5px] italic text-muted-foreground">No hay asignaturas disponibles en el currículum.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {asignaturasDisponibles.map((a: string) => {
              const checked = asignaturasHabilitadas?.includes(a) ?? false
              return (
                <label
                  key={a}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-[10px] border px-3 py-2 text-[12.5px] font-medium transition-colors",
                    checked ? "border-primary bg-pink-light text-foreground" : "border-border bg-background text-muted-foreground hover:border-primary/50"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggleAsignatura(a)}
                    className="h-4 w-4 accent-primary"
                  />
                  <span className="truncate">{a}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* Mapeo de niveles */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle icon={GraduationCap} title="Mapeo de niveles curriculares" hint="Vincula tus cursos al currículo Mineduc" />
          <SaveBadge status={saveMapping} />
        </div>
        <p className="mb-4 text-[12px] text-muted-foreground">
          Esto permite que el copiloto IA y el currículum carguen los contenidos correctos al planificar.
        </p>
        {cursosDisponibles.length === 0 ? (
          <div className="rounded-[12px] border border-dashed border-border bg-background p-6 text-center text-[12.5px] text-muted-foreground">
            Primero agrega cursos en <strong>Mi Semana</strong>.
          </div>
        ) : (
          <div className="space-y-2">
            {cursosDisponibles.map((curso: string) => {
              const tipo = (cursoTipos?.[curso] ?? "oficial") as TipoCurricular
              const esOficial = tipo === "oficial"
              return (
                <div key={curso} className="flex flex-wrap items-center gap-3 rounded-[12px] border border-border bg-background px-4 py-3">
                  <span className="min-w-[100px] text-[13px] font-extrabold text-foreground">{curso}</span>
                  <select
                    value={tipo}
                    onChange={e => {
                      const next = e.target.value as TipoCurricular
                      setCursoTipos?.((prev: CursoTipoMap) => {
                        const map = { ...prev }
                        if (next === "oficial") delete map[curso]
                        else map[curso] = next
                        return map
                      })
                      if (next !== "oficial") {
                        setNivelMapping((prev: NivelMapping) => {
                          const m = { ...prev }
                          delete m[curso]
                          return m
                        })
                      }
                    }}
                    className="h-9 rounded-lg border border-border bg-card px-2 text-[11.5px] font-bold outline-none focus:border-primary"
                  >
                    <option value="oficial">Oficial Mineduc</option>
                    <option value="taller">Taller</option>
                    <option value="libre">Libre</option>
                  </select>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                  {esOficial ? (
                    <select
                      value={nivelMapping[curso] ?? ""}
                      onChange={e => setNivelMapping((prev: NivelMapping) => ({ ...prev, [curso]: e.target.value }))}
                      className={cn(
                        "h-9 flex-1 min-w-[200px] rounded-lg border bg-card px-3 text-[12.5px] font-semibold outline-none transition-colors focus:border-primary",
                        nivelMapping[curso] ? "border-border" : "border-amber-300 bg-amber-50/30 text-amber-700"
                      )}
                    >
                      <option value="">— Sin configurar —</option>
                      {NIVELES_CURRICULARES.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 min-w-[200px] text-[11.5px] italic text-muted-foreground">
                      {tipo === "taller" ? "Sin nivel curricular (taller / electivo)" : "Sin currículum oficial (uso libre)"}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Vista: Identidad (datos personales + colegio)
// ─────────────────────────────────────────────────────────────────────────────

function IdentidadView({
  perfil, setPerfil, colegio, setColegio,
  handleSavePerfil, savePerfil, saveColegio,
  logoInputRef, logoDerInputRef, handleLogoUpload, handleLogoDerUpload,
}: any) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Perfil profesional */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle icon={Briefcase} title="Datos profesionales" />
          <SaveBadge status={savePerfil} />
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Tipo de docente</label>
            <select
              value={perfil.tipoProfesor}
              onChange={e => setPerfil({ ...perfil, tipoProfesor: e.target.value })}
              className="mt-1 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[12.5px] font-medium outline-none focus:border-primary"
            >
              <option value="">Selecciona tu rol…</option>
              <option value="General Básica">Profesor(a) de Ed. General Básica</option>
              <option value="Media">Profesor(a) de Educación Media</option>
              <option value="Diferencial">Educador(a) Diferencial</option>
            </select>
          </div>

          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Especialidad / Asignatura</label>
            <input
              type="text"
              value={perfil.especialidad}
              onChange={e => setPerfil({ ...perfil, especialidad: e.target.value })}
              placeholder="Ej: Música"
              className="mt-1 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[12.5px] font-medium outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <GraduationCap className="h-3 w-3" /> Estudios y títulos
            </label>
            <input
              type="text"
              value={perfil.estudios}
              onChange={e => setPerfil({ ...perfil, estudios: e.target.value })}
              className="mt-1 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[12.5px] font-medium outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
              <FileText className="h-3 w-3" /> Biografía
            </label>
            <textarea
              value={perfil.biografia}
              onChange={e => setPerfil({ ...perfil, biografia: e.target.value })}
              rows={3}
              className="mt-1 w-full resize-none rounded-[10px] border border-border bg-background p-3 text-[12.5px] font-medium outline-none focus:border-primary"
            />
          </div>

          <button
            onClick={handleSavePerfil}
            disabled={savePerfil === "saving"}
            className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-5 py-2 text-[12.5px] font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {savePerfil === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </button>
        </div>
      </div>

      {/* Colegio */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <div className="mb-4 flex items-center justify-between">
          <SectionTitle icon={School} title="Mi colegio" hint="Aparece en exportaciones" />
          <SaveBadge status={saveColegio} />
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Nombre del colegio</label>
            <input
              type="text"
              value={colegio.nombre}
              onChange={e => setColegio((prev: InfoColegio) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Ej: Colegio San Ignacio"
              className="mt-1 h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[12.5px] font-medium outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Logo principal</label>
            <div className="mt-2 flex items-start gap-3">
              {colegio.logoBase64 ? (
                <div className="relative">
                  <img src={colegio.logoBase64} alt="Logo" className="h-20 w-20 rounded-[10px] border border-border bg-muted/20 object-contain p-1" />
                  <button
                    onClick={() => setColegio((prev: InfoColegio) => ({ ...prev, logoBase64: undefined }))}
                    title="Quitar"
                    className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-500 text-white hover:bg-red-600"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              ) : (
                <div className="grid h-20 w-20 place-items-center rounded-[10px] border-2 border-dashed border-border bg-muted/20 text-muted-foreground/40">
                  <School className="h-7 w-7" />
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <button
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-1.5 text-[11.5px] font-bold hover:border-primary"
                >
                  <Upload className="h-3.5 w-3.5" /> {colegio.logoBase64 ? "Cambiar" : "Subir"}
                </button>
                <p className="text-[10.5px] text-muted-foreground">PNG/JPG · máx 1 MB · se comprime auto.</p>
              </div>
            </div>
          </div>

          {/* Encabezado para exportaciones */}
          <div className="rounded-[12px] border border-border bg-background p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="min-w-0">
                <h4 className="text-[13px] font-extrabold text-foreground">Encabezado de exportaciones</h4>
                <p className="text-[11px] text-muted-foreground">Aparece en las planificaciones, pruebas y guías Word.</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!colegio.encabezadoHabilitado}
                  onChange={e => setColegio((prev: InfoColegio) => ({ ...prev, encabezadoHabilitado: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                <span className="text-[11.5px] font-bold">Activar</span>
              </label>
            </div>

            {colegio.encabezadoHabilitado && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2 rounded-[10px] border border-border bg-card p-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Lado izquierdo</p>
                  <textarea
                    value={colegio.encabezadoTextoIzq || ""}
                    onChange={e => setColegio((prev: InfoColegio) => ({ ...prev, encabezadoTextoIzq: e.target.value }))}
                    placeholder={"NOMBRE DEL COLEGIO\nDEPARTAMENTO ACADÉMICO\nÁREA: Asignatura"}
                    rows={3}
                    className="w-full resize-none rounded-md border border-border bg-background p-2 text-[11px] outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-2 rounded-[10px] border border-border bg-card p-3">
                  <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">Lado derecho</p>
                  <div className="flex items-center gap-2">
                    {colegio.logoDerBase64 ? (
                      <div className="relative">
                        <img src={colegio.logoDerBase64} alt="" className="h-10 w-10 rounded border border-border object-contain" />
                        <button
                          onClick={() => setColegio((prev: InfoColegio) => ({ ...prev, logoDerBase64: undefined }))}
                          className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-red-500 text-white"
                        >
                          <X className="h-2 w-2" />
                        </button>
                      </div>
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded border-2 border-dashed border-border text-muted-foreground/40">
                        <School className="h-4 w-4" />
                      </div>
                    )}
                    <input ref={logoDerInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoDerUpload} />
                    <button
                      onClick={() => logoDerInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-[10.5px] font-bold"
                    >
                      <Upload className="h-3 w-3" /> {colegio.logoDerBase64 ? "Cambiar" : "Subir"}
                    </button>
                  </div>
                  <textarea
                    value={colegio.encabezadoTextoDer || ""}
                    onChange={e => setColegio((prev: InfoColegio) => ({ ...prev, encabezadoTextoDer: e.target.value }))}
                    placeholder={"FUNDACIÓN / SOSTENEDOR\nCOMUNA, REGIÓN"}
                    rows={3}
                    className="w-full resize-none rounded-md border border-border bg-background p-2 text-[11px] outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//   Vista: Conexiones (Google Calendar)
// ─────────────────────────────────────────────────────────────────────────────

function ConexionesView({
  calendarConnected, calendarAutosync, connectingCalendar, syncingCalendar, calendarMessage,
  handleConnectCalendar, handleDisconnectCalendar, handleSyncCalendarNow, setCalendarAutosync,
  driveConnected, connectingDrive, driveMessage, handleConnectDrive, handleDisconnectDrive,
}: any) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {/* Google Calendar */}
      <div className="rounded-[16px] border border-border bg-card p-5">
        <SectionTitle icon={Calendar} title="Google Calendar" hint="Sincroniza tus actividades" />
        <div className="mb-4 flex items-center justify-between rounded-[12px] border border-border bg-background px-4 py-3">
          <div>
            <div className="text-[12.5px] font-bold text-foreground">Estado de la conexión</div>
            <div className="text-[11px] text-muted-foreground">
              {calendarConnected
                ? "Tu cuenta está conectada. Las actividades de EduPanel se enviarán a tu calendario."
                : "Conecta tu cuenta de Google para enviar tus actividades automáticamente."}
            </div>
          </div>
          <span className={cn(
            "rounded-full px-3 py-1 text-[10.5px] font-extrabold",
            calendarConnected ? "border border-green-200 bg-green-50 text-green-700" : "border border-border bg-muted text-muted-foreground"
          )}>
            {calendarConnected ? "Conectado" : "Desconectado"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {calendarConnected ? (
            <button
              onClick={handleDisconnectCalendar}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-4 py-2 text-[12px] font-bold text-foreground hover:bg-muted/60"
            >
              Desconectar
            </button>
          ) : (
            <button
              onClick={handleConnectCalendar}
              disabled={connectingCalendar}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-slate-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-slate-800 disabled:opacity-70"
            >
              {connectingCalendar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Conectar Google Calendar
            </button>
          )}

          <label className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2 text-[11.5px] font-bold">
            <input
              type="checkbox"
              checked={calendarAutosync}
              disabled={!calendarConnected}
              onChange={e => setCalendarAutosync(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Auto-sync al guardar cronograma
          </label>

          <button
            onClick={handleSyncCalendarNow}
            disabled={!calendarConnected || syncingCalendar}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-primary bg-card px-4 py-2 text-[12px] font-bold text-primary hover:bg-pink-light disabled:opacity-60"
          >
            {syncingCalendar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sincronizar ahora
          </button>
        </div>
        {calendarMessage && (
          <p className="mt-3 text-[11.5px] font-semibold text-muted-foreground">{calendarMessage}</p>
        )}
      </div>

      {/* Próximas integraciones (placeholder amistoso) */}
      <div className="rounded-[16px] border border-dashed border-border bg-card/50 p-5">
        <SectionTitle icon={Sparkles} title="Próximamente" hint="Más integraciones en camino" />
        <ul className="space-y-2.5 text-[12.5px] text-muted-foreground">
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            Notion (exportar planificaciones)
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            Classroom (publicar materiales)
          </li>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
            WhatsApp (avisos a apoderados)
          </li>
        </ul>
      </div>
    </div>
  )
}

function ConexionesViewV2({
  calendarConnected, calendarAutosync, connectingCalendar, syncingCalendar, calendarMessage,
  handleConnectCalendar, handleDisconnectCalendar, handleSyncCalendarNow, setCalendarAutosync,
  driveConnected, driveAutosave, connectingDrive, driveMessage, handleConnectDrive, handleDisconnectDrive, setDriveAutosave,
}: any) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="rounded-[16px] border border-border bg-card p-5">
        <SectionTitle icon={Calendar} title="Google Calendar" hint="Sincroniza tus actividades" />
        <div className="mb-4 flex items-center justify-between rounded-[12px] border border-border bg-background px-4 py-3">
          <div>
            <div className="text-[12.5px] font-bold text-foreground">Estado de la conexion</div>
            <div className="text-[11px] text-muted-foreground">
              {calendarConnected
                ? "Tu cuenta esta conectada. Las actividades pueden incluir enlaces Drive cuando existan."
                : "Conecta tu cuenta de Google para enviar actividades y enlaces de apoyo."}
            </div>
          </div>
          <span className={cn(
            "rounded-full px-3 py-1 text-[10.5px] font-extrabold",
            calendarConnected ? "border border-green-200 bg-green-50 text-green-700" : "border border-border bg-muted text-muted-foreground"
          )}>
            {calendarConnected ? "Conectado" : "Desconectado"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {calendarConnected ? (
            <button
              onClick={handleDisconnectCalendar}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-4 py-2 text-[12px] font-bold text-foreground hover:bg-muted/60"
            >
              Desconectar
            </button>
          ) : (
            <button
              onClick={handleConnectCalendar}
              disabled={connectingCalendar}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-slate-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-slate-800 disabled:opacity-70"
            >
              {connectingCalendar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Conectar Google Calendar
            </button>
          )}

          <label className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2 text-[11.5px] font-bold">
            <input
              type="checkbox"
              checked={calendarAutosync}
              disabled={!calendarConnected}
              onChange={e => setCalendarAutosync(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Auto-sync al guardar cronograma
          </label>

          <button
            onClick={handleSyncCalendarNow}
            disabled={!calendarConnected || syncingCalendar}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-primary bg-card px-4 py-2 text-[12px] font-bold text-primary hover:bg-pink-light disabled:opacity-60"
          >
            {syncingCalendar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Sincronizar ahora
          </button>
        </div>
        {calendarMessage && (
          <p className="mt-3 text-[11.5px] font-semibold text-muted-foreground">{calendarMessage}</p>
        )}
      </div>

      <div className="rounded-[16px] border border-border bg-card p-5">
        <SectionTitle icon={HardDrive} title="Google Drive personal" hint="Tus carpetas dentro de EduPanel" />
        <div className="mb-4 flex items-center justify-between rounded-[12px] border border-border bg-background px-4 py-3">
          <div>
            <div className="text-[12.5px] font-bold text-foreground">Estado de la conexion</div>
            <div className="text-[11px] text-muted-foreground">
              {driveConnected
                ? "Tu Drive personal esta disponible en planificaciones, unidades, pruebas y guias."
                : "Conecta tu cuenta para abrir tu Drive personal sin salir de EduPanel."}
            </div>
          </div>
          <span className={cn(
            "rounded-full px-3 py-1 text-[10.5px] font-extrabold",
            driveConnected ? "border border-green-200 bg-green-50 text-green-700" : "border border-border bg-muted text-muted-foreground"
          )}>
            {driveConnected ? "Conectado" : "Desconectado"}
          </span>
        </div>

        <div className="mb-4 rounded-[12px] border border-green-200 bg-green-50 px-4 py-3 text-[11.5px] font-semibold leading-relaxed text-green-800">
          <div className="mb-1 flex items-center gap-1.5 font-extrabold">
            <ShieldCheck className="h-3.5 w-3.5" />
            Privado por docente
          </div>
          EduPanel crea carpetas solo en tu Drive personal cuando lo autorizas. Guarda IDs y enlaces minimos, no contenido de documentos.
        </div>

        <div className="mb-4 rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[11.5px] leading-relaxed text-amber-900">
          <div className="mb-2 flex items-center gap-1.5 font-extrabold">
            <AlertCircle className="h-3.5 w-3.5" />
            Antes de configurar Drive
          </div>
          <ul className="space-y-1">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Google pedira permiso para ver metadata de Drive y crear archivos/carpetas que EduPanel gestione.
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Al usar "Crear / reparar", se crea una carpeta privada Edu-Panel con ano, asignatura, curso y unidad.
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Los archivos quedan en tu Drive; EduPanel guarda solo enlaces, IDs y contexto minimo para volver rapido.
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {driveConnected ? (
            <button
              onClick={handleDisconnectDrive}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-4 py-2 text-[12px] font-bold text-foreground hover:bg-muted/60"
            >
              Desconectar
            </button>
          ) : (
            <button
              onClick={handleConnectDrive}
              disabled={connectingDrive}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-slate-900 px-4 py-2 text-[12px] font-bold text-white hover:bg-slate-800 disabled:opacity-70"
            >
              {connectingDrive && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Conectar Google Drive
            </button>
          )}

          <label className="inline-flex items-center gap-2 rounded-[10px] border border-border bg-card px-3 py-2 text-[11.5px] font-bold">
            <input
              type="checkbox"
              checked={driveAutosave}
              disabled={!driveConnected}
              onChange={e => setDriveAutosave(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Auto-respaldo Drive al guardar
          </label>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            El auto-respaldo actualiza Word y JSON. El PDF solo se crea al usar Exportar a Drive.
          </p>
        </div>
        {driveConnected && (
          <DriveWorkspaceActions
            className="mt-3"
            setupLabel="Crear / reparar carpeta Edu-Panel"
            openLabel="Abrir carpeta raiz"
          />
        )}
        {driveMessage && (
          <p className="mt-3 text-[11.5px] font-semibold text-muted-foreground">{driveMessage}</p>
        )}
      </div>
    </div>
  )
}
