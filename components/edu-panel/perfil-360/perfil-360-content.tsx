"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import {
  Activity, BookOpen, ClipboardCheck, Loader2, UserRound, Users,
  Plus, MessageSquare, TrendingUp, ShieldCheck, ChevronDown, ChevronUp, Target, AlertTriangle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { cargarHorarioSemanal } from "@/lib/horario"
import { cargarEstudiantes, compareEstudiantes } from "@/lib/estudiantes"
import { listarLibroClasesCurso, userDoc, cargarObservaciones360, guardarObservaciones360 } from "@/lib/curriculo"
import type { Observacion360 } from "@/lib/curriculo"
import { getDoc } from "firebase/firestore"
import { evaluarAlumno } from "@/lib/alertas"

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

function buildCalifId(asignatura: string, curso: string) {
  return (`calif_${asignatura}_${curso}`)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function calcPromedio(notas: Record<string, string>) {
  const vals = Object.values(notas).map((v) => parseFloat(v)).filter((v) => !Number.isNaN(v))
  if (!vals.length) return null
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
}

const OBS_TIPOS: { key: Observacion360["tipo"]; label: string; cls: string }[] = [
  { key: "academica", label: "Académica", cls: "bg-status-blue-bg text-status-blue-text border-status-blue-border" },
  { key: "conductual", label: "Conductual", cls: "bg-status-amber-bg text-status-amber-text border-status-amber-border" },
  { key: "pie", label: "PIE", cls: "bg-status-pie-bg text-status-pie-text border-status-pie-border" },
  { key: "general", label: "General", cls: "bg-status-slate-bg text-status-slate-text border-status-slate-border" },
]

function MiniSparkline({ notas }: { notas: Record<string, string> }) {
  const vals = Object.values(notas).map(v => parseFloat(v)).filter(v => !isNaN(v))
  if (vals.length < 2) return null
  const w = 160, h = 48, pad = 8
  const min = 1, max = 7
  const points = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (w - pad * 2),
    y: pad + ((max - v) / (max - min)) * (h - pad * 2),
  }))
  const lineY = pad + ((max - 4.0) / (max - min)) * (h - pad * 2)
  return (
    <svg width={w} height={h} className="block">
      <line x1={pad} y1={lineY} x2={w - pad} y2={lineY} stroke="var(--status-amber-border)" strokeWidth="1" strokeDasharray="4 3" />
      <polyline fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
        points={points.map(p => `${p.x},${p.y}`).join(" ")} />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="var(--primary)" />
      ))}
      <text x={w - pad} y={lineY - 4} textAnchor="end" fontSize="8" fill="var(--muted-foreground)">4.0</text>
    </svg>
  )
}

export function Perfil360Content() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const searchParams = useSearchParams()
  const cursoParam = searchParams.get("curso")
  const alumnoParam = searchParams.get("alumno")
  const [curso, setCurso] = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [estudiantes, setEstudiantes] = useState<EstudianteVista[]>([])
  const [evaluacionesCalif, setEvaluacionesCalif] = useState<EvaluacionPerfil[]>([])
  const [selectedId, setSelectedId] = useState<string>("")

  // Observaciones
  const [observaciones, setObservaciones] = useState<Observacion360[]>([])
  const [loadingObs, setLoadingObs] = useState(false)
  const [newObsTexto, setNewObsTexto] = useState("")
  const [newObsTipo, setNewObsTipo] = useState<Observacion360["tipo"]>("general")
  const [showObsForm, setShowObsForm] = useState(false)

  // Secciones colapsables
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    resumen: true, asistencia: true, observaciones: true, rendimientoOa: true, pie: true
  })
  const toggleSection = (key: string) => setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }))

  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (unique.length > 0) setCurso(cursoParam && unique.includes(cursoParam) ? cursoParam : unique[0])
    })
  }, [cursoParam])

  useEffect(() => {
    if (!curso) return
    setLoading(true)
    Promise.all([
      listarLibroClasesCurso(ASIGNATURA, curso),
      getDoc(userDoc("calificaciones", buildCalifId(ASIGNATURA, curso))),
      cargarEstudiantes(curso),
    ]).then(([libros, califSnap, estDocs]) => {
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
          id: est.id,
          nombre: est.nombre,
          orden: est.orden,
          promedio: null,
          promedioClase: null,
          porcentajeAsistencia: null,
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

      for (const libro of libros) {
        for (const bloque of libro.bloques) {
          for (const a of bloque.asistencia) {
            const vista = mapa.get(a.nombre)
            if (vista) {
              vista.asistencia[a.estado] += 1
            }
          }
        }
      }

      // Promedio de clase y % asistencia
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
    }).catch((error) => {
      console.error("Error cargando perfil 360", error)
      setEstudiantes([])
      setSelectedId("")
    }).finally(() => setLoading(false))
  }, [curso, ASIGNATURA])

  // Cargar observaciones cuando cambia el estudiante
  useEffect(() => {
    if (!selectedId || !curso) { setObservaciones([]); return }
    setLoadingObs(true)
    cargarObservaciones360(ASIGNATURA, curso, selectedId)
      .then(setObservaciones)
      .catch(() => setObservaciones([]))
      .finally(() => setLoadingObs(false))
  }, [selectedId, curso, ASIGNATURA])

  const agregarObservacion = async () => {
    if (!newObsTexto.trim() || !selectedId) return
    const nueva: Observacion360 = {
      id: `obs_${Date.now()}`,
      texto: newObsTexto.trim(),
      fecha: new Date().toISOString().slice(0, 10),
      tipo: newObsTipo,
    }
    const updated = [nueva, ...observaciones]
    setObservaciones(updated)
    setNewObsTexto("")
    setShowObsForm(false)
    await guardarObservaciones360(ASIGNATURA, curso, selectedId, updated).catch(console.error)
  }

  const seleccionado = useMemo(() => estudiantes.find((e) => e.id === selectedId) || null, [estudiantes, selectedId])

  const rendimientoPorOA = useMemo(() => {
    if (!seleccionado) return []
    const acc = new Map<string, { oaId: string; suma: number; total: number; evaluaciones: string[] }>()
    evaluacionesCalif.forEach((evaluacion) => {
      if (!evaluacion.oaIds?.length) return
      const nota = Number.parseFloat(seleccionado.notas[evaluacion.id])
      if (!Number.isFinite(nota)) return
      evaluacion.oaIds.forEach((oaId) => {
        const current = acc.get(oaId) || { oaId, suma: 0, total: 0, evaluaciones: [] }
        current.suma += nota
        current.total += 1
        current.evaluaciones.push(evaluacion.label)
        acc.set(oaId, current)
      })
    })
    return Array.from(acc.values())
      .map((item) => ({ ...item, promedio: Number((item.suma / item.total).toFixed(1)) }))
      .sort((a, b) => a.oaId.localeCompare(b.oaId, "es", { numeric: true }))
  }, [evaluacionesCalif, seleccionado])

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

  const delta = seleccionado?.promedio != null && seleccionado?.promedioClase != null
    ? Number((seleccionado.promedio - seleccionado.promedioClase).toFixed(1))
    : null

  return (
    <div>
      <div className="mb-5 sm:mb-6">
        <h1 className="text-[18px] sm:text-[22px] font-extrabold">Perfil 360 del estudiante</h1>
        <p className="text-[12px] sm:text-[13px] text-muted-foreground mt-1">Vista consolidada de asistencia, rendimiento y observaciones.</p>
      </div>

      <div className="bg-card border border-border rounded-[14px] p-5 mb-5 flex flex-wrap gap-4 items-end">
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Curso</label>
          <select value={curso} onChange={(e) => setCurso(e.target.value)} className="w-full rounded-[10px] border border-border px-3.5 py-2.5 text-[13px] font-semibold bg-background sm:min-w-[180px]">
            {cursosDisponibles.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Estudiante</label>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className="w-full rounded-[10px] border border-border px-3.5 py-2.5 text-[13px] font-semibold bg-background sm:min-w-[260px]">
            {estudiantes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.orden != null ? `${e.orden}. ` : ""}{e.nombre}{e.pie ? " (PIE)" : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading || !curso ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Cargando {curso ? "perfil" : "cursos"}…</div>
      ) : !seleccionado ? (
        <div className="bg-card border border-border rounded-[14px] p-8 text-[13px] text-muted-foreground text-center">Aún no hay datos para este curso. Agrega estudiantes en Mi Perfil.</div>
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-5">
          {/* Sidebar — Tarjeta del estudiante */}
          <div className="bg-card border border-border rounded-[16px] p-5">
            <div className="w-14 h-14 rounded-full bg-pink-light text-primary grid place-items-center font-extrabold text-xl mb-4">
              {seleccionado.nombre.slice(0, 1)}
            </div>
            <h2 className="text-[18px] font-extrabold">{seleccionado.nombre}</h2>
            <p className="text-[13px] text-muted-foreground mt-1">{curso} · {ASIGNATURA}</p>

            {seleccionado.pie && (
              <div className="mt-3 rounded-lg bg-status-pie-bg/50 border border-status-pie-border px-3 py-2">
                <span className="text-[11px] font-bold text-status-pie-text">
                  PIE{seleccionado.pieDiagnostico ? ` · ${seleccionado.pieDiagnostico}` : ""}
                </span>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-[12px] bg-background p-3 border border-border">
                <div className="text-[11px] text-muted-foreground">Promedio</div>
                <div className={cn("text-[18px] font-extrabold mt-1",
                  seleccionado.promedio == null ? "text-muted-foreground"
                    : seleccionado.promedio >= 4.0 ? "text-status-blue-text" : "text-status-red-text"
                )}>
                  {seleccionado.promedio ?? "—"}
                </div>
                {delta !== null && (
                  <div className={cn("text-[10px] font-bold mt-0.5",
                    delta >= 0 ? "text-status-green-text" : "text-status-red-text"
                  )}>
                    {delta >= 0 ? "+" : ""}{delta} vs clase
                  </div>
                )}
              </div>
              <div className="rounded-[12px] bg-background p-3 border border-border">
                <div className="text-[11px] text-muted-foreground">Asistencia</div>
                <div className={cn("text-[18px] font-extrabold mt-1",
                  seleccionado.porcentajeAsistencia == null ? "text-muted-foreground"
                    : seleccionado.porcentajeAsistencia >= 85 ? "text-status-green-text"
                    : seleccionado.porcentajeAsistencia >= 70 ? "text-status-amber-text"
                    : "text-status-red-text"
                )}>
                  {seleccionado.porcentajeAsistencia != null ? `${seleccionado.porcentajeAsistencia}%` : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {Object.values(seleccionado.asistencia).reduce((a, b) => a + b, 0)} registros
                </div>
              </div>
            </div>

            {/* Sparkline */}
            {Object.keys(seleccionado.notas).length >= 2 && (
              <div className="mt-4 rounded-[12px] bg-background p-3 border border-border">
                <div className="text-[11px] text-muted-foreground mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3" /> Tendencia de notas
                </div>
                <MiniSparkline notas={seleccionado.notas} />
              </div>
            )}
          </div>

          {/* Panel derecho — Secciones */}
          <div className="flex flex-col gap-4">
            {alertas.length > 0 && (
              <div className="grid gap-3">
                {alertas.map((alerta) => (
                  <div key={alerta.id} className={cn(
                    "rounded-[14px] border bg-card p-4",
                    alerta.severidad === "alta" ? "border-status-red-border border-t-4" : "border-status-amber-border border-t-4"
                  )}>
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "mt-0.5 rounded-lg p-2",
                        alerta.severidad === "alta" ? "bg-status-red-bg text-status-red-text" : "bg-status-amber-bg text-status-amber-text"
                      )}>
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-[14px] font-extrabold">{alerta.titulo}</h3>
                        <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{alerta.detalle}</p>
                        <p className="mt-2 text-[12px] font-semibold text-foreground">{alerta.accion}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Asistencia */}
            <div className="bg-card border border-border rounded-[16px] overflow-hidden">
              <button onClick={() => toggleSection("asistencia")} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors">
                <h3 className="text-[15px] font-extrabold flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Asistencia</h3>
                {expandedSections.asistencia ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {expandedSections.asistencia && (
                <div className="px-5 pb-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { icon: Users, label: "Presentes", value: seleccionado.asistencia.presente, cls: "bg-status-green-bg text-status-green-text" },
                      { icon: Activity, label: "Ausentes", value: seleccionado.asistencia.ausente, cls: "bg-status-red-bg text-status-red-text" },
                      { icon: ClipboardCheck, label: "Atrasos", value: seleccionado.asistencia.atraso, cls: "bg-status-amber-bg text-status-amber-text" },
                      { icon: BookOpen, label: "Retirados", value: seleccionado.asistencia.retirado, cls: "bg-status-slate-bg text-status-slate-text" },
                    ].map((item) => {
                      const Icon = item.icon
                      return (
                        <div key={item.label} className="rounded-[12px] border border-border p-3 flex items-center gap-3">
                          <div className={cn("w-9 h-9 rounded-lg grid place-items-center", item.cls)}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-[10px] text-muted-foreground">{item.label}</div>
                            <div className="text-[16px] font-extrabold">{item.value}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Rendimiento por OA */}
            <div className="bg-card border border-border rounded-[16px] overflow-hidden">
              <button onClick={() => toggleSection("rendimientoOa")} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors">
                <h3 className="text-[15px] font-extrabold flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" /> Rendimiento por OA
                  {rendimientoPorOA.length > 0 && (
                    <span className="text-[11px] font-semibold text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">{rendimientoPorOA.length}</span>
                  )}
                </h3>
                {expandedSections.rendimientoOa ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {expandedSections.rendimientoOa && (
                <div className="px-5 pb-5">
                  {rendimientoPorOA.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground">Aun no hay evaluaciones vinculadas a OAs para este estudiante.</p>
                  ) : (
                    <div className="space-y-3">
                      {rendimientoPorOA.map((item) => {
                        const color = item.promedio < 4
                          ? "bg-status-red-text"
                          : item.promedio < 5.5
                            ? "bg-status-amber-text"
                            : "bg-status-green-text"
                        return (
                          <div key={item.oaId} className="rounded-[12px] border border-border bg-background p-3">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[13px] font-bold">{item.oaId}</div>
                                <div className="truncate text-[11px] text-muted-foreground">{item.evaluaciones.join(", ")}</div>
                              </div>
                              <span className={cn("text-[15px] font-extrabold", item.promedio < 4 ? "text-status-red-text" : item.promedio < 5.5 ? "text-status-amber-text" : "text-status-green-text")}>
                                {item.promedio.toFixed(1)}
                              </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-muted">
                              <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, Math.max(0, (item.promedio / 7) * 100))}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Observaciones */}
            <div className="bg-card border border-border rounded-[16px] overflow-hidden">
              <button onClick={() => toggleSection("observaciones")} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors">
                <h3 className="text-[15px] font-extrabold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" /> Observaciones
                  {observaciones.length > 0 && (
                    <span className="text-[11px] font-semibold text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">{observaciones.length}</span>
                  )}
                </h3>
                {expandedSections.observaciones ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {expandedSections.observaciones && (
                <div className="px-5 pb-5">
                  {/* Botón agregar */}
                  {!showObsForm ? (
                    <button onClick={() => setShowObsForm(true)} className="mb-4 flex items-center gap-2 rounded-[10px] border border-dashed border-border px-4 py-2.5 text-[13px] font-semibold text-muted-foreground hover:border-primary hover:text-primary transition-colors w-full justify-center">
                      <Plus className="w-4 h-4" /> Agregar observación
                    </button>
                  ) : (
                    <div className="mb-4 rounded-[12px] border border-border p-4 bg-background space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {OBS_TIPOS.map(t => (
                          <button key={t.key} onClick={() => setNewObsTipo(t.key)}
                            className={cn("rounded-full px-3 py-1 text-[11px] font-bold border transition-colors",
                              newObsTipo === t.key ? t.cls : "border-border text-muted-foreground hover:border-primary"
                            )}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={newObsTexto}
                        onChange={e => setNewObsTexto(e.target.value)}
                        placeholder="Escribe la observación..."
                        rows={3}
                        className="w-full rounded-[10px] border border-border px-3 py-2.5 text-[13px] outline-none focus:border-primary bg-card"
                        autoFocus
                      />
                      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <button onClick={() => { setShowObsForm(false); setNewObsTexto("") }} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-muted/30 transition-colors">Cancelar</button>
                        <button onClick={agregarObservacion} disabled={!newObsTexto.trim()} className="rounded-[10px] bg-primary px-5 py-2 text-[13px] font-bold text-primary-foreground hover:bg-pink-dark transition-colors disabled:opacity-40">Guardar</button>
                      </div>
                    </div>
                  )}

                  {/* Lista */}
                  {loadingObs ? (
                    <div className="flex items-center gap-2 text-muted-foreground py-4 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Cargando…</div>
                  ) : observaciones.length === 0 ? (
                    <p className="text-[13px] text-muted-foreground text-center py-4">Sin observaciones registradas.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {observaciones.map(obs => {
                        const tipoInfo = OBS_TIPOS.find(t => t.key === obs.tipo) || OBS_TIPOS[3]
                        return (
                          <div key={obs.id} className="rounded-[12px] border border-border p-3.5">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold border", tipoInfo.cls)}>{tipoInfo.label}</span>
                              <span className="text-[11px] text-muted-foreground">{obs.fecha}</span>
                            </div>
                            <p className="text-[13px] leading-relaxed">{obs.texto}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* PIE — Solo si el estudiante es PIE */}
            {seleccionado.pie && (
              <div className="bg-card border border-status-pie-border rounded-[16px] overflow-hidden">
                <button onClick={() => toggleSection("pie")} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/20 transition-colors">
                  <h3 className="text-[15px] font-extrabold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-status-amber-text" /> Ficha PIE</h3>
                  {expandedSections.pie ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.pie && (
                  <div className="px-5 pb-5 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="rounded-[12px] bg-status-pie-bg/30 border border-status-pie-border/50 p-3">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Diagnóstico</div>
                        <div className="text-[14px] font-bold">{seleccionado.pieDiagnostico || "No especificado"}</div>
                      </div>
                      <div className="rounded-[12px] bg-status-pie-bg/30 border border-status-pie-border/50 p-3">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Especialista</div>
                        <div className="text-[14px] font-bold">{seleccionado.pieEspecialista || "No asignado"}</div>
                      </div>
                    </div>
                    {seleccionado.pieNotas && (
                      <div className="rounded-[12px] bg-status-pie-bg/30 border border-status-pie-border/50 p-3">
                        <div className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Notas de adecuación</div>
                        <p className="text-[13px] leading-relaxed">{seleccionado.pieNotas}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
