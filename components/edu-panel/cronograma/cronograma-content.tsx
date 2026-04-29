"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Download, Plus, Calendar,
  Clock, Filter, LayoutGrid, List, Loader2, Check,
  X, Bookmark, ArrowRight, BookOpen, Zap,
  ChevronDown, FileText, CalendarDays
} from "lucide-react"
import { cn } from "@/lib/utils"
import { guardarCronograma, cargarCronograma, cargarPlanCurso } from "@/lib/curriculo"
import type { ActividadCronograma } from "@/lib/curriculo"
import { buildUrl, UNIT_COLORS, withAsignatura, normalizeKeyPart } from "@/lib/shared"
import { cargarHorarioSemanal, ClaseHorario } from "@/lib/horario"
import { useIsMobile } from "@/components/ui/use-mobile"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { useAutosave } from "@/hooks/use-autosave"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem
} from "@/components/ui/dropdown-menu"
import {
  getGoogleCalendarToken,
  isGoogleCalendarAutosyncEnabled,
  isGoogleCalendarConnected,
  sincronizarActividadesGoogle,
} from "@/lib/google-calendar"

// ─── Constantes ───────────────────────────────────────────────────────────────
const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
const DIAS_MES = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DIAS_MAP: Record<string, number> = { Lunes:1, Martes:2, "Miércoles":3, Jueves:4, Viernes:5 }
const DIAS_BY_INDEX: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes" }
type ViewMode = "mes" | "semana" | "dia" | "list"

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

// Lunes de la semana a la que pertenece una fecha
function getLunes(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() // 0=Dom, 1=Lun...
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Fecha real del día de la semana en una semana dada por su lunes
function getFechaReal(lunes: Date, diaNombre: string): Date {
  const offset = DIAS_MAP[diaNombre] - 1
  const d = new Date(lunes)
  d.setDate(d.getDate() + offset)
  return d
}

function formatFecha(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]}`
}

function esMismoDia(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function semanaLabel(lunes: Date): string {
  const viernes = new Date(lunes); viernes.setDate(viernes.getDate() + 4)
  return `${lunes.getDate()} – ${viernes.getDate()} ${MESES[viernes.getMonth()]}`
}

// Número de semana del año
function weekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
}

// Lunes de la semana N del año (inverso de weekNumber)
function getLunesDeSemana(weekNum: number, year: number): Date {
  const onejan = new Date(year, 0, 1)
  const offsetDays = (weekNum - 1) * 7 - onejan.getDay() + 1
  const d = new Date(year, 0, 1 + offsetDays)
  return getLunes(d)
}

// Parsea "45 min" / "1 h" / "1.5 h" → minutos
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

// ─── Helpers de exportación ───────────────────────────────────────────────────

function pad(n: number): string { return n < 10 ? `0${n}` : `${n}` }

function fechaICS(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
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
      `SUMMARY:${escapeICS(`${act.tipo}: ${act.nombre}`)}`,
      `DESCRIPTION:${escapeICS(`EduPanel · ${asignatura}${cursoLabel}\nUnidad: ${act.unidad}`)}`,
      `CATEGORIES:${escapeICS(act.unidad)}`,
      "END:VEVENT",
    )
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}

function actividadesToCSV(actividades: ActividadCronograma[], year: number): string {
  const headers = ["Semana", "Curso", "Día", "Fecha", "Hora", "Duración", "Tipo", "Unidad", "Actividad"]
  const rows: string[][] = [headers]
  const sorted = [...actividades].sort((a, b) =>
    (a.semana - b.semana) || (DIAS_MAP[a.dia] || 0) - (DIAS_MAP[b.dia] || 0) || a.hora.localeCompare(b.hora)
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
      act.unidad,
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

// ─── Componente principal ─────────────────────────────────────────────────────
function CronogramaInner() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const searchParams   = useSearchParams()
  const cursoParam     = searchParams.get("curso")
  const isMobile       = useIsMobile()

  const hoy            = new Date()
  const [lunesActual, setLunesActual] = useState<Date>(getLunes(hoy))
  const [cursoFiltro, setCursoFiltro] = useState(cursoParam || "")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [unidadFiltro, setUnidadFiltro] = useState<string>("todas")
  const [viewMode, setViewMode]       = useState<ViewMode>("semana")
  const [diaSeleccionado, setDiaSeleccionado] = useState<Date>(hoy)
  const [actividades, setActividades] = useState<ActividadCronograma[]>([])
  const [unidadesCurso, setUnidadesCurso] = useState<string[]>([])
  const [horarioBase, setHorarioBase] = useState<ClaseHorario[]>([])
  const [loading, setLoading]         = useState(true)
  const [showModal, setShowModal]     = useState(false)
  const [showHoyDrawer, setShowHoyDrawer] = useState(false)
  const [calendarSyncMessage, setCalendarSyncMessage] = useState<string | null>(null)
  const ultimoGuardadoRef = useRef<ActividadCronograma[]>([])
  const skipNextGoogleSyncRef = useRef(false)
  const [nuevaAct, setNuevaAct]       = useState({
    nombre: "", tipo: "clase" as "clase"|"actividad"|"evaluacion",
    dia: "Lunes", hora: "08:30", duracion: "45 min", unidad: "Unidad 1", color: UNIT_COLORS[0]
  })

  // Calcular semana actual
  const mesLabel = `${MESES[lunesActual.getMonth()]} ${lunesActual.getFullYear()}`
  const esSemanActual = weekNumber(lunesActual) === weekNumber(getLunes(hoy))

  // ─── Cargar cursos iniciales ──────────────────────────────────────────────────
  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      setHorarioBase(hData || [])
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      // Sin cursoParam: arrancamos en modo "Todos los cursos" (cursoFiltro = "")
    })
  }, [cursoParam])

  // Mapa cursoOrigen → color, estable en orden de cursosDisponibles
  const colorPorCurso = (curso?: string) => {
    if (!curso) return UNIT_COLORS[0]
    const idx = cursosDisponibles.indexOf(curso)
    return UNIT_COLORS[(idx >= 0 ? idx : 0) % UNIT_COLORS.length]
  }

  const modoTodos = !cursoFiltro

  // ─── Cargar datos ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    if (cursoFiltro) {
      // Modo curso específico
      Promise.all([
        cargarCronograma(ASIGNATURA, cursoFiltro),
        cargarPlanCurso(ASIGNATURA, cursoFiltro),
      ]).then(([crono, plan]) => {
        const acts = crono?.actividades || []
        setActividades(acts)
        ultimoGuardadoRef.current = acts
        if (plan?.units && plan.units.length > 0) {
          setUnidadesCurso(plan.units.map(u => u.name))
          setNuevaAct(p => ({ ...p, unidad: plan.units[0].name, color: plan.units[0].color || UNIT_COLORS[0] }))
        } else {
          setUnidadesCurso(["Unidad 1", "Unidad 2"])
        }
      }).catch(console.error)
      .finally(() => setLoading(false))
    } else if (cursosDisponibles.length > 0) {
      // Modo "Todos los cursos": carga en paralelo y unifica con cursoOrigen
      Promise.all(cursosDisponibles.map(c => cargarCronograma(ASIGNATURA, c)))
        .then(cronoArray => {
          const unificadas: ActividadCronograma[] = []
          cronoArray.forEach((crono, idx) => {
            const c = cursosDisponibles[idx]
            if (crono?.actividades) {
              for (const act of crono.actividades) {
                unificadas.push({ ...act, cursoOrigen: c })
              }
            }
          })
          setActividades(unificadas)
          ultimoGuardadoRef.current = []
          setUnidadesCurso([])
        })
        .catch(console.error)
        .finally(() => setLoading(false))
    } else {
      setActividades([])
      ultimoGuardadoRef.current = []
      setLoading(false)
    }
  }, [cursoFiltro, ASIGNATURA, cursosDisponibles])

  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem("cronograma_vista") : null
    if (saved === "mes" || saved === "semana" || saved === "dia" || saved === "list") {
      setViewMode(saved)
      return
    }
    setViewMode(isMobile ? "list" : "semana")
  }, [isMobile])

  useEffect(() => {
    window.localStorage.setItem("cronograma_vista", viewMode)
  }, [viewMode])

  const navSemana = (dir: number) => {
    const d = new Date(lunesActual)
    d.setDate(d.getDate() + dir * 7)
    setLunesActual(d)
  }

  const irHoy = () => {
    setLunesActual(getLunes(hoy))
    setDiaSeleccionado(hoy)
  }

  // Quita campos volátiles antes de persistir (cursoOrigen es solo para vista "Todos")
  const limpiarParaPersistir = (acts: ActividadCronograma[]) =>
    acts.map(({ cursoOrigen, ...rest }) => rest)

  const guardarActual = async () => {
    if (!cursoFiltro) return
    const actuales = limpiarParaPersistir(actividades)
    await guardarCronograma(ASIGNATURA, cursoFiltro, actuales)

    if (skipNextGoogleSyncRef.current) {
      skipNextGoogleSyncRef.current = false
      ultimoGuardadoRef.current = actuales
      return
    }

    const token = getGoogleCalendarToken()
    if (!isGoogleCalendarConnected() || !isGoogleCalendarAutosyncEnabled() || !token) {
      ultimoGuardadoRef.current = actuales
      return
    }

    try {
      const sync = await sincronizarActividadesGoogle({
        accessToken: token,
        actividadesAntes: ultimoGuardadoRef.current,
        actividadesDespues: actuales,
        year: lunesActual.getFullYear(),
        asignatura: ASIGNATURA,
        curso: cursoFiltro,
      })
      const sincronizadas = limpiarParaPersistir(sync.actividades)
      ultimoGuardadoRef.current = sincronizadas
      if (sync.creados > 0) {
        skipNextGoogleSyncRef.current = true
        setActividades(sync.actividades)
        await guardarCronograma(ASIGNATURA, cursoFiltro, sincronizadas)
      }
      if (sync.creados || sync.actualizados || sync.eliminados) {
        setCalendarSyncMessage(`Google Calendar: ${sync.creados} nuevos, ${sync.actualizados} actualizados, ${sync.eliminados} eliminados.`)
        setTimeout(() => setCalendarSyncMessage(null), 5000)
      }
    } catch (error) {
      console.error(error)
      ultimoGuardadoRef.current = actuales
      setCalendarSyncMessage("Google Calendar no se sincronizo. Reconecta desde Mi Perfil.")
      setTimeout(() => setCalendarSyncMessage(null), 7000)
    }
  }

  // Auto-save con debounce 2.5s. Skip mientras carga, o en modo "Todos los cursos" (cursoFiltro vacío).
  const { saveStatus, setSaveStatus } = useAutosave(
    actividades,
    guardarActual,
    { debounceMs: 2500, skip: loading || !cursoFiltro }
  )

  const guardarManual = async () => {
    if (!cursoFiltro) return
    setSaveStatus("saving_silent")
    try {
      await guardarActual()
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 7000)
    }
  }

  const handleAgregarActividad = () => {
    if (!nuevaAct.nombre.trim()) return
    const fechaReal = getFechaReal(lunesActual, nuevaAct.dia)
    const act: ActividadCronograma = {
      id: `crono_${Date.now()}`,
      nombre: nuevaAct.nombre,
      tipo: nuevaAct.tipo,
      dia: nuevaAct.dia,
      semana: weekNumber(lunesActual),
      hora: nuevaAct.hora,
      duracion: nuevaAct.duracion,
      unidad: nuevaAct.unidad,
      color: unidadesCurso.indexOf(nuevaAct.unidad) >= 0
        ? UNIT_COLORS[unidadesCurso.indexOf(nuevaAct.unidad) % UNIT_COLORS.length]
        : UNIT_COLORS[0],
    }
    setActividades(prev => [...prev, act])
    setShowModal(false)
  }

  const eliminarActividad = (id: string) =>
    setActividades(prev => prev.filter(a => a.id !== id))

  // Filtrar por unidad
  const actFiltradas = actividades.filter(a =>
    unidadFiltro === "todas" || a.unidad === unidadFiltro
  )

  // Actividades de la semana actual visible
  const actSemanaActual = actFiltradas.filter(a => a.semana === weekNumber(lunesActual))

  const getActsParaCelda = (dia: string) =>
    actSemanaActual.filter(a => a.dia === dia)

  // Clases del horario del ICS para este día. En modo todos, devuelve todas las clases.
  const getClasesHorario = (dia: string) =>
    horarioBase.filter(c => {
      if (modoTodos) return c.dia === dia
      const match = c.resumen === cursoFiltro ||
        c.resumen.replace("°","").trim() === cursoFiltro.replace("°","").trim()
      return match && c.dia === dia
    })

  const fechaDeActividad = (act: ActividadCronograma) =>
    getFechaReal(getLunesDeSemana(act.semana, lunesActual.getFullYear()), act.dia)

  const actividadesEnFecha = (fecha: Date) =>
    actFiltradas.filter(act => esMismoDia(fechaDeActividad(act), fecha))
      .sort((a, b) => a.hora.localeCompare(b.hora))

  const bloquesHoy = () => {
    const dia = DIAS_BY_INDEX[hoy.getDay()]
    const actividades = actividadesEnFecha(hoy).map(act => ({
      id: act.id,
      curso: act.cursoOrigen || cursoFiltro,
      titulo: act.nombre,
      horaInicio: act.hora,
      horaFin: "",
      color: modoTodos ? colorPorCurso(act.cursoOrigen) : act.color,
      tipo: act.tipo,
      enCurso: false,
    }))
    const horario = dia ? getClasesHorario(dia).map(cls => {
      const ahora = hoy.getHours() * 60 + hoy.getMinutes()
      const inicio = minutesFromHHMM(cls.horaInicio)
      const fin = minutesFromHHMM(cls.horaFin)
      return {
        id: cls.uid,
        curso: cls.resumen,
        titulo: cls.tipo === "clase" ? "Clase" : cls.tipo,
        horaInicio: cls.horaInicio,
        horaFin: cls.horaFin,
        color: cls.color,
        tipo: cls.tipo,
        enCurso: ahora >= inicio && ahora <= fin,
      }
    }) : []
    return [...horario, ...actividades].sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
  }

  const diasDelMes = () => {
    const first = new Date(lunesActual.getFullYear(), lunesActual.getMonth(), 1)
    const start = getLunes(first)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }

  const cambiarActividadDia = (actId: string, fecha: Date, minutes: number) => {
    if (modoTodos) return
    const snapped = Math.max(7 * 60, Math.min(18 * 60 - 15, Math.round(minutes / 15) * 15))
    const dia = DIAS_BY_INDEX[fecha.getDay()]
    if (!dia) return
    setActividades(prev => prev.map(act => act.id === actId
      ? {
          ...act,
          semana: weekNumber(getLunes(fecha)),
          dia,
          hora: `${pad(Math.floor(snapped / 60))}:${pad(snapped % 60)}`,
        }
      : act
    ))
  }

  const handleDropDia = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    const actId = event.dataTransfer.getData("text/plain")
    if (!actId) return
    const rect = event.currentTarget.getBoundingClientRect()
    const y = event.clientY - rect.top
    const minutes = 7 * 60 + (y / rect.height) * (11 * 60)
    cambiarActividadDia(actId, diaSeleccionado, minutes)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[14px] font-medium">Cargando cronograma…</span>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1400px]">

      {/* Header */}
      <div className="mb-5 sm:mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link href={buildUrl("/planificaciones", withAsignatura({ curso: cursoFiltro }, ASIGNATURA))}
            className="w-8 h-8 border-[1.5px] border-border rounded-lg bg-card grid place-items-center text-muted-foreground hover:bg-background transition-colors flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-[18px] sm:text-[22px] font-extrabold truncate">Cronograma — {ASIGNATURA}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:gap-2.5 sm:w-auto sm:justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={actFiltradas.length === 0}
                className="hidden sm:flex items-center gap-[7px] border-[1.5px] border-border rounded-[10px] px-4 py-2.5 text-[13px] font-semibold bg-card hover:bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Download className="w-[15px] h-[15px] text-muted-foreground" /> Exportar
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() => {
                  const year = lunesActual.getFullYear()
                  const ics = actividadesToICS(actFiltradas, year, ASIGNATURA)
                  const sufijo = cursoFiltro ? cursoFiltro.replace(/\s+/g, "_") : "todos"
                  descargarArchivo(ics, `cronograma_${ASIGNATURA}_${sufijo}.ics`, "text/calendar")
                }}
              >
                <CalendarDays className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold">Calendario (.ics)</span>
                  <span className="text-[11px] text-muted-foreground">Importable a Google/iPhone</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const year = lunesActual.getFullYear()
                  const csv = actividadesToCSV(actFiltradas, year)
                  const sufijo = cursoFiltro ? cursoFiltro.replace(/\s+/g, "_") : "todos"
                  descargarArchivo(csv, `cronograma_${ASIGNATURA}_${sufijo}.csv`, "text/csv")
                }}
              >
                <FileText className="w-4 h-4" />
                <div className="flex flex-col">
                  <span className="text-[13px] font-semibold">Planilla (.csv)</span>
                  <span className="text-[11px] text-muted-foreground">Para padres / dirección</span>
                </div>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button onClick={() => setShowModal(true)} disabled={modoTodos}
            title={modoTodos ? "Selecciona un curso para agregar" : "Agregar clase"}
            className="flex items-center gap-[7px] border-[1.5px] border-border rounded-[10px] px-3 sm:px-4 py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-semibold bg-card hover:bg-background transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Plus className="w-[15px] h-[15px] text-muted-foreground" />
            <span className="hidden sm:inline">Agregar clase</span>
            <span className="sm:hidden">Agregar</span>
          </button>
          {saveStatus === "saving_silent" && <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Guardando…</span>}
          {saveStatus === "saved" && <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green-600"><Check className="w-4 h-4" /> Guardado</span>}
          {saveStatus === "error" && <span className="text-[13px] font-semibold text-red-500">Error al guardar</span>}
          {calendarSyncMessage && <span className="max-w-[220px] truncate text-[12px] font-semibold text-muted-foreground">{calendarSyncMessage}</span>}
          <button onClick={guardarManual} disabled={saveStatus === "saving_silent" || !cursoFiltro}
            title={!cursoFiltro ? "Selecciona un curso para guardar" : "Guardar ahora"}
            className="flex items-center gap-[7px] bg-primary text-primary-foreground border-none rounded-[10px] px-3 sm:px-[18px] py-2 sm:py-2.5 text-[12px] sm:text-[13px] font-bold hover:bg-pink-dark transition-colors disabled:opacity-60">
            {saveStatus === "saving_silent" ? <><Loader2 className="w-[15px] h-[15px] animate-spin" /> Guardando…</> : <><Bookmark className="w-[15px] h-[15px]" /> Guardar</>}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-5 rounded-[14px] border border-border bg-card px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-4 sm:gap-6">

          {/* Filtro por curso */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Curso</span>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setCursoFiltro("")}
                className={cn(
                  "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5",
                  modoTodos ? "bg-foreground text-background" : "bg-background border border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutGrid className="w-3 h-3" /> Todos los cursos
              </button>
              {cursosDisponibles.map((c, i) => {
                const tieneClase = horarioBase.some(h =>
                  h.resumen === c || h.resumen.replace("°","").trim() === c.replace("°","").trim()
                )
                return (
                  <button key={c} onClick={() => setCursoFiltro(c)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5",
                      cursoFiltro === c
                        ? "text-white" : "bg-background border border-border text-muted-foreground hover:text-foreground"
                    )}
                    style={cursoFiltro === c ? { backgroundColor: UNIT_COLORS[i % UNIT_COLORS.length] } : {}}
                  >
                    {c}
                    {tieneClase && cursoFiltro !== c && <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="hidden h-10 w-px bg-border lg:block" />

          {/* Filtro por unidad */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Unidad</span>
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setUnidadFiltro("todas")}
                className={cn("px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                  unidadFiltro === "todas" ? "bg-foreground text-background" : "bg-background border border-border text-muted-foreground hover:text-foreground"
                )}>Todas</button>
              {unidadesCurso.map((u, i) => (
                <button key={u} onClick={() => setUnidadFiltro(u)}
                  className={cn("px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5",
                    unidadFiltro === u ? "text-white" : "bg-background border border-border text-muted-foreground hover:text-foreground"
                  )}
                  style={unidadFiltro === u ? { backgroundColor: UNIT_COLORS[i % UNIT_COLORS.length] } : {}}
                >
                  <div className="w-2 h-2 rounded-full" style={{ background: UNIT_COLORS[i % UNIT_COLORS.length] }} />
                  {u}
                </button>
              ))}
            </div>
          </div>

          {/* Vista */}
          <div className="flex rounded-lg border border-border bg-background p-1 lg:ml-auto">
            <button onClick={() => setViewMode("mes")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors",
                viewMode === "mes" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <CalendarDays className="w-3.5 h-3.5" /> Mes
            </button>
            <button onClick={() => setViewMode("semana")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors",
                viewMode === "semana" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <LayoutGrid className="w-3.5 h-3.5" /> Semana
            </button>
            <button onClick={() => { setViewMode("dia"); setDiaSeleccionado(hoy) }}
              className={cn("px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors",
                viewMode === "dia" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <Clock className="w-3.5 h-3.5" /> Dia
            </button>
            <button onClick={() => setViewMode("list")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors",
                viewMode === "list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <List className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* Navegación de semana */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2 bg-card border border-border rounded-xl px-4 py-2.5">
          <button onClick={() => navSemana(-1)} className="w-6 h-6 rounded-md hover:bg-background grid place-items-center transition-colors">
            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          </button>
          <span className="text-sm font-bold min-w-[150px] text-center">{mesLabel}</span>
          <button onClick={() => navSemana(1)} className="w-6 h-6 rounded-md hover:bg-background grid place-items-center transition-colors">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <span className="text-[13px] text-muted-foreground font-medium">{semanaLabel(lunesActual)}</span>
        <button onClick={() => { irHoy(); setShowHoyDrawer(true) }}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-primary border border-primary rounded-full px-3 py-1.5 hover:bg-pink-light transition-colors">
          <Zap className="w-3 h-3" /> Hoy
        </button>
        {esSemanActual && (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
            <Check className="w-3 h-3" /> Semana actual
          </span>
        )}
      </div>

      {viewMode === "semana" ? (
        <div className="scroll-hint-x rounded-[14px]">
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="overflow-x-auto">
            <div className="min-w-[900px]">

          {/* Encabezado días con fecha real */}
          <div className="grid grid-cols-5 bg-background border-b border-border">
            {DIAS_SEMANA.map(dia => {
              const fechaReal = getFechaReal(lunesActual, dia)
              const esHoy = esMismoDia(fechaReal, hoy)
              const clasesHorario = getClasesHorario(dia)
              return (
                <div key={dia} className={cn(
                  "px-4 py-3 text-center border-r border-border last:border-r-0",
                  esHoy && "bg-pink-light/30"
                )}>
                  <div className={cn("text-xs font-bold uppercase tracking-wide", esHoy ? "text-primary" : "text-muted-foreground")}>
                    {dia}
                  </div>
                  <div className={cn("text-[11px] mt-0.5 font-semibold", esHoy ? "text-primary" : "text-muted-foreground")}>
                    {formatFecha(fechaReal)}
                  </div>
                  {/* Indicador de clases del horario ICS */}
                  {clasesHorario.length > 0 && (
                    <div className="flex justify-center mt-1.5 gap-1">
                      {clasesHorario.map(c => (
                        <div key={c.uid} title={`${c.resumen} ${c.horaInicio}`}
                          className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Grilla */}
          <div className="grid grid-cols-5 min-h-[480px]">
            {DIAS_SEMANA.map(dia => {
              const fechaReal   = getFechaReal(lunesActual, dia)
              const esHoy       = esMismoDia(fechaReal, hoy)
              const actsDelDia  = getActsParaCelda(dia)
              const clasesICS   = getClasesHorario(dia)

              return (
                <div key={dia} className={cn(
                  "border-r border-border last:border-r-0 p-2.5 flex flex-col gap-2",
                  esHoy && "bg-pink-light/10"
                )}>
                  {/* Clases del horario ICS (fondo sutil) */}
                  {clasesICS.map(c => (
                    <div key={c.uid}
                      className="rounded-lg p-2 border-l-[3px] bg-background"
                      style={{ borderLeftColor: c.color }}>
                      <div className="text-[10px] font-bold uppercase mb-0.5" style={{ color: c.color }}>
                        {c.tipo === "clase" ? "Clase" : c.tipo}
                      </div>
                      <div className="text-[11px] font-semibold text-foreground leading-snug">{c.resumen}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{c.horaInicio} – {c.horaFin}</div>
                    </div>
                  ))}

                  {/* Actividades planificadas */}
                  {actsDelDia.map(act => (
                    <div key={act.id}
                      className="rounded-lg p-2.5 text-white cursor-pointer hover:opacity-90 transition-opacity group relative"
                      style={{ backgroundColor: modoTodos ? colorPorCurso(act.cursoOrigen) : act.color }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] font-bold uppercase">{act.tipo}</div>
                        {modoTodos && act.cursoOrigen && (
                          <div className="text-[9px] font-bold uppercase opacity-90 px-1.5 rounded bg-white/20">{act.cursoOrigen}</div>
                        )}
                      </div>
                      <div className="text-[11px] font-semibold leading-snug mb-1.5">{act.nombre}</div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] opacity-90">
                          <Clock className="w-2.5 h-2.5" />{act.hora}
                        </div>
                        {/* Botón ir a clase */}
                        <Link
                          href={buildUrl("/ver-unidad", withAsignatura({
                            curso: act.cursoOrigen || cursoFiltro,
                            unidad: act.unidad ? normalizeKeyPart(act.unidad) : "unidad_1"
                          }, ASIGNATURA))}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-white/20 transition-all hover:bg-white/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          Ver clase <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                      {!modoTodos && (
                        <button
                          onClick={e => { e.stopPropagation(); eliminarActividad(act.id) }}
                          className="absolute top-1.5 right-1.5 grid h-4 w-4 place-items-center rounded bg-white/20 transition-all hover:bg-white/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  ))}

                  {/* Celda vacía */}
                  {clasesICS.length === 0 && actsDelDia.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-[11px] text-[#d0d3df]">–</span>
                    </div>
                  )}

                  {/* Botón agregar rápido (solo en modo curso específico) */}
                  {!modoTodos && (
                    <button
                      onClick={() => { setNuevaAct(p => ({ ...p, dia })); setShowModal(true) }}
                      className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-primary opacity-100 sm:opacity-0 sm:hover:opacity-100 sm:group-hover:opacity-100"
                    >
                      <Plus className="w-3 h-3" /> Agregar
                    </button>
                  )}
                </div>
              )
            })}
          </div>
            </div>
          </div>
        </div>
        </div>
      ) : viewMode === "mes" ? (
        <div className="overflow-hidden rounded-[14px] border border-border bg-card">
          <div className="grid grid-cols-7 border-b border-border bg-background">
            {DIAS_MES.map((dia) => (
              <div key={dia} className="px-3 py-2 text-center text-[11px] font-bold uppercase text-muted-foreground">
                {dia}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {diasDelMes().map((fecha) => {
              const acts = actividadesEnFecha(fecha)
              const fueraMes = fecha.getMonth() !== lunesActual.getMonth()
              const visible = acts.slice(0, 3)
              return (
                <button
                  key={dateKey(fecha)}
                  onClick={() => {
                    setDiaSeleccionado(fecha)
                    setLunesActual(getLunes(fecha))
                    setViewMode("dia")
                  }}
                  className={cn(
                    "min-h-[116px] border-r border-b border-border p-2 text-left transition-colors hover:bg-background",
                    fueraMes && "bg-muted/20 text-muted-foreground",
                    esMismoDia(fecha, hoy) && "bg-pink-light/20"
                  )}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className={cn("text-[12px] font-bold", esMismoDia(fecha, hoy) && "text-primary")}>{fecha.getDate()}</span>
                    {acts.length > 3 && <span className="text-[10px] font-bold text-primary">+{acts.length - 3}</span>}
                  </div>
                  <div className="space-y-1">
                    {visible.map((act) => (
                      <div key={act.id} className="truncate rounded px-1.5 py-1 text-[10px] font-bold text-white"
                        style={{ background: modoTodos ? colorPorCurso(act.cursoOrigen) : act.color }}>
                        {act.hora} {act.nombre}
                      </div>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      ) : viewMode === "dia" ? (
        <div className="rounded-[14px] border border-border bg-card p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[16px] font-extrabold">{diaSeleccionado.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</h2>
              <p className="text-[12px] text-muted-foreground">Arrastra bloques para reajustar hora en saltos de 15 minutos.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { const d = new Date(diaSeleccionado); d.setDate(d.getDate() - 1); setDiaSeleccionado(d); setLunesActual(getLunes(d)) }} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold hover:bg-background">Anterior</button>
              <button onClick={() => { const d = new Date(diaSeleccionado); d.setDate(d.getDate() + 1); setDiaSeleccionado(d); setLunesActual(getLunes(d)) }} className="rounded-lg border border-border px-3 py-1.5 text-[12px] font-semibold hover:bg-background">Siguiente</button>
            </div>
          </div>
          <div
            className="relative min-h-[660px] rounded-[12px] border border-border bg-background"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDropDia}
          >
            {Array.from({ length: 12 }, (_, i) => 7 + i).map((hour) => (
              <div key={hour} className="absolute left-0 right-0 border-t border-border/80" style={{ top: `${((hour - 7) / 11) * 100}%` }}>
                <span className="absolute -top-2 left-3 bg-background px-1 text-[10px] font-semibold text-muted-foreground">{pad(hour)}:00</span>
              </div>
            ))}
            {actividadesEnFecha(diaSeleccionado).map((act) => {
              const minutes = minutesFromHHMM(act.hora || "08:30")
              const top = ((minutes - 7 * 60) / (11 * 60)) * 100
              const height = Math.max(38, (parseDuracion(act.duracion) / (11 * 60)) * 660)
              return (
                <div
                  key={act.id}
                  draggable={!modoTodos}
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", act.id)}
                  className={cn("absolute left-[76px] right-3 rounded-lg p-3 text-white shadow-sm", !modoTodos && "cursor-grab active:cursor-grabbing")}
                  style={{ top: `${Math.max(0, Math.min(94, top))}%`, height, background: modoTodos ? colorPorCurso(act.cursoOrigen) : act.color }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-extrabold">{act.nombre}</span>
                    <span className="text-[10px] font-bold opacity-90">{act.hora}</span>
                  </div>
                  <div className="mt-1 text-[10px] font-semibold opacity-85">{act.tipo} · {act.cursoOrigen || cursoFiltro}</div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* Vista lista */
        <div className="scroll-hint-x rounded-[14px]">
        <div className="overflow-x-auto rounded-[14px] border border-border bg-card">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="bg-background">
                {(modoTodos
                  ? ["Actividad","Curso","Tipo","Unidad","Día","Fecha","Hora","Duración",""]
                  : ["Actividad","Tipo","Unidad","Día","Fecha","Hora","Duración",""]
                ).map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actFiltradas.length === 0 ? (
                <tr><td colSpan={modoTodos ? 9 : 8} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <BookOpen className="w-8 h-8" />
                    <p className="text-[13px]">
                      {modoTodos
                        ? "Sin actividades planificadas en ningún curso. Selecciona un curso para empezar."
                        : `Sin actividades planificadas para ${cursoFiltro}.`}
                    </p>
                    {!modoTodos && (
                      <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-primary text-white text-[12px] font-bold px-4 py-2 rounded-full hover:bg-pink-dark transition-colors">
                        <Plus className="w-3.5 h-3.5" /> Agregar primera clase
                      </button>
                    )}
                  </div>
                </td></tr>
              ) : (
                actFiltradas
                  .sort((a, b) => (a.semana - b.semana) || (DIAS_MAP[a.dia] || 0) - (DIAS_MAP[b.dia] || 0))
                  .map(act => {
                    const semLunes = new Date(hoy.getFullYear(), 0, 1 + (act.semana - 1) * 7)
                    const fechaAct = getFechaReal(getLunes(semLunes), act.dia)
                    return (
                      <tr key={act.id} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                              style={{ background: modoTodos ? colorPorCurso(act.cursoOrigen) : act.color }} />
                            <span className="text-[13px] font-semibold">{act.nombre}</span>
                          </div>
                        </td>
                        {modoTodos && (
                          <td className="px-4 py-3.5">
                            <span className="text-[11px] font-bold uppercase px-2 py-1 rounded text-white"
                              style={{ background: colorPorCurso(act.cursoOrigen) }}>
                              {act.cursoOrigen}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3.5">
                          <span className={cn("px-2.5 py-1 rounded text-[11px] font-bold uppercase",
                            act.tipo === "clase" && "bg-blue-100 text-blue-700",
                            act.tipo === "actividad" && "bg-purple-100 text-purple-700",
                            act.tipo === "evaluacion" && "bg-orange-100 text-orange-700"
                          )}>{act.tipo}</span>
                        </td>
                        <td className="px-4 py-3.5 text-[13px]">{act.unidad}</td>
                        <td className="px-4 py-3.5 text-[13px]">{act.dia}</td>
                        <td className="px-4 py-3.5 text-[13px] text-muted-foreground">{formatFecha(fechaAct)}</td>
                        <td className="px-4 py-3.5 text-[13px]">{act.hora}</td>
                        <td className="px-4 py-3.5 text-[13px]">{act.duracion}</td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2">
                            <Link href={buildUrl("/ver-unidad", withAsignatura({
                              curso: act.cursoOrigen || cursoFiltro,
                              unidad: act.unidad ? normalizeKeyPart(act.unidad) : "unidad_1"
                            }, ASIGNATURA))}
                              className="flex items-center gap-1 text-[11px] font-bold text-primary border border-primary rounded-full px-2.5 py-1 hover:bg-pink-light transition-colors">
                              Ver clase <ArrowRight className="w-3 h-3" />
                            </Link>
                            {modoTodos ? (
                              <button onClick={() => setCursoFiltro(act.cursoOrigen || "")}
                                className="text-[11px] font-semibold text-muted-foreground border border-border rounded-full px-2.5 py-1 hover:bg-background transition-colors"
                                title="Editar en su curso">
                                Editar
                              </button>
                            ) : (
                              <button onClick={() => eliminarActividad(act.id)}
                                className="w-6 h-6 rounded-full hover:bg-red-50 grid place-items-center text-muted-foreground hover:text-red-500 transition-colors">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
              )}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Leyenda + resumen */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <span className="text-xs font-semibold text-muted-foreground">Tipo:</span>
          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 text-[10px] font-bold uppercase">Clase</span>
          <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 text-[10px] font-bold uppercase">Actividad</span>
          <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold uppercase">Evaluación</span>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-l-[3px] border-primary rounded-sm bg-background" /> Clases del horario
          </span>
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-primary" /> Actividades planificadas
          </span>
        </div>
      </div>

      {showHoyDrawer && (
        <div className="fixed inset-0 z-[520] bg-black/40" onClick={() => setShowHoyDrawer(false)}>
          <div className="absolute right-0 top-0 h-full w-full max-w-[420px] overflow-y-auto bg-card p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-extrabold">Hoy</h2>
                <p className="text-[12px] text-muted-foreground">{hoy.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</p>
              </div>
              <button onClick={() => setShowHoyDrawer(false)} className="grid h-8 w-8 place-items-center rounded-full bg-background text-muted-foreground hover:bg-border">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {bloquesHoy().length === 0 ? (
                <div className="rounded-[12px] border border-border bg-background p-5 text-center text-[13px] text-muted-foreground">Sin bloques para hoy.</div>
              ) : bloquesHoy().map((bloque) => (
                <div key={bloque.id} className={cn("rounded-[12px] border border-border p-4", bloque.enCurso && "animate-pulse border-primary bg-pink-light/30")}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: bloque.color }}>{bloque.curso || "Curso"}</span>
                    {bloque.enCurso && <span className="text-[10px] font-extrabold text-primary">EN CURSO</span>}
                  </div>
                  <div className="text-[14px] font-extrabold">{bloque.titulo}</div>
                  <div className="mt-1 text-[12px] font-semibold text-muted-foreground">{bloque.horaInicio}{bloque.horaFin ? ` - ${bloque.horaFin}` : ""}</div>
                  <Link
                    href={buildUrl("/libro-clases", withAsignatura({ curso: bloque.curso, fecha: dateKey(hoy) }, ASIGNATURA))}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[12px] font-bold text-primary-foreground hover:bg-pink-dark"
                  >
                    Iniciar libro de clases <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal agregar actividad */}
      {showModal && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/40 p-4">
          <div className="w-[500px] max-w-[95vw] rounded-[18px] bg-card p-5 shadow-xl sm:p-7">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-[16px] font-extrabold">Agregar clase planificada</h3>
              <button onClick={() => setShowModal(false)} className="w-7 h-7 rounded-full bg-background grid place-items-center text-muted-foreground hover:bg-border transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Nombre de la actividad</label>
                <input type="text" value={nuevaAct.nombre} onChange={e => setNuevaAct(p => ({ ...p, nombre: e.target.value }))}
                  placeholder="Ej: Percusión corporal – ritmos básicos" autoFocus
                  className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Tipo</label>
                  <select value={nuevaAct.tipo} onChange={e => setNuevaAct(p => ({ ...p, tipo: e.target.value as any }))}
                    className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary">
                    <option value="clase">Clase</option>
                    <option value="actividad">Actividad</option>
                    <option value="evaluacion">Evaluación</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Unidad</label>
                  <select value={nuevaAct.unidad} onChange={e => setNuevaAct(p => ({ ...p, unidad: e.target.value }))}
                    className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary">
                    {unidadesCurso.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Día</label>
                  <select value={nuevaAct.dia} onChange={e => setNuevaAct(p => ({ ...p, dia: e.target.value }))}
                    className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary">
                    {DIAS_SEMANA.map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Hora</label>
                  <input type="time" value={nuevaAct.hora} onChange={e => setNuevaAct(p => ({ ...p, hora: e.target.value }))}
                    className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary" />
                </div>
                <div>
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5 block">Duración</label>
                  <input type="text" value={nuevaAct.duracion} onChange={e => setNuevaAct(p => ({ ...p, duracion: e.target.value }))}
                    className="w-full border-[1.5px] border-border rounded-[10px] px-3.5 py-2.5 text-[13px] outline-none focus:border-primary" />
                </div>
              </div>
              {/* Preview fecha */}
              <div className="bg-background rounded-[10px] px-4 py-3 flex items-center gap-3">
                <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-[13px] text-muted-foreground">
                  Se agendará el{" "}
                  <span className="font-semibold text-foreground">
                    {nuevaAct.dia} {formatFecha(getFechaReal(lunesActual, nuevaAct.dia))}
                  </span>
                  {" "}en la semana actual
                </span>
              </div>
              <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
                <button onClick={() => setShowModal(false)} className="text-[13px] font-semibold text-muted-foreground px-3.5 py-2 rounded-lg hover:bg-background cursor-pointer border-none bg-none">Cancelar</button>
                <button onClick={handleAgregarActividad}
                  className="bg-primary text-primary-foreground border-none rounded-[10px] px-5 py-2.5 text-[13px] font-bold cursor-pointer hover:bg-pink-dark transition-colors">
                  Agregar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function CronogramaContent() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[14px] font-medium">Cargando…</span>
      </div>
    }>
      <CronogramaInner />
    </Suspense>
  )
}
