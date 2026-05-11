"use client"

/**
 * Rediseño v2 del detalle de planificaciones.
 *
 * Pain points del diseño antiguo:
 *  • Cards grandes en grid → mucho scroll, info dispersa
 *  • Modales para crear/eliminar/renombrar → muchos clics
 *  • Sin vista de calendario para ver fechas de clases de un vistazo
 *
 * Cambios en v2:
 *  • Lista vertical compacta — una fila por unidad
 *  • Crear unidad inline (sin modal grande)
 *  • Eliminar inline con confirmación pequeña
 *  • Sidebar derecho con mini-calendario de próximas clases
 *  • Acciones visibles directamente (Ver, Cronograma, Eliminar)
 *
 * Funcionalidades complejas (dividir, drag-reorder) redirigen al v1 por ahora.
 */

import { useState, useEffect, useRef, useMemo } from "react"
import Link from "next/link"
import {
  Calendar, Plus, Trash2, Download,
  Loader2, ArrowLeft, BookOpen, Layers, AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  guardarPlanCurso, cargarPlanCurso, eliminarUnidadCompleta,
  cargarCronogramaUnidad,
} from "@/lib/curriculo"
import type { UnidadPlan, ClaseCronograma } from "@/lib/curriculo"
import { buildUrl, unidadIdFromIndex, withAsignatura } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { toast } from "@/hooks/use-toast"
import {
  cargarCursoTipos,
  cargarNivelMapping,
  resolveTipoCurricular,
  type CursoTipoMap,
  type NivelMapping,
  type TipoCurricular,
} from "@/lib/nivel-mapping"
import { apiFetch } from "@/lib/api-client"
import { FormatoDescargaModal, type FormatoDescarga, type SemestreDescarga } from "./formato-descarga-modal"
import type { InfoColegio } from "@/lib/perfil"

const COLORS = ["#F59E0B", "#3B82F6", "#EF4444", "#22C55E", "#8B5CF6", "#F03E6E", "#06B6D4", "#D97706"]
const MAX_UNIDADES = 12

type UnitType = "tradicional" | "invertida" | "proyecto" | "unidad0"

const TYPE_BADGES: Record<UnitType, { emoji: string; label: string; bg: string; text: string }> = {
  unidad0:     { emoji: "0️⃣", label: "Unidad 0",    bg: "bg-amber-100 dark:bg-amber-900/30",  text: "text-amber-700 dark:text-amber-300" },
  tradicional: { emoji: "📘", label: "Tradicional", bg: "bg-blue-100 dark:bg-blue-900/30",    text: "text-blue-700 dark:text-blue-300"  },
  invertida:   { emoji: "🔄", label: "Invertida",   bg: "bg-violet-100 dark:bg-violet-900/30", text: "text-violet-700 dark:text-violet-300" },
  proyecto:    { emoji: "🎯", label: "Proyecto",    bg: "bg-green-100 dark:bg-green-900/30",   text: "text-green-700 dark:text-green-300"  },
}

interface ProximaClase {
  unidadId: number
  unidadNombre: string
  unidadColor: string
  numero: number
  fechaDDMMYYYY: string
  fechaDate: Date
}

function parseFechaDDMMYYYY(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return Number.isNaN(d.getTime()) ? null : d
}

function fechaCorta(d: Date): string {
  const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]
  return `${d.getDate()} ${meses[d.getMonth()]}`
}

const DIAS_CORTOS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]

export function PlanificacionesV2Detail({ curso }: { curso: string }) {
  const { asignatura: ASIGNATURA } = useActiveSubject()

  const [units, setUnits] = useState<UnidadPlan[]>([])
  const [nextId, setNextId] = useState(1)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  // Crear unidad inline
  const [creandoNombre, setCreandoNombre] = useState("")
  const [creandoTipo, setCreandoTipo] = useState<UnitType>("tradicional")

  // Eliminación inline
  const [confirmEliminarId, setConfirmEliminarId] = useState<number | null>(null)
  const [eliminando, setEliminando] = useState(false)

  // Cronogramas (para sidebar de calendario y barras de cobertura)
  const [cronogramasPorUnidad, setCronogramasPorUnidad] = useState<Record<number, { clases: ClaseCronograma[]; totalClases: number }>>({})

  // Renombrar inline
  const [renombrandoId, setRenombrandoId] = useState<number | null>(null)
  const [renombrandoVal, setRenombrandoVal] = useState("")

  // Descarga
  const [downloading, setDownloading]           = useState(false)
  const [showFormatoModal, setShowFormatoModal]  = useState(false)
  const [nivelMapping, setNivelMapping]          = useState<NivelMapping>({})
  const [tipoCurricular, setTipoCurricular]      = useState<TipoCurricular>("oficial")
  const [colegioInfo, setColegioInfo]            = useState<InfoColegio | null>(null)

  // Auto-save
  const ignoreNextSaveRef = useRef(true)

  // ── Cargar unidades del curso ──
  useEffect(() => {
    setLoading(true)
    cargarPlanCurso(ASIGNATURA, curso)
      .then(data => {
        if (data?.units) {
          setUnits(data.units)
          setNextId(Math.max(0, ...data.units.map(u => u.id)) + 1)
        } else {
          setUnits([])
          setNextId(1)
        }
      })
      .catch(() => { setUnits([]); setNextId(1) })
      .finally(() => {
        setLoading(false)
        ignoreNextSaveRef.current = true
      })
  }, [curso, ASIGNATURA])

  // ── Auto-save con debounce ──
  useEffect(() => {
    if (loading) return
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false
      return
    }
    setSaveStatus("saving")
    const t = setTimeout(async () => {
      try {
        await guardarPlanCurso(ASIGNATURA, curso, units)
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 1800)
      } catch {
        setSaveStatus("error")
      }
    }, 1500)
    return () => clearTimeout(t)
  }, [units, ASIGNATURA, curso, loading])

  // ── Cargar cronogramas para mostrar cobertura + próximas clases ──
  useEffect(() => {
    if (units.length === 0) {
      setCronogramasPorUnidad({})
      return
    }
    let cancelled = false
    Promise.all(
      units.map(async u => {
        const c = await cargarCronogramaUnidad(ASIGNATURA, curso, String(u.id)).catch(() => null)
        return [u.id, c ? { clases: c.clases, totalClases: c.totalClases } : { clases: [], totalClases: 0 }] as const
      })
    ).then(results => {
      if (cancelled) return
      const map: Record<number, { clases: ClaseCronograma[]; totalClases: number }> = {}
      results.forEach(([id, v]) => { map[id] = v })
      setCronogramasPorUnidad(map)
    })
    return () => { cancelled = true }
  }, [units, ASIGNATURA, curso])

  // ── Próximas clases (para sidebar de calendario) ──
  const proximasClases: ProximaClase[] = useMemo(() => {
    const ahora = new Date()
    ahora.setHours(0, 0, 0, 0)
    const lista: ProximaClase[] = []
    units.forEach(u => {
      const crono = cronogramasPorUnidad[u.id]
      if (!crono) return
      crono.clases.forEach(clase => {
        if (!clase.fecha) return
        const d = parseFechaDDMMYYYY(clase.fecha)
        if (!d) return
        if (d.getTime() < ahora.getTime()) return
        lista.push({
          unidadId: u.id,
          unidadNombre: u.name,
          unidadColor: u.color,
          numero: clase.numero,
          fechaDDMMYYYY: clase.fecha,
          fechaDate: d,
        })
      })
    })
    return lista.sort((a, b) => a.fechaDate.getTime() - b.fechaDate.getTime()).slice(0, 8)
  }, [units, cronogramasPorUnidad])

  // ── Crear unidad inline ──
  const crearUnidad = () => {
    const nombre = creandoNombre.trim()
    if (!nombre) {
      toast({ title: "Pon un nombre primero", variant: "destructive" })
      return
    }
    if (units.length >= MAX_UNIDADES) {
      toast({ title: `Máximo ${MAX_UNIDADES} unidades`, variant: "destructive" })
      return
    }
    const id = nextId
    const nueva: UnidadPlan = {
      id,
      name: nombre,
      color: COLORS[units.length % COLORS.length],
      hours: 8,
      start: "",
      end: "",
      type: creandoTipo,
      unidadCurricularId: `unidad_${units.length + 1}`,
    }
    setUnits(prev => [...prev, nueva])
    setNextId(id + 1)
    setCreandoNombre("")
  }

  // ── Eliminar unidad (con confirmación inline) ──
  const eliminarUnidad = async (id: number) => {
    if (eliminando) return
    const unit = units.find(u => u.id === id)
    if (!unit) return
    setEliminando(true)
    try {
      await eliminarUnidadCompleta(ASIGNATURA, curso, String(id))
      setUnits(prev => prev.filter(u => u.id !== id))
      setConfirmEliminarId(null)
      toast({ title: `"${unit.name}" eliminada` })
    } catch (e) {
      console.error(e)
      toast({ title: "Error al eliminar", variant: "destructive" })
    } finally {
      setEliminando(false)
    }
  }

  // ── Renombrar unidad inline ──
  const guardarRenombre = (id: number) => {
    const nombre = renombrandoVal.trim()
    if (nombre) {
      setUnits(prev => prev.map(u => u.id === id ? { ...u, name: nombre } : u))
    }
    setRenombrandoId(null)
    setRenombrandoVal("")
  }

  // ── Cargar nivel curricular + info colegio ──
  useEffect(() => {
    cargarNivelMapping().then(setNivelMapping).catch(() => {})
    cargarCursoTipos()
      .then((tipos: CursoTipoMap) => setTipoCurricular(resolveTipoCurricular(curso, tipos)))
      .catch(() => setTipoCurricular("oficial"))
    import("@/lib/perfil").then(({ cargarInfoColegio }) =>
      cargarInfoColegio().then(setColegioInfo).catch(() => {})
    )
  }, [curso])

  // ── Descargar planificación ──
  const handleDescargar = async (formato: FormatoDescarga, semestre: SemestreDescarga, usarEncabezado: boolean) => {
    if (units.length === 0 || downloading) return
    setDownloading(true)
    setShowFormatoModal(false)
    try {
      const { cargarVerUnidad, cargarActividadClase } = await import("@/lib/curriculo")
      const nivelCurricular = tipoCurricular === "oficial"
        ? (nivelMapping[curso] || "Sin nivel configurado")
        : tipoCurricular === "taller"
          ? "Taller / sin curriculum oficial"
          : "Libre / sin curriculum oficial"

      const encabezado = usarEncabezado && colegioInfo ? {
        logoIzqBase64: colegioInfo.logoBase64,
        textoIzq:      colegioInfo.encabezadoTextoIzq,
        logoDerBase64: colegioInfo.logoDerBase64,
        textoDer:      colegioInfo.encabezadoTextoDer,
      } : undefined

      // Helper: ver-unidad guarda con String(unit.id); probamos formatos heredados como fallback.
      const cargarVerUnidadConFallback = async (unit: typeof units[number], idx: number) => {
        const ids = [
          String(unit.id),
          unit.id ? `unidad_${unit.id}` : null,
          unit.unidadCurricularId,
          unidadIdFromIndex(idx),
        ].filter(Boolean) as string[]
        for (const id of ids) {
          const v = await cargarVerUnidad(ASIGNATURA, curso, id).catch(() => null)
          if (v) return v
        }
        return null
      }

      if (formato === "tabla") {
        const unidadesExport = await Promise.all(
          units.map(async (unit, idx) => {
            const verUnidad = await cargarVerUnidadConFallback(unit, idx)
            const oasBasales: string[] = []
            const oasTransversales: string[] = []
            const indicadoresPorOa: Record<string, string[]> = {}
            if (verUnidad?.oas) {
              for (const oa of verUnidad.oas) {
                if (!oa.seleccionado) continue
                const label = `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${oa.descripcion || ""}`.trim()
                if (oa.tipo === "oat") {
                  oasTransversales.push(label)
                } else {
                  oasBasales.push(label)
                  const inds = (oa.indicadores || []).filter(i => i.seleccionado).map(i => i.texto)
                  if (inds.length > 0) indicadoresPorOa[label] = inds
                }
              }
            }
            return {
              numero: idx + 1,
              nombre: unit.name || `Unidad ${idx + 1}`,
              oasBasales, oasTransversales, clases: [],
              start: unit.start || undefined,
              end:   unit.end   || undefined,
              indicadoresPorOa,
            }
          })
        )
        const res = await apiFetch("/api/export-planificacion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formato: "tabla", semestre, nivel: nivelCurricular, asignatura: ASIGNATURA, unidades: unidadesExport, encabezado }),
        })
        if (!res.ok) throw new Error("Error al generar el documento")
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        const suf = semestre === 1 ? "_S1" : semestre === 2 ? "_S2" : ""
        a.download = `PlanAnual_${ASIGNATURA}${suf}_${new Date().getFullYear()}.docx`
        a.click()
        URL.revokeObjectURL(url)
        toast({ title: "Planificación descargada exitosamente" })
        return
      }

      // Formato detallado
      const { htmlToPlainTextForExport } = await import("@/lib/export/planificacion-docx")
      const unidadesExport = await Promise.all(
        units.map(async (unit, idx) => {
          const unidadId = String(unit.id)
          const verUnidad = await cargarVerUnidadConFallback(unit, idx)
          const oasBasales: string[] = []
          const oasTransversales: string[] = []
          if (verUnidad?.oas) {
            for (const oa of verUnidad.oas) {
              if (!oa.seleccionado) continue
              const label = `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${oa.descripcion || ""}`.trim()
              if (oa.tipo === "oat") oasTransversales.push(label)
              else oasBasales.push(label)
            }
          }
          const clasesExport = []
          for (let n = 1; n <= 30; n++) {
            const act = await cargarActividadClase(curso, unidadId, n, ASIGNATURA).catch(() => null)
            if (!act) continue
            if (!act.objetivo && !act.inicio && !act.desarrollo && !act.cierre) continue
            const oasOcupados = (verUnidad?.oas || [])
              .filter(oa => (act.oaIds || []).includes(oa.id))
              .map(oa => `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${oa.descripcion || ""}`.trim())
            const indicadores = (verUnidad?.oas || [])
              .filter(oa => (act.oaIds || []).includes(oa.id))
              .flatMap(oa => {
                const selIds = act.indicadoresPorOa?.[oa.id]
                return (oa.indicadores || [])
                  .filter(i => i.seleccionado)
                  .filter(i => !selIds || selIds.includes(i.id))
                  .map(i => `${oa.numero ? `OA ${oa.numero}` : oa.id}: ${i.texto}`)
              })
            clasesExport.push({
              numero: n, oasOcupados, indicadores,
              objetivo:        htmlToPlainTextForExport(act.objetivo || ""),
              inicio:          htmlToPlainTextForExport(act.inicio || ""),
              actividadInicio: "",
              desarrollo:      htmlToPlainTextForExport(act.desarrollo || ""),
              cierre:          htmlToPlainTextForExport(act.cierre || ""),
              recursos: act.materiales || [], tics: act.tics || [], criteriosEvaluacion: [],
            })
          }
          return { numero: idx + 1, nombre: unit.name || `Unidad ${idx + 1}`, oasBasales, oasTransversales, clases: clasesExport }
        })
      )
      const res = await apiFetch("/api/export-planificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formato: "detallado", nivel: nivelCurricular, asignatura: ASIGNATURA, unidades: unidadesExport }),
      })
      if (!res.ok) throw new Error("Error al generar el documento")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `Planificacion_${ASIGNATURA}_${curso}_${new Date().getFullYear()}.docx`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Planificación descargada exitosamente" })
    } catch (err) {
      console.error("[handleDescargar]", err)
      toast({ title: "Error al generar el documento. Intenta de nuevo.", variant: "destructive" })
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground text-[13px]">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando planificación...
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1400px] px-3 sm:px-5 py-5">
      {/* ── Header ── */}
      <div className="mb-5 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={buildUrl("/planificaciones", withAsignatura({}, ASIGNATURA))}
            className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-background"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground">{ASIGNATURA}</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="text-[18px] sm:text-[22px] font-extrabold leading-tight truncate">
                {curso}
              </h1>
              {tipoCurricular !== "oficial" && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {tipoCurricular === "taller" ? "Taller sin curriculum oficial" : "Libre sin curriculum oficial"}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {saveStatus === "saving" && <span className="text-[11px] text-muted-foreground animate-pulse">Guardando...</span>}
          {saveStatus === "saved" && <span className="text-[11px] text-green-600 font-bold">✓ Guardado</span>}
          {saveStatus === "error" && <span className="text-[11px] text-red-500 font-bold">Error</span>}
          <Link
            href={buildUrl("/planificaciones-v1", withAsignatura({ curso }, ASIGNATURA))}
            className="text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-md px-2 py-1"
            title="Volver al diseño anterior"
          >
            ← Diseño antiguo
          </Link>
        </div>
      </div>

      {/* ── Layout 2 columnas ── */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ─── Columna principal: lista de unidades ─── */}
        <div className="space-y-3">
          {/* Crear unidad inline */}
          <div className="rounded-[14px] border border-dashed border-border bg-background p-3 flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={creandoNombre}
              onChange={e => setCreandoNombre(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); crearUnidad() } }}
              placeholder="Nombre de la nueva unidad..."
              className="flex-1 min-w-[180px] h-9 rounded-lg border border-border bg-card px-3 text-[13px] outline-none focus:border-primary"
            />
            <select
              value={creandoTipo}
              onChange={e => setCreandoTipo(e.target.value as UnitType)}
              className="h-9 rounded-lg border border-border bg-card px-2 text-[12px] outline-none cursor-pointer"
            >
              {(Object.keys(TYPE_BADGES) as UnitType[]).map(t => (
                <option key={t} value={t}>
                  {TYPE_BADGES[t].emoji} {TYPE_BADGES[t].label}
                </option>
              ))}
            </select>
            <button
              onClick={crearUnidad}
              disabled={!creandoNombre.trim() || units.length >= MAX_UNIDADES}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg bg-primary text-primary-foreground text-[12px] font-bold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>

          {/* Lista de unidades */}
          {units.length === 0 ? (
            <div className="rounded-[14px] border-2 border-dashed border-border bg-card p-10 text-center">
              <Layers className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-[13px] text-muted-foreground">No hay unidades en {curso} todavía.</p>
              <p className="text-[12px] text-muted-foreground mt-1">Empieza agregando una con el formulario de arriba.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {units.map((u, idx) => {
                const crono = cronogramasPorUnidad[u.id]
                const total = crono?.totalClases ?? 0
                const asignadas = crono?.clases.filter(c => c.fecha?.trim()).length ?? 0
                const pct = total > 0 ? Math.round((asignadas / total) * 100) : 0
                const colorBar = pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-amber-400" : pct > 0 ? "bg-red-400" : "bg-muted"
                const isConfirming = confirmEliminarId === u.id
                const isRenaming = renombrandoId === u.id
                return (
                  <li
                    key={u.id}
                    className={cn(
                      "rounded-[12px] border bg-card transition-all duration-150",
                      isConfirming
                        ? "border-red-300 bg-red-50/60 dark:bg-red-950/20"
                        : "border-border hover:border-primary/50 hover:shadow-md hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center gap-3 px-3 py-2.5 flex-wrap">
                      {/* Color + badge tipo */}
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: u.color }} />
                        {(() => {
                          const badge = TYPE_BADGES[u.type as UnitType]
                          return badge ? (
                            <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 flex items-center gap-0.5", badge.bg, badge.text)}>
                              {badge.emoji} <span className="hidden sm:inline">{badge.label}</span>
                            </span>
                          ) : null
                        })()}
                        {/* Nombre (editable inline) */}
                        {isRenaming ? (
                          <input
                            autoFocus
                            type="text"
                            value={renombrandoVal}
                            onChange={e => setRenombrandoVal(e.target.value)}
                            onBlur={() => guardarRenombre(u.id)}
                            onKeyDown={e => {
                              if (e.key === "Enter") { e.preventDefault(); guardarRenombre(u.id) }
                              if (e.key === "Escape") { setRenombrandoId(null); setRenombrandoVal("") }
                            }}
                            className="flex-1 min-w-0 h-7 rounded border border-primary bg-background px-2 text-[13px] font-bold outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => { setRenombrandoId(u.id); setRenombrandoVal(u.name) }}
                            className="text-[14px] font-extrabold text-foreground truncate text-left hover:text-primary"
                            title="Click para renombrar"
                          >
                            {u.name}
                          </button>
                        )}
                      </div>

                      {/* Cobertura */}
                      {total > 0 && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-[11px] font-bold text-muted-foreground tabular-nums">
                            {asignadas}/{total}
                          </div>
                          <div className="h-1.5 w-20 rounded-full bg-border/50 overflow-hidden">
                            <div className={cn("h-full transition-all", colorBar)} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}

                      {/* Acciones */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Link
                          href={buildUrl("/ver-unidad", withAsignatura({ curso, unidad: u.unidadCurricularId || "unidad_1", unitIdLocal: String(u.id) }, ASIGNATURA))}
                          className="flex items-center gap-1 text-[11px] font-bold text-primary border border-primary/40 rounded-lg px-2 py-1.5 hover:bg-pink-light"
                          title="Ver y planificar la unidad"
                        >
                          <BookOpen className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Ver</span>
                        </Link>
                        <Link
                          href={buildUrl("/cronograma", withAsignatura({ curso }, ASIGNATURA))}
                          className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground border border-border rounded-lg px-2 py-1.5 hover:bg-muted/60"
                          title="Cronograma del curso"
                        >
                          <Calendar className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Crono</span>
                        </Link>
                        {!isConfirming ? (
                          <button
                            onClick={() => setConfirmEliminarId(u.id)}
                            className="flex items-center gap-1 text-[11px] font-bold text-red-500 border border-red-200 bg-red-50 rounded-lg px-2 py-1.5 hover:bg-red-100"
                            title="Eliminar definitivamente"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => eliminarUnidad(u.id)}
                              disabled={eliminando}
                              className="text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                            >
                              {eliminando ? "..." : "Sí, borrar"}
                            </button>
                            <button
                              onClick={() => setConfirmEliminarId(null)}
                              disabled={eliminando}
                              className="text-[11px] font-bold text-muted-foreground border border-border rounded-lg px-2.5 py-1.5 hover:bg-muted/60"
                            >
                              Cancelar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Confirmación detallada cuando se intenta borrar */}
                    {isConfirming && (
                      <div className="px-3 pb-2.5 -mt-1 text-[11px] text-red-700 border-t border-red-200 pt-2 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                          Se eliminará la planificación, el cronograma y <b>todas las clases planificadas</b> de "{u.name}". No se puede deshacer.
                        </span>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/* Link al diseño antiguo para acciones avanzadas */}
          <div className="text-[11px] text-muted-foreground text-center pt-2">
            ¿Necesitas dividir, reordenar o cambiar fechas de unidad?{" "}
            <Link
              href={buildUrl("/planificaciones-v1", withAsignatura({ curso }, ASIGNATURA))}
              className="text-primary font-bold hover:underline"
            >
              Usa el diseño anterior →
            </Link>
          </div>
        </div>

        {/* ─── Columna derecha: mini-calendario ─── */}
        <div className="space-y-3">
          <div className="rounded-[14px] border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-primary" />
              <h3 className="text-[13px] font-extrabold">Próximas clases</h3>
            </div>
            {proximasClases.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">
                No hay clases con fecha asignada hacia el futuro.
              </p>
            ) : (
              <ul className="space-y-2">
                {proximasClases.map((p, i) => (
                  <li
                    key={`${p.unidadId}-${p.numero}-${i}`}
                    className="flex items-start gap-2 rounded-lg border border-border bg-background p-2.5 hover:border-primary/40 transition-colors"
                  >
                    <span className="h-2 w-2 mt-1.5 flex-shrink-0 rounded-full" style={{ background: p.unidadColor }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-muted-foreground">
                        {DIAS_CORTOS[p.fechaDate.getDay()]} {fechaCorta(p.fechaDate)}
                      </p>
                      <p className="text-[12px] font-bold text-foreground truncate">
                        Clase {p.numero}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {p.unidadNombre}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Resumen del curso */}
          <div className="rounded-[14px] border border-border bg-card p-4 space-y-2 shadow-sm">
            <h3 className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground mb-2">Resumen</h3>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">Unidades</span>
              <span className="font-bold tabular-nums">{units.length} / {MAX_UNIDADES}</span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">Total clases planificadas</span>
              <span className="font-bold tabular-nums">
                {Object.values(cronogramasPorUnidad).reduce((s, c) => s + c.totalClases, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted-foreground">Con fecha asignada</span>
              <span className="font-bold tabular-nums">
                {Object.values(cronogramasPorUnidad).reduce((s, c) => s + c.clases.filter(cl => cl.fecha?.trim()).length, 0)}
              </span>
            </div>
          </div>

          {/* Descargar planificación */}
          <div className="rounded-[14px] border border-border bg-card p-4">
            <h3 className="text-[12px] font-extrabold uppercase tracking-wide text-muted-foreground mb-3">Exportar</h3>
            <button
              onClick={() => setShowFormatoModal(true)}
              disabled={units.length === 0 || downloading}
              className="w-full flex items-center justify-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-card px-4 py-2.5 text-[13px] font-bold text-primary hover:bg-pink-light transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {downloading
                ? <><Loader2 className="h-[14px] w-[14px] animate-spin" /> Generando…</>
                : <><Download className="h-[14px] w-[14px]" /> Descargar planificación</>
              }
            </button>
            <p className="mt-2 text-[10px] text-muted-foreground text-center">
              Elige entre formato detallado o por tabla
            </p>
          </div>
        </div>
      </div>

      {/* Selector de formato de descarga */}
      <FormatoDescargaModal
        open={showFormatoModal}
        downloading={downloading}
        onClose={() => setShowFormatoModal(false)}
        tieneEncabezado={!!colegioInfo?.encabezadoHabilitado}
        onDescargar={handleDescargar}
      />
    </div>
  )
}
