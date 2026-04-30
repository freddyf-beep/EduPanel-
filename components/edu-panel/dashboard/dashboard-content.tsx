"use client"

import { useEffect, useState, useMemo } from "react"
import Link from "next/link"
import {
  ArrowRight, Calendar, Check, ChevronLeft, ChevronRight,
  ClipboardCheck, ClipboardList, Clock, LifeBuoy, Loader2,
  Users, X, BookOpen, Pen, UserCheck, PenLine, AlertCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { cargarEstadoClases, guardarEstadoClases, cargarHorarioSemanal, ClaseHorario } from "@/lib/horario"
import {
  cargarActividadClase, cargarLibroClases, guardarLibroClases, cargarCronogramaUnidad,
  guardarAnotacion, cargarAnotacion,
} from "@/lib/curriculo"
import type { ActividadClase, BloqueLibroClase, EstadoAsistencia } from "@/lib/curriculo"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { useAuth } from "@/components/auth/auth-context"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { ResumenSemanal } from "@/components/edu-panel/dashboard/resumen-semanal"

const DAYS   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"]
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DIAS_HABILES = ["Lunes","Martes","Miércoles","Jueves","Viernes"]

const ESTADOS_ASISTENCIA: { key: EstadoAsistencia; label: string; cls: string }[] = [
  { key: "presente", label: "P", cls: "bg-green-100 text-green-700 hover:bg-green-200" },
  { key: "ausente",  label: "A", cls: "bg-red-100 text-red-600 hover:bg-red-200" },
  { key: "atraso",   label: "T", cls: "bg-amber-100 text-amber-700 hover:bg-amber-200" },
  { key: "retirado", label: "R", cls: "bg-slate-100 text-slate-600 hover:bg-slate-200" },
]

function fechaKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
}
function fechaDD_MM_YYYY(d: Date) {
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`
}

type ModalTab = "clase" | "leccionario" | "asistencia" | "firma" | "anotaciones"

export function DashboardContent() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const { user } = useAuth()
  const [currentDate, setCurrentDate]       = useState(new Date())
  const [greeting, setGreeting]             = useState("Buenos días")
  const [estado, setEstado]                 = useState<Record<string, boolean>>({})
  const [horarioSemanal, setHorarioSemanal] = useState<ClaseHorario[]>([])
  const [loading, setLoading]               = useState(true)
  const [showHorario, setShowHorario]       = useState(false)
  const [selectedDay, setSelectedDay]       = useState(() => {
    const d = new Date()
    return DIAS_HABILES.includes(DAYS[d.getDay()]) ? DAYS[d.getDay()] : "Lunes"
  })

  // Modal
  const [modalClase, setModalClase]         = useState<ClaseHorario | null>(null)
  const [modalTab, setModalTab]             = useState<ModalTab>("clase")
  const [actividadModal, setActividadModal] = useState<ActividadClase | null>(null)
  const [bloquesLibro, setBloquesLibro]     = useState<BloqueLibroClase[]>([])
  const [loadingModal, setLoadingModal]     = useState(false)
  const [savingLibro, setSavingLibro]       = useState(false)
  const [anotaciones, setAnotaciones]       = useState("")
  const [firmado, setFirmado]               = useState(false)
  const [claseNumeroModal, setClaseNumeroModal] = useState(1)
  const [unidadModal, setUnidadModal]           = useState("unidad_1")
  const [savingAnotacion, setSavingAnotacion]   = useState(false)
  const [anotacionGuardada, setAnotacionGuardada] = useState(false)
  const [modalLoadError, setModalLoadError]     = useState(false)
  const [saveError, setSaveError]               = useState<string | null>(null)

  const diaActual    = DAYS[currentDate.getDay()]
  const esDiaLaboral = DIAS_HABILES.includes(diaActual)
  const clave        = fechaKey(currentDate)

  const getClasesDelDia = (dia: string) => {
    return horarioSemanal
      .filter(c => c.dia === dia)
      .sort((a,b) => a.horaInicio.localeCompare(b.horaInicio))
      .map(c => ({...c, completada: !!estado[c.uid]}))
  }

  const clasesHoy = esDiaLaboral ? getClasesDelDia(diaActual) : []

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches")
  }, [])

  useEffect(() => {
    if (!user) return
    setLoading(true)
    Promise.all([
      cargarEstadoClases(clave),
      cargarHorarioSemanal()
    ])
    .then(([est, hor]) => {
      setEstado(est)
      setHorarioSemanal(hor)
    })
    .catch(console.error)
    .finally(() => setLoading(false))
  }, [clave, user])

  const abrirModal = async (cls: ClaseHorario) => {
    setModalClase(cls)
    setModalTab("clase")
    setLoadingModal(true)
    setBloquesLibro([])
    setAnotaciones("")
    setFirmado(false)
    setModalLoadError(false)
    setSaveError(null)

    const cursoMatch = cls.resumen

    const fechaStr    = fechaDD_MM_YYYY(currentDate)  // "DD/MM/YYYY"
    const fechaISO    = fechaKey(currentDate)           // "YYYY-MM-DD"

    try {
      // 1. Buscar en todas las unidades del curso qué clase corresponde a hoy
      let claseNum = 1
      let unidadId = "unidad_1"

      // Buscar en cronograma_unidad las unidades activas y encontrar la clase de hoy
      const cronogramas = await Promise.all(
        ["unidad_1","unidad_2","unidad_3"].map(uid =>
          cargarCronogramaUnidad(ASIGNATURA, cursoMatch, uid).catch(() => null)
        )
      )
      for (const crono of cronogramas) {
        if (!crono) continue
        // Buscar clase cuya fecha coincide con hoy (formato DD/MM/YYYY)
        const claseHoy = crono.clases.find(c => {
          if (!c.fecha) return false
          // c.fecha es "DD/MM/YYYY", fechaStr también
          return c.fecha === fechaStr ||
            // También comparar con ISO por si acaso
            c.fecha === `${currentDate.getDate().toString().padStart(2,"0")}/${(currentDate.getMonth()+1).toString().padStart(2,"0")}/${currentDate.getFullYear()}`
        })
        if (claseHoy) {
          claseNum = claseHoy.numero
          unidadId = crono.unidadId
          break
        }
      }

      setClaseNumeroModal(claseNum)
      setUnidadModal(unidadId)

      const [act, libro, anotTxt] = await Promise.all([
        cargarActividadClase(cursoMatch, unidadId, claseNum, ASIGNATURA).catch(() => null),
        cargarLibroClases(ASIGNATURA, cursoMatch, fechaStr).catch(() => null),
        cargarAnotacion(cursoMatch, fechaStr, ASIGNATURA).catch(() => ""),
      ])
      setAnotaciones(anotTxt || "")
      setActividadModal(act)
      if (libro?.bloques) {
        setBloquesLibro(libro.bloques)
        setFirmado(libro.bloques.some(b => b.firmado))
      } else {
        // Inicializar bloque vacío con asistencia
        setBloquesLibro([{
          id: `${cursoMatch}_${fechaStr}_b1`,
          bloque: "Bloque 1",
          horaInicio: cls.horaInicio,
          horaFin: cls.horaFin,
          objetivo: act?.objetivo || "",
          actividad: act?.desarrollo || "",
          firmado: false,
          asistencia: [],
        }])
      }
    } catch (e) {
      console.error(e)
      setModalLoadError(true)
    } finally {
      setLoadingModal(false)
    }
  }

  const toggleAsistencia = (bloqueId: string, estudianteId: string) => {
    setBloquesLibro(prev => prev.map(b => {
      if (b.id !== bloqueId) return b
      return {
        ...b,
        asistencia: b.asistencia.map(a => {
          if (a.id !== estudianteId) return a
          const estados: EstadoAsistencia[] = ["presente","ausente","atraso","retirado"]
          const next = estados[(estados.indexOf(a.estado) + 1) % estados.length]
          return { ...a, estado: next }
        })
      }
    }))
  }

  const handleGuardarAnotacion = async () => {
    if (!modalClase) return
    setSavingAnotacion(true)
    const cursoMatch = modalClase.resumen
    const fechaStr = fechaDD_MM_YYYY(currentDate)
    try {
      await guardarAnotacion(cursoMatch, fechaStr, anotaciones, ASIGNATURA)
      setAnotacionGuardada(true)
      setTimeout(() => setAnotacionGuardada(false), 3000)
    } catch (e) {
      console.error(e)
      setSaveError("No se pudo guardar la anotación. Verifica tu conexión.")
      setTimeout(() => setSaveError(null), 7000)
    } finally { setSavingAnotacion(false) }
  }

  // claseNumeroModal y unidadModal son estados declarados arriba
  const guardarLibro = async () => {
    if (!modalClase) return
    setSavingLibro(true)
    setSaveError(null)
    const cursoMatch = modalClase.resumen
    const fechaStr = fechaDD_MM_YYYY(currentDate)
    try {
      await guardarLibroClases(ASIGNATURA, cursoMatch, fechaStr, bloquesLibro)
    } catch (e) {
      console.error(e)
      setSaveError("No se pudo guardar el leccionario. Verifica tu conexión.")
      setTimeout(() => setSaveError(null), 7000)
    } finally { setSavingLibro(false) }
  }

  const firmar = async () => {
    if (!modalClase) return
    const updated = bloquesLibro.map(b => ({ ...b, firmado: true }))
    setBloquesLibro(updated)
    setFirmado(true)
    const cursoMatch = modalClase.resumen
    const fechaStr = fechaDD_MM_YYYY(currentDate)
    try {
      await guardarLibroClases(ASIGNATURA, cursoMatch, fechaStr, updated)
    } catch (e) {
      console.error(e)
      setFirmado(false)
      setSaveError("No se pudo firmar la clase. Intenta nuevamente.")
      setTimeout(() => setSaveError(null), 7000)
    }
  }

  const toggleClase = async (uid: string) => {
    const next = { ...estado, [uid]: !estado[uid] }
    setEstado(next)
    await guardarEstadoClases(next, clave)
  }

  const formattedDate = `${diaActual} ${currentDate.getDate()} de ${MONTHS[currentDate.getMonth()]} de ${currentDate.getFullYear()}`
  const completadas   = clasesHoy.filter(c => c.completada).length

  // Progreso del año escolar Chile: 1 marzo → 15 diciembre
  const schoolYearProgress = useMemo(() => {
    const now = new Date()
    const year = now.getFullYear()
    const start = new Date(year, 2, 1)    // 1 marzo
    const end   = new Date(year, 11, 15)  // 15 diciembre
    const total   = end.getTime() - start.getTime()
    const elapsed = Math.max(0, Math.min(total, now.getTime() - start.getTime()))
    return Math.round((elapsed / total) * 100)
  }, [])

  // Clases planificadas y completadas en la semana de currentDate
  const { clasesSemana, completadasSemana } = useMemo(() => {
    const d = new Date(currentDate)
    const dayOfWeek = d.getDay() === 0 ? 6 : d.getDay() - 1 // 0=lunes
    const lunes = new Date(d)
    lunes.setDate(d.getDate() - dayOfWeek)
    const viernes = new Date(lunes)
    viernes.setDate(lunes.getDate() + 4)
    const diasSemana = DIAS_HABILES.map((dia, i) => {
      const dd = new Date(lunes)
      dd.setDate(lunes.getDate() + i)
      return dia
    })
    const clasesSemana = horarioSemanal.filter(c => diasSemana.includes(c.dia) && c.tipo === "clase").length
    const completadasSemana = horarioSemanal.filter(c => diasSemana.includes(c.dia) && c.tipo === "clase" && !!estado[c.uid]).length
    return { clasesSemana, completadasSemana }
  }, [horarioSemanal, estado, currentDate])

  const quickActions = [
    { label: "Mis planificaciones", href: buildUrl("/planificaciones", withAsignatura({}, ASIGNATURA)), icon: BookOpen },
    { label: "Libro de clases",     href: buildUrl("/libro-clases", withAsignatura({}, ASIGNATURA)),    icon: ClipboardList },
    { label: "Calificaciones",      href: buildUrl("/calificaciones", withAsignatura({}, ASIGNATURA)),  icon: ClipboardCheck },
    { label: "Perfil 360",          href: buildUrl("/perfil-360", withAsignatura({}, ASIGNATURA)),      icon: Users },
    { label: "Centro de ayuda",     href: buildUrl("/soporte", withAsignatura({}, ASIGNATURA)),         icon: LifeBuoy },
  ]

  const stats = [
    { label: "Clases hoy",  value: clasesHoy.filter(c => c.tipo === "clase").length, bg: "var(--primary-light)", fg: "var(--primary)" },
    { label: "Completadas", value: completadas,                                       bg: "#F0FDF4", fg: "#22C55E" },
    { label: "Pendientes",  value: clasesHoy.filter(c => !c.completada).length,       bg: "#FEF3C7", fg: "#F59E0B" },
  ]

  const MODAL_TABS: { key: ModalTab; label: string; icon: typeof BookOpen }[] = [
    { key: "clase",       label: "Clase",       icon: BookOpen      },
    { key: "leccionario", label: "Leccionario", icon: Pen           },
    { key: "asistencia",  label: "Asistencia",  icon: UserCheck     },
    { key: "firma",       label: "Firma",       icon: PenLine       },
    { key: "anotaciones", label: "Anotaciones", icon: ClipboardList },
  ]

  return (
    <div className="flex flex-col gap-6 xl:flex-row">

      {/* ── Columna principal ── */}
      <div className="min-w-0 flex-1">
        <h1 className="mb-1 text-[22px] font-extrabold animate-fade-up">
          {greeting}, <span className="text-primary">{user ? user.displayName?.split(" ")[0] : "Profesor"}</span>
        </h1>
        <p className="mb-6 text-[13px] text-muted-foreground animate-fade-up">
          {esDiaLaboral ? `Tienes ${clasesHoy.length} bloques hoy.` : "Hoy no hay clases programadas."}
        </p>

        <ResumenSemanal asignatura={ASIGNATURA} horario={horarioSemanal} fecha={currentDate} />

        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 animate-fade-up">
          {quickActions.map(item => {
            const Icon = item.icon
            return (
              <Link key={item.label} href={item.href}
                className="bg-card border border-border rounded-[14px] px-4 py-3 flex items-center gap-3 hover:shadow-[0_6px_18px_rgba(0,0,0,0.06)] transition-all hover:-translate-y-0.5">
                <div className="w-9 h-9 rounded-xl bg-pink-light text-primary grid place-items-center">
                  <Icon className="w-4 h-4" />
                </div>
                <div className="text-[13px] font-semibold leading-tight">{item.label}</div>
              </Link>
            )
          })}
        </div>

        {/* Métricas del año escolar */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3 animate-fade-up">
          {/* Progreso del año */}
          <div className="rounded-[14px] border border-border bg-card p-4">
            <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">Año escolar {new Date().getFullYear()}</p>
            <div className="flex items-end justify-between mb-2">
              <span className="text-[22px] font-extrabold text-primary">{schoolYearProgress}%</span>
              <span className="text-[11px] text-muted-foreground">mar → dic</span>
            </div>
            <div className="h-2 w-full rounded-full bg-border overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-700"
                style={{ width: `${schoolYearProgress}%` }}
              />
            </div>
          </div>
          {/* Clases esta semana */}
          <div className="rounded-[14px] border border-border bg-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-light grid place-items-center flex-shrink-0">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Clases esta semana</p>
              <p className="text-[22px] font-extrabold leading-tight">
                {clasesSemana > 0 ? `${completadasSemana}/${clasesSemana}` : "—"}
              </p>
            </div>
          </div>
          {/* Completadas */}
          <div className="rounded-[14px] border border-border bg-card p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-50 grid place-items-center flex-shrink-0">
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground">Completadas hoy</p>
              <p className="text-[22px] font-extrabold leading-tight">{completadas}/{clasesHoy.length || 0}</p>
            </div>
          </div>
        </div>

        <div className="mb-5 flex flex-wrap items-center gap-2.5 animate-fade-up">
          <div className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-3.5 py-2 text-[13px] font-semibold">
            <Calendar className="h-[14px] w-[14px] text-primary flex-shrink-0" />
            {formattedDate}
          </div>
          <div className="flex gap-1">
            <button onClick={() => setCurrentDate(p => new Date(p.getFullYear(), p.getMonth(), p.getDate()-1))}
              className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-pink-light hover:text-primary">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCurrentDate(p => new Date(p.getFullYear(), p.getMonth(), p.getDate()+1))}
              className="grid h-[30px] w-[30px] place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-pink-light hover:text-primary">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button onClick={() => setShowHorario(v => !v)}
            className="flex items-center gap-1.5 rounded-[10px] bg-pink-light px-3.5 py-2 text-xs font-bold text-primary sm:ml-auto">
            <Clock className="h-3.5 w-3.5" />
            {showHorario ? "Ver hoy" : "Ver horario semanal"}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 text-muted-foreground py-8">
            <Loader2 className="w-4 h-4 animate-spin" /><span className="text-[13px]">Cargando…</span>
          </div>
        ) : showHorario ? (
          <div className="overflow-hidden rounded-[14px] border border-border bg-card animate-fade-up">
            {/* Vista móvil: tabs por día */}
            <div className="sm:hidden">
              <div className="flex border-b border-border bg-background">
                {DIAS_HABILES.map(d => (
                  <button key={d} onClick={() => setSelectedDay(d)}
                    className={cn("flex-1 py-2.5 text-[11px] font-bold uppercase tracking-wide transition-colors border-b-2 -mb-[2px]",
                      selectedDay === d
                        ? "text-primary border-primary"
                        : d === diaActual
                        ? "text-primary/60 border-transparent"
                        : "text-muted-foreground border-transparent"
                    )}>
                    {d.slice(0, 3)}
                  </button>
                ))}
              </div>
              <div className="min-h-[120px] p-3 flex flex-col gap-2">
                {getClasesDelDia(selectedDay).map(c => (
                  <div key={c.uid} className="rounded-[12px] p-3 text-white text-[12px]" style={{ background: c.color }}>
                    <div className="font-bold">{c.resumen}</div>
                    <div className="opacity-90 mt-0.5">{c.horaInicio} – {c.horaFin}</div>
                  </div>
                ))}
                {getClasesDelDia(selectedDay).length === 0 && (
                  <div className="flex flex-1 items-center justify-center text-[12px] text-muted-foreground py-6">
                    Sin clases este día
                  </div>
                )}
              </div>
            </div>
            {/* Vista desktop: grid de 5 columnas */}
            <div className="hidden sm:block">
            <div className="overflow-x-auto">
            <div className="min-w-[760px]">
            <div className="grid grid-cols-5 bg-background">
              {DIAS_HABILES.map(d => (
                <div key={d} className={cn("px-3 py-2.5 text-center text-xs font-bold uppercase tracking-wide border-r border-border last:border-r-0",
                  d === diaActual ? "text-primary" : "text-muted-foreground")}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-5 min-h-[300px]">
              {DIAS_HABILES.map(dia => {
                const bloques = getClasesDelDia(dia)
                return (
                  <div key={dia} className="border-r border-border last:border-r-0 p-2.5 flex flex-col gap-2">
                    {bloques.map(c => (
                      <div key={c.uid} className="rounded-lg p-2.5 text-white text-[11px]" style={{ background: c.color }}>
                        <div className="font-bold mb-0.5">{c.resumen}</div>
                        <div className="opacity-90">{c.horaInicio} – {c.horaFin}</div>
                      </div>
                    ))}
                    {bloques.length === 0 && <div className="flex-1 flex items-center justify-center text-[11px] text-[#d0d3df]">–</div>}
                  </div>
                )
              })}
            </div>
            </div>
            </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {!esDiaLaboral && (
              <div className="rounded-[14px] border border-border bg-card p-6 text-center text-[13px] text-muted-foreground">
                No hay clases este día. Usa las flechas para navegar.
              </div>
            )}
            {clasesHoy.map((cls, i) => (
              <div key={cls.uid}
                className="flex flex-col items-start gap-4 rounded-[14px] border border-border bg-card p-4 px-5 transition-all hover:-translate-y-px hover:shadow-[0_2px_14px_rgba(0,0,0,0.06)] animate-fade-up sm:flex-row sm:items-center"
                style={{ animationDelay: `${0.05*(i+1)}s` }}>
                <button onClick={() => toggleClase(cls.uid)}
                  className={cn("grid h-7 w-7 flex-shrink-0 place-items-center rounded-full border-2 transition-colors",
                    cls.completada ? "border-green-500 bg-green-50 text-green-600" : "border-border text-transparent hover:border-primary")}>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                </button>
                <div className="h-11 w-1 flex-shrink-0 rounded" style={{ backgroundColor: cls.color }} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold">{cls.resumen}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3" />{formattedDate}
                  </div>
                </div>
                <div className="flex-shrink-0 rounded-md bg-background px-2 py-1 text-[11px] font-semibold text-muted-foreground">
                  {cls.horaInicio} – {cls.horaFin}
                </div>
                <button onClick={() => abrirModal(cls)}
                  className="flex flex-shrink-0 items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-all hover:bg-pink-dark">
                  Ver <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Columna lateral ── */}
      <div className="w-full flex-shrink-0 xl:w-[280px]">
        <div className="mb-4 grid gap-3 animate-fade-up">
          {stats.map(stat => (
            <div key={stat.label} className="rounded-[14px] border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold text-muted-foreground">{stat.label}</span>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: stat.fg }} />
              </div>
              <div className="text-[24px] font-extrabold" style={{ color: stat.fg }}>{stat.value}</div>
            </div>
          ))}
        </div>
        <div className="rounded-[14px] border border-border bg-card p-5 animate-fade-up">
          <h3 className="text-[14px] font-extrabold mb-3">Agenda rápida</h3>
          <div className="space-y-3 text-[13px] text-muted-foreground">
            <div>• Revisa la planificación anual antes de editar una unidad.</div>
            <div>• Usa libro de clases para trazabilidad de asistencia y leccionario.</div>
            <div>• Consulta Perfil 360 para consolidar rendimiento y asistencia.</div>
          </div>
        </div>
      </div>

      {/* ── Modal Ver Clase ── */}
      {modalClase && (
        <div className="fixed inset-0 z-[600] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setModalClase(null)}>
          <div className="bg-card rounded-[18px] shadow-2xl w-full max-w-[860px] max-h-[90vh] flex flex-col"
            onClick={e => e.stopPropagation()}>

            {/* Header modal */}
            <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: modalClase.color }} />
                  <h2 className="text-[15px] font-extrabold leading-tight">
                    {modalClase.resumen} — {DAYS[currentDate.getDay()]} {currentDate.getDate()} {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
                  </h2>
                </div>
                <p className="text-[12px] text-muted-foreground">{modalClase.horaInicio} – {modalClase.horaFin}</p>
              </div>
              <button onClick={() => setModalClase(null)}
                className="w-7 h-7 rounded-full bg-background grid place-items-center text-muted-foreground hover:bg-border transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-border flex-shrink-0 overflow-x-auto">
              {MODAL_TABS.map(tab => {
                const Icon = tab.icon
                return (
                  <button key={tab.key} onClick={() => setModalTab(tab.key)}
                    className={cn("flex items-center gap-1.5 px-5 py-3 text-[12px] font-semibold border-b-2 -mb-[1px] transition-colors whitespace-nowrap",
                      modalTab === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
                    <Icon className="w-3.5 h-3.5" />{tab.label}
                  </button>
                )
              })}
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {/* Error banner de saves */}
              {saveError && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-600">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {saveError}
                  <button onClick={() => setSaveError(null)} className="ml-auto text-red-400 hover:text-red-600" aria-label="Cerrar error">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {loadingModal ? (
                <div className="flex items-center gap-3 text-muted-foreground py-8 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin" /><span>Cargando…</span>
                </div>

              ) : modalLoadError ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <AlertCircle className="w-10 h-10 text-red-400" />
                  <p className="text-[14px] font-bold text-foreground">No se pudo cargar la clase</p>
                  <p className="text-[12px] text-muted-foreground">Revisa tu conexión e intenta abrirla nuevamente.</p>
                  <button onClick={() => { setModalLoadError(false); abrirModal(modalClase!) }}
                    className="mt-2 rounded-[10px] bg-primary px-5 py-2 text-[13px] font-bold text-white hover:bg-pink-dark transition-colors">
                    Reintentar
                  </button>
                </div>

              ) : modalTab === "clase" ? (
                /* ── Tab Clase ── */
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_210px]">
                  <div>
                    {actividadModal ? (
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Objetivo de clase</p>
                          <p className="text-[13px] leading-relaxed">{actividadModal.objetivo || "Sin objetivo definido."}</p>
                        </div>
                        {actividadModal.inicio && (
                          <div>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Inicio</p>
                            <p className="text-[13px] leading-relaxed">{actividadModal.inicio}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Desarrollo</p>
                          <p className="text-[13px] leading-relaxed">{actividadModal.desarrollo || "Sin desarrollo planificado."}</p>
                        </div>
                        {actividadModal.cierre && (
                          <div>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1">Cierre</p>
                            <p className="text-[13px] leading-relaxed">{actividadModal.cierre}</p>
                          </div>
                        )}
                        {actividadModal.materiales && actividadModal.materiales.length > 0 && (
                          <div>
                            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Materiales</p>
                            <div className="flex flex-wrap gap-1.5">
                              {actividadModal.materiales.map((m, i) => (
                                <span key={i} className="bg-amber-50 border border-amber-200 text-amber-800 text-[11px] px-2 py-0.5 rounded-full">{m}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-4 py-8 text-muted-foreground">
                        <BookOpen className="w-10 h-10" />
                        <p className="text-[13px]">Esta clase aún no tiene actividad planificada.</p>
                        <a href={buildUrl("/actividades", withAsignatura({ curso: modalClase.resumen, unidad: unidadModal, clase: String(claseNumeroModal) }, ASIGNATURA))}
                          className="flex items-center gap-1.5 bg-primary text-white text-[12px] font-bold rounded-full px-5 py-2.5 hover:bg-pink-dark transition-colors">
                          Planificar ahora <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2">OA de la clase</p>
                    {actividadModal?.oaIds && actividadModal.oaIds.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {actividadModal.oaIds.map((oaId, i) => (
                          <div key={oaId} className="flex items-center gap-2 bg-background rounded-lg px-3 py-2">
                            <div className="w-2 h-2 rounded-full" style={{ background: ["#F59E0B","#3B82F6","#EF4444","#22C55E"][i%4] }} />
                            <span className="text-[12px] font-semibold">{oaId.startsWith("oa_") ? "OA " + oaId.replace("oa_","") : oaId.replace("OA","OA ")}</span>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-[12px] text-muted-foreground">Sin OA asignados.</p>}
                  </div>
                </div>

              ) : modalTab === "leccionario" ? (
                /* ── Tab Leccionario ── */
                <div>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold">Registro del leccionario para esta clase</p>
                    <button onClick={guardarLibro} disabled={savingLibro}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-primary px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-pink-dark disabled:opacity-60 sm:w-auto">
                      {savingLibro ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Guardar
                    </button>
                  </div>
                  {bloquesLibro.map((bloque, bi) => (
                    <div key={bloque.id} className="bg-background border border-border rounded-[12px] p-4 mb-3">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase mb-3">{bloque.bloque} · {bloque.horaInicio}–{bloque.horaFin}</p>
                      <div className="mb-3">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Objetivo</label>
                        <textarea value={bloque.objetivo} onChange={e => setBloquesLibro(prev => prev.map((b,i) => i===bi ? {...b, objetivo: e.target.value} : b))}
                          rows={2} className="w-full border border-border rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-primary resize-none" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 block">Actividad realizada</label>
                        <textarea value={bloque.actividad} onChange={e => setBloquesLibro(prev => prev.map((b,i) => i===bi ? {...b, actividad: e.target.value} : b))}
                          rows={3} className="w-full border border-border rounded-[8px] px-3 py-2 text-[12px] outline-none focus:border-primary resize-none" />
                      </div>
                    </div>
                  ))}
                  {actividadModal?.desarrollo && (
                    <button onClick={() => setBloquesLibro(prev => prev.map((b,i) => i===0 ? {...b, actividad: actividadModal?.desarrollo || ""} : b))}
                      className="text-[12px] font-semibold text-primary hover:opacity-70 flex items-center gap-1.5 mt-2">
                      ↻ Traer desde planificación
                    </button>
                  )}
                </div>

              ) : modalTab === "asistencia" ? (
                /* ── Tab Asistencia ── */
                <div>
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px] font-semibold">Asistencia — {formattedDate}</p>
                    <button onClick={guardarLibro} disabled={savingLibro}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-primary px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-pink-dark disabled:opacity-60 sm:w-auto">
                      {savingLibro ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Guardar
                    </button>
                  </div>
                  {bloquesLibro.map((bloque, bi) => (
                    <div key={bloque.id} className="mb-4">
                      <p className="text-[11px] font-bold text-muted-foreground uppercase mb-2">{bloque.bloque}</p>
                      {bloque.asistencia.length === 0 ? (
                        <div className="bg-background border border-border rounded-[10px] p-4 text-center text-[13px] text-muted-foreground">
                          <p className="mb-2">Sin estudiantes registrados.</p>
                          <Link href="/libro-clases" className="text-primary font-semibold hover:opacity-70 text-[12px]">
                            Ir al Libro de Clases para agregar →
                          </Link>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5">
                          {/* Resumen */}
                          <div className="mb-2 flex flex-wrap gap-2 text-[11px]">
                            {ESTADOS_ASISTENCIA.map(e => {
                              const count = bloque.asistencia.filter(a => a.estado === e.key).length
                              return count > 0 ? (
                                <span key={e.key} className={cn("px-2 py-0.5 rounded-full font-semibold", e.cls)}>
                                  {e.label}: {count}
                                </span>
                              ) : null
                            })}
                          </div>
                          {bloque.asistencia.map(estudiante => {
                            const est = ESTADOS_ASISTENCIA.find(e => e.key === estudiante.estado) || ESTADOS_ASISTENCIA[0]
                            return (
                              <div key={estudiante.id} className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-2">
                                <span className="text-[13px]">{estudiante.nombre}</span>
                                <button
                                  onClick={() => toggleAsistencia(bloque.id, estudiante.id)}
                                  className={cn("w-8 h-8 rounded-lg text-[11px] font-bold transition-colors", est.cls)}>
                                  {est.label}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

              ) : modalTab === "firma" ? (
                /* ── Tab Firma ── */
                <div className="flex flex-col items-center gap-6 py-8">
                  {firmado ? (
                    <>
                      <div className="w-16 h-16 rounded-full bg-green-50 grid place-items-center">
                        <Check className="w-8 h-8 text-green-600" />
                      </div>
                      <div className="text-center">
                        <p className="text-[15px] font-bold text-green-600 mb-1">Clase firmada</p>
                        <p className="text-[13px] text-muted-foreground">
                          {user?.displayName ?? "Docente"} · {formattedDate}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <PenLine className="w-12 h-12 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-[15px] font-bold mb-1">Firmar clase</p>
                        <p className="text-[13px] text-muted-foreground mb-6">
                          Al firmar confirmas que esta clase fue realizada y queda registrada en el libro.
                        </p>
                      </div>
                      <button onClick={firmar}
                        className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-8 py-3 text-[14px] font-bold text-white transition-colors hover:bg-pink-dark sm:w-auto">
                        <PenLine className="w-4 h-4" /> Firmar clase
                      </button>
                    </>
                  )}
                </div>

              ) : (
                /* ── Tab Anotaciones ── */
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-[13px] text-muted-foreground">Notas personales sobre esta clase. Solo visibles para ti.</p>
                    <button
                      onClick={handleGuardarAnotacion}
                      disabled={savingAnotacion}
                      className="flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-primary px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-pink-dark disabled:opacity-60 sm:w-auto"
                    >
                      {savingAnotacion
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</>
                        : anotacionGuardada
                          ? <><Check className="w-3.5 h-3.5" /> Guardado</>
                          : <><Check className="w-3.5 h-3.5" /> Guardar</>
                      }
                    </button>
                  </div>
                  <textarea
                    value={anotaciones}
                    onChange={e => setAnotaciones(e.target.value)}
                    placeholder="Escribe tus anotaciones aquí…"
                    rows={8}
                    className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary resize-none"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
