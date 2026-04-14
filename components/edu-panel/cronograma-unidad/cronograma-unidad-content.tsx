"use client"

import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import {
  ChevronLeft, ChevronRight, Loader2, Check,
  Bookmark, Shuffle, Copy, ArrowRight, Calendar,
  AlertTriangle, Plus, Trash2
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  guardarCronogramaUnidad, cargarCronogramaUnidad,
} from "@/lib/curriculo"
import type { OAEditado, ClaseCronograma } from "@/lib/curriculo"
import { UNIT_COLORS, buildUrl, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal, ClaseHorario } from "@/lib/horario"
import { useActiveSubject } from "@/hooks/use-active-subject"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DIAS_MAP: Record<string, number> = { Lunes:1, Martes:2, "Miércoles":3, Jueves:4, Viernes:5 }
const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]

// Genera fechas automáticas a partir del horario ICS del curso
function generarFechasAutomaticas(curso: string, totalClases: number, horarioBase: ClaseHorario[]): string[] {
  const entry = horarioBase.find(h =>
    h.resumen === curso || h.resumen.replace("°","").trim() === curso.replace("°","").trim()
  )
  if (!entry) return Array(totalClases).fill("")

  const diaSemana = DIAS_MAP[entry.dia] || 1
  const fechas: string[] = []
  const hoy = new Date()
  // Buscar el primer día de ese día de semana desde hoy
  let d = new Date(hoy)
  while (d.getDay() !== diaSemana) d.setDate(d.getDate() + 1)

  for (let i = 0; i < totalClases; i++) {
    const dd = String(d.getDate()).padStart(2,"0")
    const mm = String(d.getMonth()+1).padStart(2,"0")
    const yy = d.getFullYear()
    fechas.push(`${dd}/${mm}/${yy}`)
    d.setDate(d.getDate() + 7) // siguiente semana mismo día
  }
  return fechas
}

function formatFechaCorta(f: string): string {
  if (!f) return ""
  const [d, m] = f.split("/")
  return `${parseInt(d)} ${MESES[parseInt(m)-1]}`
}

// ─── Componente ───────────────────────────────────────────────────────────────

interface Props {
  oas: OAEditado[]
  totalClases: number
  curso: string
  unidadId: string
  unidadCurricularId?: string
}

export function CronogramaUnidadContent({ oas, totalClases, curso, unidadId, unidadCurricularId }: Props) {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [clases, setClases]         = useState<ClaseCronograma[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle"|"saving_silent"|"saved"|"error">("idle")
  const [colOffset, setColOffset]   = useState(0)          // paginación horizontal
  const [showAutoWarn, setShowAutoWarn] = useState(false)  // advertencia autorelleno
  const [editFecha, setEditFecha]   = useState<number|null>(null)
  const [fechaTemp, setFechaTemp]   = useState("")
  const [horarioBase, setHorarioBase] = useState<ClaseHorario[]>([])

  const COLS_VISIBLE = 7  // columnas visibles a la vez

  // Inicializar clases
  useEffect(() => {
    setLoading(true)
    Promise.all([
      cargarCronogramaUnidad(ASIGNATURA, curso, unidadId),
      cargarHorarioSemanal()
    ]).then(([data, hData]) => {
      setHorarioBase(hData || [])
      
      if (data && data.clases.length > 0) {
        // Si hay guardado, expandir/contraer al totalClases actual
        const saved = data.clases
        if (saved.length < totalClases) {
          const extra = Array.from({ length: totalClases - saved.length }, (_, i) => ({
            numero: saved.length + i + 1,
            fecha: "",
            oaIds: [],
          }))
          setClases([...saved, ...extra])
        } else {
          setClases(saved.slice(0, totalClases))
        }
      } else {
        setClases(Array.from({ length: totalClases }, (_, i) => ({
          numero: i + 1,
          fecha: "",
          oaIds: [],
        })))
      }
      ignoreNextSaveRef.current = true;
    }).finally(() => setLoading(false))
  }, [curso, unidadId, totalClases, ASIGNATURA])

  const ignoreNextSaveRef = useRef(true);
  useEffect(() => {
    if (loading) return;
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false;
      return;
    }
    setSaveStatus("saving_silent")
    const timer = setTimeout(() => {
      handleGuardar(true)
    }, 2500)
    return () => clearTimeout(timer)
  }, [clases])

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      await guardarCronogramaUnidad(ASIGNATURA, curso, unidadId, totalClases, clases)
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } finally { setSaving(false) }
  }

  // Toggle OA en una clase
  const toggleOA = (claseNum: number, oaId: string) => {
    setClases(prev => prev.map(c => {
      if (c.numero !== claseNum) return c
      const ya = c.oaIds.includes(oaId)
      return { ...c, oaIds: ya ? c.oaIds.filter(id => id !== oaId) : [...c.oaIds, oaId] }
    }))
  }

  // Autorelleno aleatorio
  const handleAutorelleno = () => {
    setShowAutoWarn(false)
    const oaSelec = oas.filter(o => o.seleccionado)
    if (oaSelec.length === 0) return
    const nuevasClases = clases.map((c, i) => ({
      ...c,
      oaIds: [oaSelec[i % oaSelec.length].id]
    }))
    setClases(nuevasClases)
  }

  // Fechas automáticas
  const handleFechasAuto = () => {
    const fechas = generarFechasAutomaticas(curso, totalClases, horarioBase)
    setClases(prev => prev.map((c, i) => ({ ...c, fecha: fechas[i] || "" })))
  }

  // Duplicar clase
  const duplicarClase = (claseNum: number) => {
    const original = clases.find(c => c.numero === claseNum)
    if (!original) return
    const nuevaClase: ClaseCronograma = {
      numero: clases.length + 1,
      fecha: "",
      oaIds: [...original.oaIds],
      duplicadaDe: claseNum,
    }
    setClases(prev => [...prev, nuevaClase])
  }

  // Editar fecha
  const guardarFecha = (claseNum: number) => {
    if (!fechaTemp) { setEditFecha(null); return }
    const [y, m, d] = fechaTemp.split("-")
    const fmtd = `${d}/${m}/${y}`
    setClases(prev => prev.map(c => c.numero === claseNum ? { ...c, fecha: fmtd } : c))
    setEditFecha(null)
    setFechaTemp("")
  }

  const oasSeleccionados = oas.filter(o => o.seleccionado)
  const clasesVisibles   = clases.slice(colOffset, colOffset + COLS_VISIBLE)

  // Cobertura: % de OA que tienen al menos 1 clase
  const oaConClase = oasSeleccionados.filter(oa =>
    clases.some(c => c.oaIds.includes(oa.id))
  ).length
  const cobertura = oasSeleccionados.length > 0
    ? Math.round((oaConClase / oasSeleccionados.length) * 100) : 0

  if (loading) return (
    <div className="flex items-center justify-center h-48 gap-3 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-[14px]">Cargando cronograma…</span>
    </div>
  )

  return (
    <div>
      {/* Barra superior */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[13px] font-semibold text-muted-foreground">
            Total de clases: <span className="text-foreground font-bold">{clases.length}</span>
          </div>
          {/* Cobertura */}
          <div className="flex items-center gap-2 bg-background border border-border rounded-full px-3 py-1.5">
            <div className="h-2 w-16 rounded-full bg-border overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${cobertura}%` }} />
            </div>
            <span className="text-[12px] font-semibold text-primary">{cobertura}% cubierto</span>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <button
            onClick={handleFechasAuto}
            className="flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-border bg-card px-3 py-2 text-[12px] font-semibold transition-colors hover:bg-background sm:w-auto"
          >
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" /> Fechas automáticas
          </button>
          <button
            onClick={() => setShowAutoWarn(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-[8px] border border-border bg-card px-3 py-2 text-[12px] font-semibold transition-colors hover:bg-background sm:w-auto"
          >
            <Shuffle className="w-3.5 h-3.5 text-muted-foreground" /> Autorelleno
          </button>
          {saveStatus === "saving_silent" && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground animate-pulse">
              Guardando...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-green-600">
              <Check className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || saveStatus === "saving_silent"}
            className="flex w-full items-center justify-center gap-1.5 rounded-[8px] bg-primary px-4 py-2 text-[12px] font-bold text-white transition-colors hover:bg-pink-dark disabled:opacity-60 sm:w-auto"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bookmark className="w-3.5 h-3.5" />}
            Guardar
          </button>
        </div>
      </div>

      {/* Advertencia autorelleno */}
      {showAutoWarn && (
        <div className="mb-4 flex items-start gap-3 rounded-[12px] border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-[13px] font-bold text-amber-900 mb-1">¿Usar autorelleno?</p>
            <p className="text-[12px] text-amber-800 leading-snug mb-3">
              El autorelleno distribuye los OA de forma <strong>aleatoria</strong>, sin intención pedagógica. Se recomienda distribuir manualmente para mejor resultado.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button onClick={handleAutorelleno} className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-amber-600">
                Autorrellenar igual
              </button>
              <button onClick={() => setShowAutoWarn(false)} className="rounded-lg px-3 py-1.5 text-[11px] text-amber-800 hover:bg-amber-100">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Matriz */}
      <div className="bg-card border border-border rounded-[14px] overflow-hidden">

        {/* Paginación horizontal */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-background border-b border-border px-4 py-2">
          <button
            onClick={() => setColOffset(o => Math.max(0, o - COLS_VISIBLE))}
            disabled={colOffset === 0}
            className="w-7 h-7 rounded-lg border border-border grid place-items-center text-muted-foreground hover:bg-card transition-colors disabled:opacity-30"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[12px] text-muted-foreground font-medium">
            Mostrando clases {colOffset + 1}–{Math.min(colOffset + COLS_VISIBLE, clases.length)} de {clases.length}
          </span>
          <button
            onClick={() => setColOffset(o => Math.min(clases.length - COLS_VISIBLE, o + COLS_VISIBLE))}
            disabled={colOffset + COLS_VISIBLE >= clases.length}
            className="w-7 h-7 rounded-lg border border-border grid place-items-center text-muted-foreground hover:bg-card transition-colors disabled:opacity-30"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead>
              <tr className="bg-background">
                {/* Header OA column */}
                <th className="px-4 py-3 text-left text-[11px] font-bold text-muted-foreground uppercase tracking-wide border-b border-r border-border min-w-[220px] sticky left-0 bg-background z-10">
                  OA / Objetivo
                </th>
                {/* Header clases */}
                {clasesVisibles.map(clase => (
                  <th key={clase.numero} className="border-b border-r border-border last:border-r-0 min-w-[110px]">
                    <div className="px-2 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-bold text-primary">
                          Clase {clase.numero}
                        </span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => duplicarClase(clase.numero)}
                            title="Duplicar clase"
                            className="p-0.5 rounded hover:bg-border text-muted-foreground transition-colors"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      {/* Fecha editable */}
                      {editFecha === clase.numero ? (
                        <div className="flex gap-1">
                          <input
                            type="date"
                            autoFocus
                            onChange={e => setFechaTemp(e.target.value)}
                            onBlur={() => guardarFecha(clase.numero)}
                            onKeyDown={e => { if (e.key === "Enter") guardarFecha(clase.numero); if (e.key === "Escape") setEditFecha(null) }}
                            className="w-full text-[10px] border border-primary rounded px-1 py-0.5 outline-none"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditFecha(clase.numero); setFechaTemp("") }}
                          className={cn(
                            "text-[11px] rounded px-1.5 py-0.5 transition-colors w-full text-left",
                            clase.fecha
                              ? "text-foreground font-medium hover:bg-background"
                              : "text-muted-foreground hover:bg-background italic"
                          )}
                        >
                          {clase.fecha ? formatFechaCorta(clase.fecha) : "Fecha"}
                        </button>
                      )}
                      {/* Botón ir a actividad */}
                      <Link
                        href={buildUrl(
                          "/actividades",
                          withAsignatura(
                            unidadCurricularId && unidadCurricularId !== unidadId
                              ? { curso, unidad: unidadCurricularId, unitIdLocal: unidadId, clase: String(clase.numero) }
                              : { curso, unidad: unidadId, clase: String(clase.numero) },
                            ASIGNATURA
                          )
                        )}
                        className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-primary hover:opacity-70 transition-opacity"
                      >
                        Ir a actividad <ArrowRight className="w-2.5 h-2.5" />
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {oasSeleccionados.length === 0 ? (
                <tr>
                  <td colSpan={COLS_VISIBLE + 1} className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                    No hay OA seleccionados. Ve a la pestaña <strong>Unidad</strong> y selecciona los OA primero.
                  </td>
                </tr>
              ) : (
                oasSeleccionados.map((oa, oaIdx) => (
                  <tr key={oa.id} className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors">
                    {/* Celda OA */}
                    <td className="px-4 py-3 border-r border-border sticky left-0 bg-card z-10">
                      <div className="flex items-start gap-2">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: UNIT_COLORS[oaIdx % UNIT_COLORS.length] }} />
                        <div className="min-w-0">
                          <span className="text-[12px] font-bold" style={{ color: UNIT_COLORS[oaIdx % UNIT_COLORS.length] }}>
                            {oa.esPropio ? "Propio" : `OA ${oa.numero}`}
                          </span>
                          <p className="text-[11px] text-muted-foreground leading-snug truncate max-w-[170px]">
                            {oa.descripcion.substring(0, 55)}{oa.descripcion.length > 55 ? "…" : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Celdas de clase */}
                    {clasesVisibles.map(clase => {
                      const marcado = clase.oaIds.includes(oa.id)
                      return (
                        <td
                          key={clase.numero}
                          onClick={() => toggleOA(clase.numero, oa.id)}
                          className={cn(
                            "border-r border-border last:border-r-0 text-center cursor-pointer transition-colors",
                            marcado ? "bg-pink-light/40" : "hover:bg-background"
                          )}
                        >
                          <div className="flex items-center justify-center h-12">
                            {marcado && (
                              <div
                                className="w-4 h-4 rounded-full"
                                style={{ background: UNIT_COLORS[oaIdx % UNIT_COLORS.length] }}
                              />
                            )}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leyenda */}
      <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
        <span>Haz clic en una celda para asignar/quitar un OA de esa clase.</span>
        <span className="flex items-center gap-1.5">
          <div className="w-3.5 h-3.5 rounded-full bg-primary" /> OA asignado
        </span>
      </div>
    </div>
  )
}
