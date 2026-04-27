"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Download, Plus, Bookmark, Info, Loader2, Check, X, AlertCircle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, BarChart3 } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"
import { userDoc } from "@/lib/curriculo"
import { setDoc, getDoc, serverTimestamp } from "firebase/firestore"
import { cargarHorarioSemanal } from "@/lib/horario"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { useActiveSubject } from "@/hooks/use-active-subject"

interface EstudianteCalif {
  id: string
  name: string
  orden?: number
  notas: Record<string, string>
  hasPie: boolean
  pieDiagnostico?: string
}

interface Evaluacion {
  id: string
  label: string
  tipo: "sumativa" | "formativa"
  periodo: "s1" | "s2"
}

function buildId(asignatura: string, curso: string) {
  return ("calif_" + asignatura + "_" + curso)
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

export function CalificacionesContent() {
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [curso, setCurso]                       = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [activeTab, setActiveTab]               = useState<"sumativas" | "formativas">("sumativas")
  const [periodo, setPeriodo]                   = useState<"s1" | "s2" | "anual">("anual")
  const [estudiantes, setEstudiantes]           = useState<EstudianteCalif[]>([])
  const [evaluaciones, setEvaluaciones]         = useState<Evaluacion[]>([])
  const [loading, setLoading]                   = useState(true)
  const [saving, setSaving]                     = useState(false)
  const [saveStatus, setSaveStatus]             = useState<"idle" | "saving_silent" | "saved" | "error">("idle")
  const [showAddEval, setShowAddEval]           = useState(false)
  const [newEvalLabel, setNewEvalLabel]         = useState("")

  // Cargar cursos disponibles
  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (unique.length > 0) setCurso(unique[0])
    })
  }, [])

  // Cargar desde Firestore cuando cambia el curso
  useEffect(() => {
    if (!curso) return
    setLoading(true)
    const id = buildId(ASIGNATURA, curso)
    Promise.all([
      getDoc(userDoc("calificaciones", id)),
      cargarEstudiantes(curso)
    ]).then(([snap, estDocs]) => {
      if (snap.exists()) {
        const data = snap.data()
        const notasEstudiantes = data.estudiantes || []
        const merged: EstudianteCalif[] = estDocs.map((est) => {
          const old = notasEstudiantes.find((o: any) => o.id === est.id || o.name === est.nombre)
          return {
            id: est.id,
            name: est.nombre,
            orden: est.orden,
            notas: old ? old.notas : {},
            hasPie: est.pie === true,
            pieDiagnostico: est.pieDiagnostico || "",
          }
        })
        setEstudiantes(merged)
        // Retrocompatibilidad: evaluaciones sin tipo/periodo
        const evals: Evaluacion[] = (data.evaluaciones || []).map((ev: any) => ({
          id: ev.id,
          label: ev.label,
          tipo: ev.tipo || "sumativa",
          periodo: ev.periodo || "s1",
        }))
        setEvaluaciones(evals.length > 0 ? evals : [{ id: "n1", label: "N1", tipo: "sumativa", periodo: "s1" }])
      } else {
        const initial: EstudianteCalif[] = estDocs.map((est) => ({
          id: est.id,
          name: est.nombre,
          orden: est.orden,
          notas: {},
          hasPie: est.pie === true,
          pieDiagnostico: est.pieDiagnostico || "",
        }))
        setEstudiantes(initial)
        setEvaluaciones([{ id: "n1", label: "N1", tipo: "sumativa", periodo: "s1" }])
      }
    }).catch(e => {
      console.error(e)
    }).finally(() => {
      setLoading(false)
      ignoreNextSaveRef.current = true
    })
  }, [curso, ASIGNATURA])

  const ignoreNextSaveRef = useRef(true)
  useEffect(() => {
    if (loading) return
    if (ignoreNextSaveRef.current) {
      ignoreNextSaveRef.current = false
      return
    }
    setSaveStatus("saving_silent")
    const timer = setTimeout(() => {
      handleGuardar(true)
    }, 2500)
    return () => clearTimeout(timer)
  }, [estudiantes, evaluaciones])

  const handleGuardar = async (isAutoSave = false) => {
    if (!isAutoSave) setSaving(true)
    try {
      const id = buildId(ASIGNATURA, curso)
      await setDoc(userDoc("calificaciones", id), {
        asignatura: ASIGNATURA, curso, estudiantes, evaluaciones,
        updatedAt: serverTimestamp()
      })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 7000)
    } finally {
      if (!isAutoSave) setSaving(false)
    }
  }

  // Atajo de teclado Ctrl+S / Cmd+S para guardar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleGuardar(false)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [curso, estudiantes, evaluaciones])

  const updateNota = (estudianteId: string, evalId: string, value: string) => {
    if (value !== "" && (isNaN(parseFloat(value)) || parseFloat(value) < 1 || parseFloat(value) > 7)) return
    setEstudiantes(prev => prev.map(e =>
      e.id === estudianteId ? { ...e, notas: { ...e.notas, [evalId]: value } } : e
    ))
  }

  const agregarEvaluacion = () => {
    if (!newEvalLabel.trim()) return
    const id = "eval_" + Date.now()
    const nuevaEval: Evaluacion = {
      id,
      label: newEvalLabel.trim(),
      tipo: activeTab === "sumativas" ? "sumativa" : "formativa",
      periodo: periodo === "anual" ? "s1" : periodo,
    }
    setEvaluaciones(prev => [...prev, nuevaEval])
    setEstudiantes(prev => prev.map(e => ({ ...e, notas: { ...e.notas, [id]: "" } })))
    setNewEvalLabel("")
    setShowAddEval(false)
  }

  const eliminarEvaluacion = (evalId: string) => {
    setEvaluaciones(prev => prev.filter(ev => ev.id !== evalId))
    setEstudiantes(prev => prev.map(e => {
      const { [evalId]: _, ...rest } = e.notas
      return { ...e, notas: rest }
    }))
  }

  const calcPromedio = (notas: Record<string, string>, evalIds?: string[]) => {
    const keys = evalIds || Object.keys(notas)
    const vals = keys.map(k => parseFloat(notas[k])).filter(v => !isNaN(v))
    if (vals.length === 0) return null
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  // Filtrar evaluaciones por tab y período
  const evaluacionesFiltradas = useMemo(() => {
    const tipoFiltro = activeTab === "sumativas" ? "sumativa" : "formativa"
    return evaluaciones.filter(ev => {
      const matchTipo = (ev.tipo || "sumativa") === tipoFiltro
      const matchPeriodo = periodo === "anual" ? true : (ev.periodo || "s1") === periodo
      return matchTipo && matchPeriodo
    })
  }, [evaluaciones, activeTab, periodo])

  // Stats basadas en TODAS las evaluaciones (no filtradas)
  const aprobados = estudiantes.filter(e => { const p = calcPromedio(e.notas); return p !== null && p >= 4.0 }).length
  const reprobados = estudiantes.filter(e => { const p = calcPromedio(e.notas); return p !== null && p < 4.0 }).length
  const sinNotas = estudiantes.filter(e => calcPromedio(e.notas) === null).length

  // Estadísticas avanzadas del curso (filtradas por evaluaciones visibles)
  const [showStats, setShowStats] = useState(false)
  const estadisticas = useMemo(() => {
    const evalIds = evaluacionesFiltradas.map(ev => ev.id)
    const notas = estudiantes
      .map(e => calcPromedio(e.notas, evalIds))
      .filter((n): n is number => n !== null)
    if (notas.length < 3) return null
    const sorted = [...notas].sort((a, b) => a - b)
    const promedio = notas.reduce((a, b) => a + b, 0) / notas.length
    const mid = Math.floor(sorted.length / 2)
    const mediana = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]
    const aprobadosFilt = notas.filter(n => n >= 4.0).length
    const tasaAprobacion = Math.round(aprobadosFilt / notas.length * 100)
    const buckets = [
      { rango: "1-2", min: 1, max: 2 },
      { rango: "2-3", min: 2, max: 3 },
      { rango: "3-4", min: 3, max: 4 },
      { rango: "4-5", min: 4, max: 5 },
      { rango: "5-6", min: 5, max: 6 },
      { rango: "6-7", min: 6, max: 7 },
      { rango: "7",   min: 7, max: 7.01 },
    ].map(b => ({
      rango: b.rango,
      cantidad: notas.filter(n => n >= b.min && n < b.max).length,
      aprueba: b.min >= 4,
    }))
    return { promedio, mediana, tasaAprobacion, buckets, total: notas.length }
  }, [estudiantes, evaluacionesFiltradas])

  // Tendencia por alumno (S1 vs S2) — solo relevante en modo anual
  const tendencias = useMemo(() => {
    if (periodo !== "anual") return {}
    const s1Ids = evaluaciones.filter(ev => (ev.periodo || "s1") === "s1").map(ev => ev.id)
    const s2Ids = evaluaciones.filter(ev => ev.periodo === "s2").map(ev => ev.id)
    if (s1Ids.length === 0 || s2Ids.length === 0) return {}
    const result: Record<string, "up" | "down" | "flat"> = {}
    for (const est of estudiantes) {
      const p1 = calcPromedio(est.notas, s1Ids)
      const p2 = calcPromedio(est.notas, s2Ids)
      if (p1 === null || p2 === null) continue
      result[est.id] = p2 - p1 > 0.3 ? "up" : p1 - p2 > 0.3 ? "down" : "flat"
    }
    return result
  }, [estudiantes, evaluaciones, periodo])

  const handleDescargar = () => {
    const header = ["N°", "Estudiante", "PIE", ...evaluaciones.map(e => e.label), "Promedio"]
    const rows = estudiantes.map((e, i) => {
      const prom = calcPromedio(e.notas)
      return [
        String(e.orden ?? i + 1),
        e.name,
        e.hasPie ? "Sí" : "No",
        ...evaluaciones.map(ev => e.notas[ev.id] || ""),
        prom !== null ? prom.toFixed(1) : "",
      ]
    })
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(",")).join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `calificaciones_${ASIGNATURA}_${curso}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const SELECT_STYLE = "w-full appearance-none rounded-[10px] border-[1.5px] border-primary bg-card px-3.5 py-2.5 pr-9 text-[13px] font-semibold text-foreground outline-none focus:shadow-[0_0_0_3px_color-mix(in srgb,var(--primary) 15%,transparent)] transition-shadow cursor-pointer sm:min-w-[180px]"
  const SELECT_ARROW = { backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' fill='none' viewBox='0 0 24 24' stroke='%23F03E6E' stroke-width='2'%3E%3Cpath d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }

  return (
    <div>
      <div className="flex items-center justify-between mb-7 flex-wrap gap-3 animate-fade-up">
        <h1 className="text-[22px] font-extrabold">Calificaciones</h1>
        <div className="flex items-center gap-2.5">
          {saveStatus === "saving_silent" && (
            <span className="flex items-center gap-1 text-[12px] font-semibold text-muted-foreground animate-pulse">
              Guardando...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1.5 text-[13px] font-semibold text-status-green-text">
              <Check className="w-4 h-4" /> Guardado
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1.5 rounded-lg bg-status-red-bg border border-status-red-border px-3 py-1.5 text-[13px] font-semibold text-status-red-text">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> Error al guardar
            </span>
          )}
          <button
            onClick={() => handleGuardar(false)}
            disabled={saving || saveStatus === "saving_silent"}
            className="flex items-center gap-2 rounded-[10px] bg-primary text-primary-foreground px-5 py-2.5 text-[13px] font-bold hover:bg-pink-dark transition-colors disabled:opacity-60"
          >
            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando…</> : <><Bookmark className="h-4 w-4" /> Guardar</>}
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-5 flex flex-wrap items-end gap-4 animate-fade-up">
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Asignatura</label>
          <select disabled className={cn(SELECT_STYLE, "opacity-70")} style={SELECT_ARROW}>
            <option>{ASIGNATURA}</option>
          </select>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Curso</label>
          <select value={curso} onChange={e => setCurso(e.target.value)} className={SELECT_STYLE} style={SELECT_ARROW}>
            {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex w-full flex-col gap-1.5 sm:w-auto">
          <label className="text-[11px] font-semibold text-muted-foreground">Período</label>
          <select
            value={periodo}
            onChange={e => setPeriodo(e.target.value as "s1" | "s2" | "anual")}
            className={SELECT_STYLE}
            style={SELECT_ARROW}
          >
            <option value="s1">Primer Semestre {new Date().getFullYear()}</option>
            <option value="s2">Segundo Semestre {new Date().getFullYear()}</option>
            <option value="anual">Anual</option>
          </select>
        </div>
      </div>

      {/* Resumen rápido */}
      {!loading && (
        <div className="mb-5 grid grid-cols-1 gap-3 animate-fade-up sm:grid-cols-3">
          <div className="bg-card border border-border rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-status-green-bg grid place-items-center">
              <span className="text-status-green-text font-bold text-sm">{aprobados}</span>
            </div>
            <div><div className="text-[11px] text-muted-foreground">Aprobados</div><div className="text-[13px] font-bold">{estudiantes.length > 0 ? Math.round(aprobados / estudiantes.length * 100) : 0}%</div></div>
          </div>
          <div className="bg-card border border-border rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-status-red-bg grid place-items-center">
              <span className="text-status-red-text font-bold text-sm">{reprobados}</span>
            </div>
            <div><div className="text-[11px] text-muted-foreground">Reprobados</div><div className="text-[13px] font-bold">{estudiantes.length > 0 ? Math.round(reprobados / estudiantes.length * 100) : 0}%</div></div>
          </div>
          <div className="bg-card border border-border rounded-[12px] p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-status-amber-bg grid place-items-center">
              <span className="text-status-amber-text font-bold text-sm">{sinNotas}</span>
            </div>
            <div><div className="text-[11px] text-muted-foreground">Sin notas</div><div className="text-[13px] font-bold">{estudiantes.length} total</div></div>
          </div>
        </div>
      )}

      {/* Panel de estadísticas del curso */}
      {estadisticas && (
        <div className="mb-5 rounded-[14px] border border-border bg-card overflow-hidden animate-fade-up">
          <button
            onClick={() => setShowStats(s => !s)}
            className="flex w-full items-center justify-between px-5 py-3.5 hover:bg-background transition-colors"
          >
            <div className="flex items-center gap-2 text-[13px] font-bold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Estadísticas del curso
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{estadisticas.total} notas</span>
            </div>
            {showStats ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {showStats && (
            <div className="border-t border-border px-5 py-4">
              <div className="flex flex-wrap gap-4">
                {/* Pills de métricas */}
                <div className="flex flex-wrap gap-3 items-center">
                  <div className="flex flex-col items-center rounded-[10px] border border-border bg-background px-4 py-3 min-w-[80px]">
                    <span className="text-[11px] text-muted-foreground mb-1">Promedio</span>
                    <span className={cn("text-[20px] font-extrabold", estadisticas.promedio >= 4 ? "text-status-blue-text" : "text-status-red-text")}>
                      {estadisticas.promedio.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center rounded-[10px] border border-border bg-background px-4 py-3 min-w-[80px]">
                    <span className="text-[11px] text-muted-foreground mb-1">Mediana</span>
                    <span className={cn("text-[20px] font-extrabold", estadisticas.mediana >= 4 ? "text-status-blue-text" : "text-status-red-text")}>
                      {estadisticas.mediana.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center rounded-[10px] border border-border bg-background px-4 py-3 min-w-[80px]">
                    <span className="text-[11px] text-muted-foreground mb-1">Aprobación</span>
                    <span className={cn("text-[20px] font-extrabold", estadisticas.tasaAprobacion >= 60 ? "text-status-green-text" : "text-status-red-text")}>
                      {estadisticas.tasaAprobacion}%
                    </span>
                  </div>
                </div>
                {/* Histograma */}
                <div className="flex-1 min-w-[200px] h-[100px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={estadisticas.buckets} barCategoryGap="20%">
                      <XAxis dataKey="rango" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis hide allowDecimals={false} />
                      <Tooltip
                        formatter={(val: number) => [`${val} estudiante${val !== 1 ? "s" : ""}`, ""]}
                        labelFormatter={(l: string) => `Notas ${l}`}
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                      />
                      <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
                        {estadisticas.buckets.map((b, i) => (
                          <Cell key={i} fill={b.aprueba ? "var(--status-green-text)" : b.rango === "3-4" ? "var(--status-amber-text)" : "var(--status-red-text)"} fillOpacity={0.75} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Botones de acción */}
      <div className="mb-5 flex flex-wrap gap-2.5 animate-fade-up">
        <button
          onClick={handleDescargar}
          disabled={estudiantes.length === 0}
          className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-card px-4 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="h-[15px] w-[15px]" /> Descargar resumen
        </button>
        <button
          onClick={() => setShowAddEval(true)}
          className="flex items-center gap-2 rounded-[10px] border-[1.5px] border-primary bg-card px-4 py-2.5 text-[13px] font-semibold text-primary transition-all hover:bg-primary hover:text-primary-foreground"
        >
          <Plus className="h-[15px] w-[15px]" /> Agregar evaluación
        </button>
      </div>

      {/* Banner info */}
      <div className="mb-6 flex items-start gap-3 rounded-[10px] border-l-4 border-status-blue-border bg-status-blue-bg p-4 text-[13px] leading-snug text-status-blue-text animate-fade-up">
        <Info className="mt-0.5 h-[18px] w-[18px] flex-shrink-0" />
        <span>Haz clic en cualquier celda de nota para editarla. Notas entre 1.0 y 7.0. Presiona <strong>Tab</strong> para avanzar al siguiente estudiante.</span>
      </div>

      {/* Tabs */}
      <div className="mb-0 flex overflow-x-auto border-b-2 border-border animate-fade-up">
        {(["sumativas", "formativas"] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={cn("-mb-[2px] whitespace-nowrap border-b-2 px-5 py-2.5 text-[13px] font-semibold transition-colors capitalize",
              activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}>
            Evaluaciones {tab}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading || !curso ? (
        <div className="flex items-center gap-3 text-muted-foreground py-12 justify-center border border-t-0 border-border rounded-b-[14px]">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-[14px]">Cargando calificaciones {curso ? `de ${curso}` : ""}…</span>
        </div>
      ) : evaluacionesFiltradas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 border border-t-0 border-border rounded-b-[14px] bg-card">
          <p className="text-[14px] text-muted-foreground">
            No hay evaluaciones {activeTab} {periodo !== "anual" ? `en ${periodo === "s1" ? "primer" : "segundo"} semestre` : ""}.
          </p>
          <button
            onClick={() => setShowAddEval(true)}
            className="flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-bold text-primary-foreground hover:bg-pink-dark transition-colors"
          >
            <Plus className="h-4 w-4" /> Agregar evaluación {activeTab === "sumativas" ? "sumativa" : "formativa"}
          </button>
        </div>
      ) : (
        <div className="scroll-hint-x rounded-b-2xl border border-t-0 border-border animate-fade-up">
          <div className="overflow-x-auto bg-card rounded-b-2xl">
          <table className="w-full border-collapse" style={{ minWidth: `${300 + evaluacionesFiltradas.length * 90}px` }}>
            <thead>
              <tr className="bg-background">
                <th className="whitespace-nowrap border-b border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground w-8">N°</th>
                <th className="sticky left-0 z-10 bg-background whitespace-nowrap border-b border-r border-border px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-muted-foreground min-w-[180px]">Estudiante</th>
                {evaluacionesFiltradas.map(ev => (
                  <th key={ev.id} className="whitespace-nowrap border-b border-border px-4 py-3 text-center">
                    <div className="inline-flex items-center gap-1">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">
                        {ev.label}
                      </span>
                      <button
                        onClick={() => eliminarEvaluacion(ev.id)}
                        title={`Eliminar ${ev.label}`}
                        className="rounded p-0.5 text-muted-foreground hover:text-status-red-text hover:bg-status-red-bg transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </th>
                ))}
                {periodo === "anual" && Object.keys(tendencias).length > 0 && (
                  <th className="whitespace-nowrap border-b border-border px-4 py-3 text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">Tendencia</th>
                )}
                <th className="whitespace-nowrap border-b border-border px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-muted-foreground">Promedio</th>
              </tr>
            </thead>
            <tbody>
              {estudiantes.map((estudiante, idx) => {
                const evalIds = evaluacionesFiltradas.map(ev => ev.id)
                const prom = calcPromedio(estudiante.notas, evalIds)
                return (
                  <tr key={estudiante.id} className={cn(
                    "border-b border-border transition-colors last:border-b-0 hover:bg-muted/30",
                    estudiante.hasPie && "bg-status-pie-bg/30"
                  )}>
                    <td className="px-4 py-3 text-[13px] text-muted-foreground">{estudiante.orden ?? idx + 1}</td>
                    <td className="sticky left-0 z-10 bg-card border-r border-border px-4 py-3 text-[13px]">
                      <span className="font-medium">{estudiante.name}</span>
                      {estudiante.hasPie && (
                        <span className="ml-2 inline-block rounded bg-status-pie-bg px-1.5 py-0.5 align-middle text-[10px] font-bold text-status-pie-text border border-status-pie-border">
                          PIE{estudiante.pieDiagnostico ? ` · ${estudiante.pieDiagnostico}` : ""}
                        </span>
                      )}
                    </td>
                    {evaluacionesFiltradas.map(ev => (
                      <td key={ev.id} className="px-2 py-2 text-center">
                        <input
                          type="number"
                          min="1" max="7" step="0.1"
                          value={estudiante.notas[ev.id] || ""}
                          onChange={e => updateNota(estudiante.id, ev.id, e.target.value)}
                          className={cn(
                            "w-16 rounded-lg border-[1.5px] px-2 py-1.5 text-center text-[13px] font-bold outline-none transition-colors focus:border-primary",
                            estudiante.notas[ev.id]
                              ? parseFloat(estudiante.notas[ev.id]) >= 4.0
                                ? "border-status-green-border text-status-blue-text bg-status-blue-bg"
                                : "border-status-red-border text-status-red-text bg-status-red-bg"
                              : "border-border text-muted-foreground bg-background"
                          )}
                          placeholder="—"
                        />
                      </td>
                    ))}
                    {periodo === "anual" && Object.keys(tendencias).length > 0 && (
                      <td className="px-4 py-3 text-center">
                        {tendencias[estudiante.id] === "up" && (
                          <span title="Mejorando">
                            <TrendingUp className="inline h-4 w-4 text-status-green-text" />
                          </span>
                        )}
                        {tendencias[estudiante.id] === "down" && (
                          <span title="Bajando">
                            <TrendingDown className="inline h-4 w-4 text-status-red-text" />
                          </span>
                        )}
                        {tendencias[estudiante.id] === "flat" && (
                          <span title="Estable">
                            <Minus className="inline h-4 w-4 text-muted-foreground" />
                          </span>
                        )}
                        {!tendencias[estudiante.id]           && <span className="text-muted-foreground text-[12px]">—</span>}
                      </td>
                    )}
                    <td className={cn(
                      "px-4 py-3 text-right text-sm font-extrabold",
                      prom === null ? "text-muted-foreground" : prom >= 4.0 ? "text-status-blue-text" : "text-status-red-text"
                    )}>
                      {prom !== null ? prom.toFixed(1) : "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Modal: agregar evaluación */}
      {showAddEval && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={() => setShowAddEval(false)}>
          <div className="w-[360px] max-w-[95vw] rounded-[16px] bg-card p-5 shadow-2xl sm:p-6" onClick={e => e.stopPropagation()}>
            <h3 className="mb-1 text-[15px] font-extrabold">Agregar evaluación {activeTab === "sumativas" ? "sumativa" : "formativa"}</h3>
            <p className="mb-4 text-[12px] text-muted-foreground">Se agregará en la pestaña de evaluaciones {activeTab}.</p>
            <input
              value={newEvalLabel}
              onChange={e => setNewEvalLabel(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") agregarEvaluacion() }}
              placeholder="Ej: N2, Trabajo Práctico, Prueba..."
              className="mb-4 w-full rounded-[10px] border-[1.5px] border-primary px-3.5 py-2.5 text-[13px] font-semibold outline-none focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--primary)_10%,transparent)]"
              autoFocus
            />
            <div className="flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
              <button onClick={() => setShowAddEval(false)} className="rounded-lg px-4 py-2 text-[13px] font-semibold text-muted-foreground hover:bg-background transition-colors">Cancelar</button>
              <button onClick={agregarEvaluacion} className="rounded-[10px] bg-primary px-5 py-2.5 text-[13px] font-bold text-white hover:bg-pink-dark transition-colors">Agregar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
