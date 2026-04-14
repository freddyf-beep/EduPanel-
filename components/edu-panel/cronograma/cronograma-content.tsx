"use client"

import { useState, useEffect, Suspense } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ChevronLeft, ChevronRight, Download, Plus, Calendar,
  Clock, Filter, LayoutGrid, List, Loader2, Check,
  X, Bookmark, ArrowRight, BookOpen, Zap
} from "lucide-react"
import { cn } from "@/lib/utils"
import { guardarCronograma, cargarCronograma, cargarPlanCurso } from "@/lib/curriculo"
import type { ActividadCronograma } from "@/lib/curriculo"
import { buildUrl, UNIT_COLORS, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal, ClaseHorario } from "@/lib/horario"
import { useIsMobile } from "@/components/ui/use-mobile"
import { useActiveSubject } from "@/hooks/use-active-subject"

// ─── Constantes ───────────────────────────────────────────────────────────────
const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"]
const DIAS_MAP: Record<string, number> = { Lunes:1, Martes:2, "Miércoles":3, Jueves:4, Viernes:5 }

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

function semanaLabel(lunes: Date): string {
  const viernes = new Date(lunes); viernes.setDate(viernes.getDate() + 4)
  return `${lunes.getDate()} – ${viernes.getDate()} ${MESES[viernes.getMonth()]}`
}

// Número de semana del año
function weekNumber(d: Date): number {
  const onejan = new Date(d.getFullYear(), 0, 1)
  return Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
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
  const [viewMode, setViewMode]       = useState<"grid"|"list">("grid")
  const [actividades, setActividades] = useState<ActividadCronograma[]>([])
  const [unidadesCurso, setUnidadesCurso] = useState<string[]>([])
  const [horarioBase, setHorarioBase] = useState<ClaseHorario[]>([])
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saveStatus, setSaveStatus]   = useState<"idle"|"saved"|"error">("idle")
  const [showModal, setShowModal]     = useState(false)
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
      if (!cursoParam && unique.length > 0) setCursoFiltro(unique[0])
    })
  }, [cursoParam])

  // ─── Cargar datos ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cursoFiltro) return
    setLoading(true)
    Promise.all([
      cargarCronograma(ASIGNATURA, cursoFiltro),
      cargarPlanCurso(ASIGNATURA, cursoFiltro),
    ]).then(([crono, plan]) => {
      setActividades(crono?.actividades || [])
      if (plan?.units && plan.units.length > 0) {
        setUnidadesCurso(plan.units.map(u => u.name))
        setNuevaAct(p => ({ ...p, unidad: plan.units[0].name, color: plan.units[0].color || UNIT_COLORS[0] }))
      } else {
        setUnidadesCurso(["Unidad 1", "Unidad 2"])
      }
    }).catch(console.error)
    .finally(() => setLoading(false))
  }, [cursoFiltro, ASIGNATURA])

  useEffect(() => {
    setViewMode(isMobile ? "list" : "grid")
  }, [isMobile])

  const navSemana = (dir: number) => {
    const d = new Date(lunesActual)
    d.setDate(d.getDate() + dir * 7)
    setLunesActual(d)
  }

  const irHoy = () => setLunesActual(getLunes(hoy))

  const handleGuardar = async () => {
    setSaving(true)
    try {
      await guardarCronograma(ASIGNATURA, cursoFiltro, actividades)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally { setSaving(false) }
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

  // Clases del horario del ICS para este curso en este día
  const getClasesHorario = (dia: string) =>
    horarioBase.filter(c => {
      const match = c.resumen === cursoFiltro ||
        c.resumen.replace("°","").trim() === cursoFiltro.replace("°","").trim()
      return match && c.dia === dia
    })

  if (loading || !cursoFiltro) return (
    <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[14px] font-medium">Cargando cronograma…</span>
    </div>
  )

  return (
    <div className="mx-auto max-w-[1400px]">

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3.5">
        <div className="flex items-center gap-3">
          <Link href={buildUrl("/planificaciones", withAsignatura({ curso: cursoFiltro }, ASIGNATURA))}
            className="w-8 h-8 border-[1.5px] border-border rounded-lg bg-card grid place-items-center text-muted-foreground hover:bg-background transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-[22px] font-extrabold">Cronograma — {ASIGNATURA}</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto sm:justify-end">
          <button className="flex items-center gap-[7px] border-[1.5px] border-border rounded-[10px] px-4 py-2.5 text-[13px] font-semibold bg-card hover:bg-background transition-colors">
            <Download className="w-[15px] h-[15px] text-muted-foreground" /> Exportar
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-[7px] border-[1.5px] border-border rounded-[10px] px-4 py-2.5 text-[13px] font-semibold bg-card hover:bg-background transition-colors">
            <Plus className="w-[15px] h-[15px] text-muted-foreground" /> Agregar clase
          </button>
          {saveStatus === "saved" && <span className="flex items-center gap-1.5 text-[13px] font-semibold text-green-600"><Check className="w-4 h-4" /> Guardado</span>}
          {saveStatus === "error" && <span className="text-[13px] font-semibold text-red-500">Error al guardar</span>}
          <button onClick={handleGuardar} disabled={saving}
            className="flex items-center gap-[7px] bg-primary text-primary-foreground border-none rounded-[10px] px-[18px] py-2.5 text-[13px] font-bold hover:bg-pink-dark transition-colors disabled:opacity-60">
            {saving ? <><Loader2 className="w-[15px] h-[15px] animate-spin" /> Guardando…</> : <><Bookmark className="w-[15px] h-[15px]" /> Guardar</>}
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
            <button onClick={() => setViewMode("grid")}
              className={cn("px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors",
                viewMode === "grid" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
              )}>
              <LayoutGrid className="w-3.5 h-3.5" /> Semana
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
        {!esSemanActual && (
          <button onClick={irHoy}
            className="flex items-center gap-1.5 text-[12px] font-semibold text-primary border border-primary rounded-full px-3 py-1.5 hover:bg-pink-light transition-colors">
            <Zap className="w-3 h-3" /> Hoy
          </button>
        )}
        {esSemanActual && (
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
            <Check className="w-3 h-3" /> Semana actual
          </span>
        )}
      </div>

      {viewMode === "grid" ? (
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
                      style={{ backgroundColor: act.color }}>
                      <div className="text-[10px] font-bold uppercase mb-1">{act.tipo}</div>
                      <div className="text-[11px] font-semibold leading-snug mb-1.5">{act.nombre}</div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] opacity-90">
                          <Clock className="w-2.5 h-2.5" />{act.hora}
                        </div>
                        {/* Botón ir a clase */}
                        <Link
                          href={buildUrl("/ver-unidad", withAsignatura({ curso: cursoFiltro, unidad: "unidad_1" }, ASIGNATURA))}
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-white/20 transition-all hover:bg-white/30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                        >
                          Ver clase <ArrowRight className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); eliminarActividad(act.id) }}
                        className="absolute top-1.5 right-1.5 grid h-4 w-4 place-items-center rounded bg-white/20 transition-all hover:bg-white/40 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}

                  {/* Celda vacía */}
                  {clasesICS.length === 0 && actsDelDia.length === 0 && (
                    <div className="flex-1 flex items-center justify-center">
                      <span className="text-[11px] text-[#d0d3df]">–</span>
                    </div>
                  )}

                  {/* Botón agregar rápido */}
                  <button
                    onClick={() => { setNuevaAct(p => ({ ...p, dia })); setShowModal(true) }}
                    className="mt-auto flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-primary opacity-100 sm:opacity-0 sm:hover:opacity-100 sm:group-hover:opacity-100"
                  >
                    <Plus className="w-3 h-3" /> Agregar
                  </button>
                </div>
              )
            })}
          </div>
            </div>
          </div>
        </div>
      ) : (
        /* Vista lista */
        <div className="overflow-x-auto rounded-[14px] border border-border bg-card">
          <table className="w-full">
            <thead>
              <tr className="bg-background">
                {["Actividad","Tipo","Unidad","Día","Fecha","Hora","Duración",""].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-bold text-muted-foreground uppercase tracking-wide border-b border-border">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actFiltradas.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <BookOpen className="w-8 h-8" />
                    <p className="text-[13px]">Sin actividades planificadas para {cursoFiltro}.</p>
                    <button onClick={() => setShowModal(true)} className="flex items-center gap-1.5 bg-primary text-white text-[12px] font-bold px-4 py-2 rounded-full hover:bg-pink-dark transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Agregar primera clase
                    </button>
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
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: act.color }} />
                            <span className="text-[13px] font-semibold">{act.nombre}</span>
                          </div>
                        </td>
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
                            <Link href={buildUrl("/ver-unidad", withAsignatura({ curso: cursoFiltro, unidad: "unidad_1" }, ASIGNATURA))}
                              className="flex items-center gap-1 text-[11px] font-bold text-primary border border-primary rounded-full px-2.5 py-1 hover:bg-pink-light transition-colors">
                              Ver clase <ArrowRight className="w-3 h-3" />
                            </Link>
                            <button onClick={() => eliminarActividad(act.id)}
                              className="w-6 h-6 rounded-full hover:bg-red-50 grid place-items-center text-muted-foreground hover:text-red-500 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
              )}
            </tbody>
          </table>
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
