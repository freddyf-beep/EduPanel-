"use client"

import { useState, useEffect, useRef, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Plus, Loader2, Check, X, AlertCircle, TrendingUp, TrendingDown, Minus,
  BarChart3, MessageSquare, Bookmark, Sparkles, Filter, Grid3x3, LayoutList,
  ChevronRight, Search, Hash, Target, Flame, Eye, ArrowUpDown, Trash2, Download,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, Cell, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"
import { cargarVerUnidadesCurso, userDoc } from "@/lib/curriculo"
import { setDoc, getDoc, serverTimestamp } from "firebase/firestore"
import { cargarHorarioSemanal, esTipoLibre } from "@/lib/horario"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { contarObservacionesPorEstudiante, type ResumenObservacionesEstudiante } from "@/lib/observaciones"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Badge } from "@/components/ui/badge"
import { MiniSparkline } from "@/components/edu-panel/shared/mini-sparkline"

type TabKey = "tabla" | "distribucion" | "alumno" | "cobertura"
const TABS: { key: TabKey; label: string; icon: typeof Grid3x3 }[] = [
  { key: "tabla",        label: "Tabla densa",   icon: Grid3x3 },
  { key: "distribucion", label: "Distribución",  icon: BarChart3 },
  { key: "alumno",       label: "Diario digital", icon: LayoutList },
  { key: "cobertura",    label: "Cobertura OA",  icon: Target },
]

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
  oaIds?: string[]
  unidadId?: string
}

interface OaOpcion {
  id: string
  label: string
  descripcion: string
  unidadId: string
}

function buildId(asignatura: string, curso: string) {
  return ("calif_" + asignatura + "_" + curso)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function calcPromedioFn(notas: Record<string, string>, evalIds?: string[]) {
  const keys = evalIds || Object.keys(notas)
  const vals = keys.map(k => parseFloat(notas[k])).filter(v => !isNaN(v))
  if (vals.length === 0) return null
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function notaColor(n: number | null): string {
  if (n == null) return "text-muted-foreground"
  if (n < 4) return "text-status-red-text"
  if (n < 5.5) return "text-status-amber-text"
  return "text-status-green-text"
}

function notaBg(n: number | null, intensity: "light" | "strong" = "light"): string {
  if (n == null) return "bg-muted/40"
  if (intensity === "strong") {
    if (n < 4) return "bg-rose-200 dark:bg-rose-900/60"
    if (n < 5.5) return "bg-amber-200 dark:bg-amber-900/60"
    return "bg-emerald-200 dark:bg-emerald-900/60"
  }
  if (n < 4) return "bg-rose-50 dark:bg-rose-950/30"
  if (n < 5.5) return "bg-amber-50 dark:bg-amber-950/30"
  return "bg-emerald-50 dark:bg-emerald-950/30"
}

function evaluarFormula(input: string): string {
  const trimmed = input.trim()
  if (!trimmed.startsWith("=")) return input
  try {
    const expr = trimmed.slice(1).replace(/[^0-9+\-*/.() ]/g, "")
    if (!expr) return input
    const result = Function(`"use strict"; return (${expr})`)()
    if (typeof result !== "number" || !isFinite(result)) return input
    const clamped = Math.max(1.0, Math.min(7.0, parseFloat(result.toFixed(1))))
    return clamped.toString()
  } catch {
    return input
  }
}

export function CalificacionesShell() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const tabParam = (searchParams.get("tab") as TabKey | null)
  const activeTab: TabKey = tabParam ?? "tabla"

  const [curso, setCurso] = useState("")
  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [tipoActivo, setTipoActivo] = useState<"sumativa" | "formativa">("sumativa")
  const [periodo, setPeriodo] = useState<"s1" | "s2" | "anual">("anual")
  const [estudiantes, setEstudiantes] = useState<EstudianteCalif[]>([])
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving_silent" | "saved" | "error">("idle")
  const [observacionesResumen, setObservacionesResumen] = useState<Record<string, ResumenObservacionesEstudiante>>({})
  const [oaOpciones, setOaOpciones] = useState<OaOpcion[]>([])

  const [showAddEval, setShowAddEval] = useState(false)
  const [newEvalLabel, setNewEvalLabel] = useState("")
  const [newEvalOaIds, setNewEvalOaIds] = useState<string[]>([])

  const [filterAlumnos, setFilterAlumnos] = useState<"todos" | "rojos" | "ambar" | "azules">("todos")
  const [orden, setOrden] = useState<"nombre" | "promedio_asc" | "promedio_desc">("nombre")
  const [highlightedRows, setHighlightedRows] = useState<Set<string>>(new Set())
  const [selectedAlumnoId, setSelectedAlumnoId] = useState<string>("")

  const ignoreNextSaveRef = useRef(true)

  const goToTab = useCallback((key: TabKey) => {
    const params = new URLSearchParams(Array.from(searchParams.entries()))
    params.set("tab", key)
    router.replace(`/calificaciones?${params.toString()}`, { scroll: false })
  }, [router, searchParams])

  // Cursos — excluye tipos libres (recreo, almuerzo, planificacion, etc.)
  useEffect(() => {
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(
        hData.filter(h => !esTipoLibre(h.tipo)).map(h => h.resumen.trim()).filter(Boolean)
      ))
      setCursosDisponibles(unique)
      if (unique.length > 0) setCurso(unique[0])
    })
  }, [])

  // Datos del curso
  useEffect(() => {
    if (!curso) return
    let cancelled = false

    Promise.resolve().then(async () => {
      setLoading(true)
      const id = buildId(ASIGNATURA, curso)
      const [snap, estDocs] = await Promise.all([
        getDoc(userDoc("calificaciones", id)),
        cargarEstudiantes(curso),
      ])
      if (cancelled) return

      if (snap.exists()) {
        const data = snap.data()
        const notasEstudiantes = data.estudiantes || []
        const merged: EstudianteCalif[] = estDocs.map(est => {
          const old = notasEstudiantes.find((o: any) => o.id === est.id || o.name === est.nombre)
          return {
            id: est.id, name: est.nombre, orden: est.orden,
            notas: old ? old.notas : {},
            hasPie: est.pie === true,
            pieDiagnostico: est.pieDiagnostico || "",
          }
        })
        setEstudiantes(merged)
        const evals: Evaluacion[] = (data.evaluaciones || []).map((ev: any) => ({
          id: ev.id,
          label: ev.label,
          tipo: ev.tipo || "sumativa",
          periodo: ev.periodo || "s1",
          oaIds: Array.isArray(ev.oaIds) ? ev.oaIds : [],
          unidadId: ev.unidadId,
        }))
        setEvaluaciones(evals.length > 0 ? evals : [{ id: "n1", label: "N1", tipo: "sumativa", periodo: "s1" }])
      } else {
        const initial: EstudianteCalif[] = estDocs.map(est => ({
          id: est.id, name: est.nombre, orden: est.orden,
          notas: {}, hasPie: est.pie === true, pieDiagnostico: est.pieDiagnostico || "",
        }))
        setEstudiantes(initial)
        setEvaluaciones([{ id: "n1", label: "N1", tipo: "sumativa", periodo: "s1" }])
      }
    }).catch(console.error).finally(() => {
      if (cancelled) return
      setLoading(false)
      ignoreNextSaveRef.current = true
    })

    return () => {
      cancelled = true
    }
  }, [curso, ASIGNATURA])

  // OAs disponibles
  useEffect(() => {
    let cancelled = false
    if (!curso) {
      Promise.resolve().then(() => {
        if (!cancelled) setOaOpciones([])
      })
      return () => {
        cancelled = true
      }
    }

    Promise.resolve().then(async () => {
      const unidades = await cargarVerUnidadesCurso(ASIGNATURA, curso)
      if (cancelled) return
        const opciones: OaOpcion[] = []
        Object.entries(unidades).forEach(([unidadId, unidad]) => {
          (unidad.oas || [])
            .filter(oa => oa.seleccionado)
            .forEach(oa => opciones.push({
              id: oa.id,
              label: oa.numero ? `OA ${oa.numero}` : oa.id,
              descripcion: oa.descripcion,
              unidadId,
            }))
        })
        setOaOpciones(opciones)
    }).catch(() => {
      if (!cancelled) setOaOpciones([])
    })

    return () => {
      cancelled = true
    }
  }, [curso, ASIGNATURA])

  // Observaciones resumen
  useEffect(() => {
    let cancelled = false
    if (!curso) {
      Promise.resolve().then(() => {
        if (!cancelled) setObservacionesResumen({})
      })
      return () => {
        cancelled = true
      }
    }

    Promise.resolve().then(async () => {
      const resumen = await contarObservacionesPorEstudiante(ASIGNATURA, curso)
      if (!cancelled) setObservacionesResumen(resumen)
    }).catch(() => {
      if (!cancelled) setObservacionesResumen({})
    })

    return () => {
      cancelled = true
    }
  }, [curso, ASIGNATURA])

  // Alumno seleccionado por defecto
  useEffect(() => {
    if (selectedAlumnoId || estudiantes.length === 0) return
    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) setSelectedAlumnoId(estudiantes[0].id)
    })
    return () => {
      cancelled = true
    }
  }, [estudiantes, selectedAlumnoId])

  const handleGuardar = useCallback(async (isAutoSave = false) => {
    try {
      const id = buildId(ASIGNATURA, curso)
      await setDoc(userDoc("calificaciones", id), {
        asignatura: ASIGNATURA, curso, estudiantes, evaluaciones,
        updatedAt: serverTimestamp(),
      })
      setSaveStatus("saved")
      setTimeout(() => setSaveStatus("idle"), 3000)
    } catch {
      setSaveStatus("error")
      setTimeout(() => setSaveStatus("idle"), 5000)
    }
  }, [ASIGNATURA, curso, estudiantes, evaluaciones])

  // Exportar CSV de notas
  const handleDescargarCSV = useCallback(() => {
    const evalIds = evaluaciones.map(ev => ev.id)
    const header = ["N°", "Estudiante", "PIE", ...evaluaciones.map(ev => ev.label), "Promedio"]
    const rows = estudiantes.map((e, i) => {
      const prom = calcPromedioFn(e.notas, evalIds)
      return [
        String(e.orden ?? i + 1),
        e.name,
        e.hasPie ? "Sí" : "No",
        ...evaluaciones.map(ev => e.notas[ev.id] || ""),
        prom !== null ? prom.toFixed(1) : "",
      ]
    })
    const csv = [header, ...rows]
      .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `calificaciones_${ASIGNATURA}_${curso}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [ASIGNATURA, curso, estudiantes, evaluaciones])

  // Autosave
  useEffect(() => {
    if (loading) return
    if (ignoreNextSaveRef.current) { ignoreNextSaveRef.current = false; return }
    setSaveStatus("saving_silent")
    const t = setTimeout(() => handleGuardar(true), 2500)
    return () => clearTimeout(t)
  }, [estudiantes, evaluaciones, loading, handleGuardar])

  // Atajo Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleGuardar(false)
      }
    }
    document.addEventListener("keydown", handler)
    return () => document.removeEventListener("keydown", handler)
  }, [handleGuardar])

  const updateNota = (estudianteId: string, evalId: string, valueRaw: string) => {
    let v = valueRaw
    if (v.startsWith("=")) v = evaluarFormula(v)
    if (v !== "" && (isNaN(parseFloat(v)) || parseFloat(v) < 1 || parseFloat(v) > 7)) return
    setEstudiantes(prev => prev.map(e =>
      e.id === estudianteId ? { ...e, notas: { ...e.notas, [evalId]: v } } : e
    ))
  }

  const agregarEvaluacion = () => {
    if (!newEvalLabel.trim()) return
    const id = "eval_" + Date.now()
    const unidadIds = new Set(oaOpciones.filter(oa => newEvalOaIds.includes(oa.id)).map(oa => oa.unidadId))
    const nueva: Evaluacion = {
      id,
      label: newEvalLabel.trim(),
      tipo: tipoActivo,
      periodo: periodo === "anual" ? "s1" : periodo,
      oaIds: newEvalOaIds,
      unidadId: unidadIds.size === 1 ? Array.from(unidadIds)[0] : undefined,
    }
    setEvaluaciones(prev => [...prev, nueva])
    setEstudiantes(prev => prev.map(e => ({ ...e, notas: { ...e.notas, [id]: "" } })))
    setNewEvalLabel("")
    setNewEvalOaIds([])
    setShowAddEval(false)
  }

  const eliminarEvaluacion = (evalId: string) => {
    if (!confirm("¿Eliminar esta evaluación y todas sus notas?")) return
    setEvaluaciones(prev => prev.filter(ev => ev.id !== evalId))
    setEstudiantes(prev => prev.map(e => {
      const { [evalId]: _, ...rest } = e.notas
      return { ...e, notas: rest }
    }))
  }

  const evaluacionesFiltradas = useMemo(() => {
    return evaluaciones.filter(ev => {
      const matchTipo = (ev.tipo || "sumativa") === tipoActivo
      const matchPeriodo = periodo === "anual" ? true : (ev.periodo || "s1") === periodo
      return matchTipo && matchPeriodo
    })
  }, [evaluaciones, tipoActivo, periodo])

  const stats = useMemo(() => {
    const evalIds = evaluacionesFiltradas.map(ev => ev.id)
    const promedios = estudiantes.map(e => calcPromedioFn(e.notas, evalIds)).filter((p): p is number => p !== null)
    if (promedios.length === 0) {
      return { promedio: null, mediana: null, aprobacion: 0, rojos: 0, total: 0, min: null as number | null, max: null as number | null, varianza: null as number | null }
    }
    const sorted = [...promedios].sort((a, b) => a - b)
    const promedio = promedios.reduce((a, b) => a + b, 0) / promedios.length
    const mid = Math.floor(sorted.length / 2)
    const mediana = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
    const aprobados = promedios.filter(n => n >= 4.0).length
    const aprobacion = Math.round((aprobados / promedios.length) * 100)
    const rojos = promedios.filter(n => n < 4.0).length
    const min = sorted[0]
    const max = sorted[sorted.length - 1]
    const varSum = promedios.reduce((acc, n) => acc + Math.pow(n - promedio, 2), 0)
    const varianza = Number((varSum / promedios.length).toFixed(2))
    return { promedio, mediana, aprobacion, rojos, total: promedios.length, min, max, varianza }
  }, [estudiantes, evaluacionesFiltradas])

  const histogramData = useMemo(() => {
    const evalIds = evaluacionesFiltradas.map(ev => ev.id)
    const buckets = [
      { rango: "1-2", min: 1, max: 2 },
      { rango: "2-3", min: 2, max: 3 },
      { rango: "3-4", min: 3, max: 4 },
      { rango: "4-5", min: 4, max: 5 },
      { rango: "5-6", min: 5, max: 6 },
      { rango: "6-7", min: 6, max: 7 },
      { rango: "7",   min: 7, max: 7.01 },
    ]
    const promedios = estudiantes.map(e => ({ id: e.id, p: calcPromedioFn(e.notas, evalIds) }))
    return buckets.map(b => {
      const ids = promedios.filter(x => x.p !== null && x.p >= b.min && x.p < b.max).map(x => x.id)
      return {
        rango: b.rango,
        cantidad: ids.length,
        ids,
        aprueba: b.min >= 4,
      }
    })
  }, [estudiantes, evaluacionesFiltradas])

  const tendencias = useMemo(() => {
    if (periodo !== "anual") return {} as Record<string, "up" | "down" | "flat">
    const s1Ids = evaluaciones.filter(ev => (ev.periodo || "s1") === "s1" && ev.tipo === tipoActivo).map(ev => ev.id)
    const s2Ids = evaluaciones.filter(ev => ev.periodo === "s2" && ev.tipo === tipoActivo).map(ev => ev.id)
    if (s1Ids.length === 0 || s2Ids.length === 0) return {}
    const result: Record<string, "up" | "down" | "flat"> = {}
    estudiantes.forEach(est => {
      const p1 = calcPromedioFn(est.notas, s1Ids)
      const p2 = calcPromedioFn(est.notas, s2Ids)
      if (p1 === null || p2 === null) return
      result[est.id] = p2 - p1 > 0.3 ? "up" : p1 - p2 > 0.3 ? "down" : "flat"
    })
    return result
  }, [estudiantes, evaluaciones, periodo, tipoActivo])

  // Filtro / orden de estudiantes
  const estudiantesVisibles = useMemo(() => {
    const evalIds = evaluacionesFiltradas.map(ev => ev.id)
    const conPromedio = estudiantes.map(e => ({ ...e, _prom: calcPromedioFn(e.notas, evalIds) }))
    let filtrados = conPromedio
    if (filterAlumnos === "rojos") filtrados = conPromedio.filter(e => e._prom != null && e._prom < 4.0)
    else if (filterAlumnos === "ambar") filtrados = conPromedio.filter(e => e._prom != null && e._prom >= 4.0 && e._prom < 5.5)
    else if (filterAlumnos === "azules") filtrados = conPromedio.filter(e => e._prom != null && e._prom >= 5.5)

    if (highlightedRows.size > 0) {
      filtrados = filtrados.filter(e => highlightedRows.has(e.id))
    }

    if (orden === "promedio_asc") return [...filtrados].sort((a, b) => (a._prom ?? 99) - (b._prom ?? 99))
    if (orden === "promedio_desc") return [...filtrados].sort((a, b) => (b._prom ?? -99) - (a._prom ?? -99))
    return filtrados
  }, [estudiantes, evaluacionesFiltradas, filterAlumnos, highlightedRows, orden])

  const seleccionado = estudiantes.find(e => e.id === selectedAlumnoId) || null

  return (
    <div className="mx-auto max-w-[1500px] px-3 sm:px-5 pb-10">
      {/* Hero */}
      <div className="mb-5 grid gap-3 lg:grid-cols-[1.2fr_1fr]">
        <div className="relative overflow-hidden rounded-[18px] bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 px-6 py-6 text-white">
          <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <div className="text-[11px] font-bold opacity-90 inline-flex items-center gap-1">
              <BarChart3 className="h-3 w-3" /> CALIFICACIONES · BETA
            </div>
            <h1 className="mt-1 text-[22px] sm:text-[26px] font-extrabold leading-tight">
              {curso ? `Notas · ${curso}` : "Carga un curso"}
            </h1>
            <p className="mt-1 text-[12.5px] text-white/85">
              {ASIGNATURA} · {evaluacionesFiltradas.length} {tipoActivo === "sumativa" ? "sumativas" : "formativas"} ({periodo === "anual" ? "anual" : periodo === "s1" ? "1° sem" : "2° sem"})
            </p>

            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-80">CURSO</label>
                <select
                  value={curso}
                  onChange={e => setCurso(e.target.value)}
                  className="rounded-[10px] bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur outline-none [&>option]:text-foreground"
                >
                  {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold opacity-80">PERÍODO</label>
                <select
                  value={periodo}
                  onChange={e => setPeriodo(e.target.value as any)}
                  className="rounded-[10px] bg-white/15 px-3 py-1.5 text-[12.5px] font-semibold text-white backdrop-blur outline-none [&>option]:text-foreground"
                >
                  <option value="anual">Anual</option>
                  <option value="s1">1° semestre</option>
                  <option value="s2">2° semestre</option>
                </select>
              </div>
              <SaveBadge status={saveStatus} onSave={() => handleGuardar(false)} />
            </div>

            {/* Toggle tipo */}
            <div className="mt-3 inline-flex rounded-full bg-white/15 p-0.5 backdrop-blur">
              {(["sumativa", "formativa"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTipoActivo(t)}
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-bold transition-colors",
                    tipoActivo === t ? "bg-white text-emerald-700" : "text-white/85 hover:text-white"
                  )}
                >
                  {t === "sumativa" ? "Sumativas" : "Formativas"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2.5">
          <KpiBox label="Promedio" value={stats.promedio?.toFixed(1) ?? "—"} sub={stats.mediana != null ? `med ${stats.mediana.toFixed(1)}` : "—"} variant={stats.promedio != null && stats.promedio < 4 ? "rojo" : "ok"} />
          <KpiBox label="Aprobación" value={`${stats.aprobacion}%`} sub={`${stats.total - stats.rojos}/${stats.total} ≥4.0`} variant={stats.aprobacion >= 80 ? "ok" : stats.aprobacion >= 60 ? "ambar" : "rojo"} />
          <KpiBox label="Rojos" value={stats.rojos.toString()} sub={stats.total > 0 ? `${Math.round((stats.rojos/stats.total)*100)}% del curso` : "—"} variant={stats.rojos === 0 ? "ok" : "rojo"} />
          <KpiBox label="Mín" value={stats.min?.toFixed(1) ?? "—"} sub="" variant={stats.min != null && stats.min < 4 ? "rojo" : "ok"} />
          <KpiBox label="Máx" value={stats.max?.toFixed(1) ?? "—"} sub="" variant="ok" />
          <KpiBox label="Varianza" value={stats.varianza?.toFixed(2) ?? "—"} sub="dispersión" variant="ok" />
        </div>
      </div>

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
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
        </div>
      ) : !curso ? (
        <div className="rounded-[14px] border border-dashed border-border bg-card p-8 text-center text-[12.5px] text-muted-foreground">
          Carga un curso para empezar.
        </div>
      ) : (
        <>
          {activeTab === "tabla" && (
            <TablaView
              estudiantes={estudiantesVisibles}
              evaluaciones={evaluacionesFiltradas}
              tendencias={tendencias}
              periodo={periodo}
              filterAlumnos={filterAlumnos}
              setFilterAlumnos={setFilterAlumnos}
              orden={orden}
              setOrden={setOrden}
              observacionesResumen={observacionesResumen}
              showAddEval={showAddEval}
              onShowAddEval={setShowAddEval}
              newEvalLabel={newEvalLabel}
              setNewEvalLabel={setNewEvalLabel}
              newEvalOaIds={newEvalOaIds}
              setNewEvalOaIds={setNewEvalOaIds}
              oaOpciones={oaOpciones}
              onAgregarEval={agregarEvaluacion}
              onEliminarEval={eliminarEvaluacion}
              onUpdateNota={updateNota}
              asignatura={ASIGNATURA}
              curso={curso}
              highlightedRows={highlightedRows}
              setHighlightedRows={setHighlightedRows}
            />
          )}

          {activeTab === "distribucion" && (
            <DistribucionView
              data={histogramData}
              onSelectBucket={(ids) => {
                setHighlightedRows(new Set(ids))
                goToTab("tabla")
              }}
              total={stats.total}
              promedio={stats.promedio}
              mediana={stats.mediana}
            />
          )}

          {activeTab === "alumno" && (
            <AlumnoView
              estudiantes={estudiantes}
              evaluaciones={evaluaciones.filter(ev => ev.tipo === tipoActivo)}
              selectedId={selectedAlumnoId}
              onSelect={setSelectedAlumnoId}
              tendencias={tendencias}
              asignatura={ASIGNATURA}
              curso={curso}
              observacionesResumen={observacionesResumen}
            />
          )}

          {activeTab === "cobertura" && (
            <CoberturaView
              estudiantes={estudiantes}
              evaluaciones={evaluaciones.filter(ev => ev.tipo === tipoActivo && (ev.oaIds?.length ?? 0) > 0)}
              oaOpciones={oaOpciones}
            />
          )}
        </>
      )}

      <div className="mt-10 mb-4 flex items-center justify-center gap-4">
        {estudiantes.length > 0 && curso && (
          <button
            onClick={handleDescargarCSV}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:border-primary hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
        )}
      </div>
    </div>
  )
}

function KpiBox({ label, value, sub, variant }: { label: string; value: string; sub: string; variant: "ok" | "ambar" | "rojo" }) {
  const cls =
    variant === "rojo"  ? "border-rose-300 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30" :
    variant === "ambar" ? "border-amber-300 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30" :
                          "border-border bg-card"
  return (
    <div className={cn("rounded-[14px] border p-3", cls)}>
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-[20px] font-extrabold leading-none">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

function SaveBadge({ status, onSave }: { status: "idle"|"saving_silent"|"saved"|"error"; onSave: () => void }) {
  return (
    <div className="ml-auto flex items-center gap-2">
      {status === "saving_silent" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
        </span>
      )}
      {status === "saved" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/40 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          <Check className="h-3 w-3" /> Guardado
        </span>
      )}
      {status === "error" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/40 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
          Error
        </span>
      )}
      <button
        onClick={onSave}
        className="inline-flex items-center gap-1.5 rounded-[10px] bg-white/20 px-3 py-1.5 text-[12px] font-bold backdrop-blur hover:bg-white/30"
      >
        <Bookmark className="h-3.5 w-3.5" /> Guardar
      </button>
    </div>
  )
}

interface TablaViewProps {
  estudiantes: (EstudianteCalif & { _prom: number | null })[]
  evaluaciones: Evaluacion[]
  tendencias: Record<string, "up" | "down" | "flat">
  periodo: "s1" | "s2" | "anual"
  filterAlumnos: "todos" | "rojos" | "ambar" | "azules"
  setFilterAlumnos: (f: "todos" | "rojos" | "ambar" | "azules") => void
  orden: "nombre" | "promedio_asc" | "promedio_desc"
  setOrden: (o: "nombre" | "promedio_asc" | "promedio_desc") => void
  observacionesResumen: Record<string, ResumenObservacionesEstudiante>
  showAddEval: boolean
  onShowAddEval: (v: boolean) => void
  newEvalLabel: string
  setNewEvalLabel: (s: string) => void
  newEvalOaIds: string[]
  setNewEvalOaIds: React.Dispatch<React.SetStateAction<string[]>>
  oaOpciones: OaOpcion[]
  onAgregarEval: () => void
  onEliminarEval: (id: string) => void
  onUpdateNota: (estId: string, evalId: string, val: string) => void
  asignatura: string
  curso: string
  highlightedRows: Set<string>
  setHighlightedRows: (s: Set<string>) => void
}

function TablaView(props: TablaViewProps) {
  const {
    estudiantes, evaluaciones, tendencias, periodo,
    filterAlumnos, setFilterAlumnos, orden, setOrden,
    observacionesResumen, showAddEval, onShowAddEval, newEvalLabel, setNewEvalLabel,
    newEvalOaIds, setNewEvalOaIds, oaOpciones, onAgregarEval, onEliminarEval,
    onUpdateNota, asignatura, curso, highlightedRows, setHighlightedRows,
  } = props

  const tableRef = useRef<HTMLTableElement>(null)

  const handleNotaKeydown = (e: React.KeyboardEvent<HTMLInputElement>, estIdx: number, evalIdx: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault()
      const next = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${estIdx + 1}"][data-c="${evalIdx}"]`)
      next?.focus()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      const next = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${estIdx - 1}"][data-c="${evalIdx}"]`)
      next?.focus()
    } else if (e.key === "Tab" || e.key === "ArrowRight") {
      // Navega a la siguiente evaluación (derecha)
      const nextEvalInput = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${estIdx}"][data-c="${evalIdx + 1}"]`)
      if (nextEvalInput) {
        e.preventDefault()
        nextEvalInput.focus()
      }
      // Si no hay siguiente evaluación, Tab nativo avanza al siguiente input (comportamiento por defecto)
    } else if (e.key === "ArrowLeft") {
      e.preventDefault()
      const prev = tableRef.current?.querySelector<HTMLInputElement>(`input[data-r="${estIdx}"][data-c="${evalIdx - 1}"]`)
      prev?.focus()
    }
  }

  const toggleNewOa = (oaId: string) => {
    setNewEvalOaIds(prev => prev.includes(oaId) ? prev.filter(x => x !== oaId) : [...prev, oaId])
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[10px] border border-border bg-card p-0.5">
          {(["todos", "rojos", "ambar", "azules"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterAlumnos(f)}
              className={cn(
                "rounded-[8px] px-2.5 py-1 text-[11px] font-bold transition-colors",
                filterAlumnos === f ? "bg-pink-light text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f === "todos" ? "Todos" : f === "rojos" ? "Rojos (<4)" : f === "ambar" ? "Ámbar (4-5.5)" : "Azules (5.5+)"}
            </button>
          ))}
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button className="inline-flex items-center gap-1 rounded-[10px] border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold hover:border-primary">
              <ArrowUpDown className="h-3 w-3" />
              {orden === "nombre" ? "Por nombre" : orden === "promedio_asc" ? "Promedio ↑" : "Promedio ↓"}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1.5" align="start">
            {(["nombre", "promedio_asc", "promedio_desc"] as const).map(o => (
              <button
                key={o}
                onClick={() => setOrden(o)}
                className={cn(
                  "w-full text-left rounded-md px-2 py-1.5 text-[12px] hover:bg-muted/60",
                  orden === o && "bg-pink-light text-primary font-bold",
                )}
              >
                {o === "nombre" ? "Por nombre" : o === "promedio_asc" ? "Promedio ascendente" : "Promedio descendente"}
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {highlightedRows.size > 0 && (
          <button
            onClick={() => setHighlightedRows(new Set())}
            className="inline-flex items-center gap-1 rounded-[10px] border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 dark:text-amber-100"
          >
            <X className="h-3 w-3" /> Limpiar filtro de distribución ({highlightedRows.size})
          </button>
        )}

        <div className="ml-auto">
          <button
            onClick={() => onShowAddEval(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-1.5 text-[12px] font-bold text-white hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Nueva evaluación
          </button>
        </div>
      </div>

      {showAddEval && (
        <div className="rounded-[12px] border border-border bg-card p-4 space-y-3">
          <h3 className="text-[13px] font-extrabold">Nueva evaluación</h3>
          <input
            value={newEvalLabel}
            onChange={e => setNewEvalLabel(e.target.value)}
            placeholder="Ej: N3 — Diagnóstico fonema /r/"
            className="w-full rounded-[8px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary"
            autoFocus
          />
          {oaOpciones.length > 0 && (
            <div>
              <div className="text-[10.5px] font-bold uppercase text-muted-foreground mb-1.5">OAs vinculados (opcional)</div>
              <div className="flex flex-wrap gap-1.5">
                {oaOpciones.map(oa => (
                  <button
                    key={oa.id}
                    onClick={() => toggleNewOa(oa.id)}
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10.5px] font-bold border",
                      newEvalOaIds.includes(oa.id)
                        ? "bg-pink-light border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-primary"
                    )}
                    title={oa.descripcion}
                  >
                    {oa.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { onShowAddEval(false); setNewEvalLabel(""); setNewEvalOaIds([]) }}
              className="rounded-[8px] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground hover:bg-muted/40"
            >
              Cancelar
            </button>
            <button
              onClick={onAgregarEval}
              disabled={!newEvalLabel.trim()}
              className="rounded-[10px] bg-primary px-4 py-1.5 text-[12px] font-bold text-white hover:opacity-90 disabled:opacity-40"
            >
              Crear
            </button>
          </div>
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto rounded-[14px] border border-border bg-card">
        <table ref={tableRef} className="min-w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-extrabold text-[11.5px] min-w-[200px]">
                Estudiante
              </th>
              {evaluaciones.map(ev => (
                <th key={ev.id} className="px-2 py-2 text-center font-extrabold text-[11px] min-w-[60px]">
                  <div className="flex items-center justify-center gap-1">
                    <span title={ev.label}>{ev.label.length > 8 ? ev.label.slice(0, 7) + "…" : ev.label}</span>
                    <button
                      onClick={() => onEliminarEval(ev.id)}
                      className="text-muted-foreground hover:text-rose-600 opacity-0 hover:opacity-100 transition-opacity"
                      title="Eliminar evaluación"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {ev.oaIds && ev.oaIds.length > 0 && (
                    <div className="mt-0.5 text-[8.5px] text-muted-foreground font-medium">
                      {ev.oaIds.length} OA
                    </div>
                  )}
                </th>
              ))}
              <th className="sticky right-0 z-10 bg-background px-3 py-2 text-center font-extrabold text-[11.5px] min-w-[80px]">
                Promedio
              </th>
            </tr>
          </thead>
          <tbody>
            {estudiantes.map((est, estIdx) => {
              const trend = tendencias[est.id]
              const obs = observacionesResumen[est.id]
              return (
                <tr key={est.id} className="border-b border-border last:border-b-0 hover:bg-background/40">
                  <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-[12px] font-medium">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[180px]">
                        {est.orden != null && <span className="text-muted-foreground">{est.orden}.</span>} {est.name}
                      </span>
                      {est.hasPie && (
                        <Badge variant="outline" className="h-4 px-1 text-[8.5px]">PIE</Badge>
                      )}
                      {obs && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={buildUrl("/perfil-360", withAsignatura({ curso, alumno: est.id }, asignatura))}
                              className="inline-flex items-center gap-0.5 rounded bg-status-blue-bg px-1 py-0.5 text-[8.5px] font-bold text-status-blue-text border border-status-blue-border"
                            >
                              <MessageSquare className="h-2.5 w-2.5" />{obs.total}
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent>
                            <span className="text-[11px]">{obs.ultimaFecha}: {obs.ultimoExtracto}</span>
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </td>
                  {evaluaciones.map((ev, evalIdx) => {
                    const value = est.notas[ev.id] || ""
                    const numValue = parseFloat(value)
                    const valid = !isNaN(numValue) && numValue >= 1 && numValue <= 7
                    return (
                      <td key={ev.id} className={cn("px-1 py-1 text-center", valid && notaBg(numValue))}>
                        <input
                          type="text"
                          value={value}
                          onChange={e => onUpdateNota(est.id, ev.id, e.target.value)}
                          onKeyDown={(e) => handleNotaKeydown(e, estIdx, evalIdx)}
                          data-r={estIdx}
                          data-c={evalIdx}
                          className={cn(
                            "w-12 rounded-[6px] border border-transparent bg-transparent px-1 py-1 text-center text-[12.5px] font-bold outline-none focus:border-primary focus:bg-card",
                            valid ? notaColor(numValue) : value !== "" ? "text-muted-foreground italic" : ""
                          )}
                          placeholder="—"
                        />
                      </td>
                    )
                  })}
                  <td className="sticky right-0 z-10 bg-card px-3 py-1.5 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={cn("text-[14px] font-extrabold", notaColor(est._prom))}>
                        {est._prom != null ? est._prom.toFixed(1) : "—"}
                      </span>
                      {trend && (
                        <span className={cn(
                          "text-[10px]",
                          trend === "up" ? "text-emerald-600" : trend === "down" ? "text-rose-600" : "text-muted-foreground"
                        )}>
                          {trend === "up" && <TrendingUp className="h-3 w-3" />}
                          {trend === "down" && <TrendingDown className="h-3 w-3" />}
                          {trend === "flat" && <Minus className="h-3 w-3" />}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {estudiantes.length === 0 && (
              <tr>
                <td colSpan={evaluaciones.length + 2} className="py-8 text-center text-muted-foreground italic text-[12.5px]">
                  Sin estudiantes para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-[10px] border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground">
        Atajos: <kbd className="rounded bg-muted px-1">Tab</kbd>/<kbd className="rounded bg-muted px-1">→</kbd> columna siguiente · <kbd className="rounded bg-muted px-1">←</kbd> columna anterior · <kbd className="rounded bg-muted px-1">Enter</kbd>/<kbd className="rounded bg-muted px-1">↓</kbd> baja · <kbd className="rounded bg-muted px-1">↑</kbd> sube · empieza con <kbd className="rounded bg-muted px-1">=</kbd> para fórmulas (ej. =5+6/2 → 5.5)
      </div>
    </div>
  )
}

function DistribucionView({ data, onSelectBucket, total, promedio, mediana }: {
  data: { rango: string; cantidad: number; ids: string[]; aprueba: boolean }[]
  onSelectBucket: (ids: string[]) => void
  total: number
  promedio: number | null
  mediana: number | null
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[14px] border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-extrabold">Histograma de promedios</h3>
          <div className="text-[11px] text-muted-foreground">
            {total} promedios · prom <strong>{promedio?.toFixed(1) ?? "—"}</strong> · mediana <strong>{mediana?.toFixed(1) ?? "—"}</strong>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis dataKey="rango" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <ChartTooltip
                contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                formatter={(v: any) => [v, "Estudiantes"]}
              />
              <Bar dataKey="cantidad" cursor="pointer" onClick={(e) => onSelectBucket(e.payload.ids)}>
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.aprueba ? "var(--status-green-text)" : "var(--status-red-text)"} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground italic">
          Click en una barra para filtrar la tabla a esos alumnos.
        </p>
      </div>

      <div className="rounded-[14px] border border-border bg-card p-5">
        <h3 className="text-[14px] font-extrabold mb-3">Resumen por rango</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {data.map((b, i) => (
            <button
              key={i}
              disabled={b.cantidad === 0}
              onClick={() => onSelectBucket(b.ids)}
              className={cn(
                "rounded-[10px] border p-2.5 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                b.aprueba ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30 hover:border-emerald-400"
                          : "border-rose-200 bg-rose-50 dark:border-rose-900/40 dark:bg-rose-950/30 hover:border-rose-400"
              )}
            >
              <div className="text-[10px] font-bold uppercase opacity-70">{b.rango}</div>
              <div className="mt-0.5 text-[18px] font-extrabold">{b.cantidad}</div>
              <div className="text-[10px] opacity-70">{total > 0 ? Math.round((b.cantidad / total) * 100) : 0}%</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function AlumnoView({ estudiantes, evaluaciones, selectedId, onSelect, tendencias, asignatura, curso, observacionesResumen }: {
  estudiantes: EstudianteCalif[]
  evaluaciones: Evaluacion[]
  selectedId: string
  onSelect: (id: string) => void
  tendencias: Record<string, "up" | "down" | "flat">
  asignatura: string
  curso: string
  observacionesResumen: Record<string, ResumenObservacionesEstudiante>
}) {
  const seleccionado = estudiantes.find(e => e.id === selectedId) || null
  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-[14px] border border-border bg-card max-h-[600px] overflow-y-auto">
        <ul className="divide-y divide-border">
          {estudiantes.map(e => {
            const prom = calcPromedioFn(e.notas, evaluaciones.map(ev => ev.id))
            const isActive = e.id === selectedId
            return (
              <li key={e.id}>
                <button
                  onClick={() => onSelect(e.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 transition-colors",
                    isActive ? "bg-pink-light text-primary" : "hover:bg-background/50"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12.5px] font-semibold truncate">{e.name}</span>
                    <span className={cn("text-[12.5px] font-extrabold", notaColor(prom))}>
                      {prom != null ? prom.toFixed(1) : "—"}
                    </span>
                  </div>
                  {e.hasPie && <Badge variant="outline" className="mt-0.5 text-[8.5px] h-4 px-1">PIE</Badge>}
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <div className="rounded-[14px] border border-border bg-card p-5">
        {seleccionado ? (
          <>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-[18px] font-extrabold">{seleccionado.name}</h3>
                <p className="text-[12px] text-muted-foreground">
                  {curso} · {asignatura}
                  {seleccionado.hasPie && <Badge variant="outline" className="ml-2 text-[9px]">PIE</Badge>}
                </p>
              </div>
              <Link
                href={buildUrl("/perfil-360", withAsignatura({ curso, alumno: seleccionado.id }, asignatura))}
                className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 py-1.5 text-[12px] font-semibold hover:border-primary"
              >
                <Eye className="h-3.5 w-3.5" /> Perfil 360
              </Link>
            </div>

            {Object.values(seleccionado.notas).filter(v => !isNaN(parseFloat(v))).length >= 2 && (
              <div className="rounded-[12px] bg-background border border-border p-3 mb-4">
                <div className="text-[11px] font-bold text-muted-foreground mb-2 inline-flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" /> Tendencia
                </div>
                <MiniSparkline notas={seleccionado.notas} width={300} height={64} />
              </div>
            )}

            <h4 className="text-[12.5px] font-extrabold mb-2">Notas registradas</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {evaluaciones.map(ev => {
                const v = parseFloat(seleccionado.notas[ev.id])
                const valid = !isNaN(v)
                return (
                  <div key={ev.id} className={cn(
                    "rounded-[10px] border border-border p-2.5",
                    valid ? notaBg(v, "light") : "bg-background"
                  )}>
                    <div className="text-[10px] text-muted-foreground truncate">{ev.label}</div>
                    <div className={cn("mt-0.5 text-[18px] font-extrabold", valid ? notaColor(v) : "text-muted-foreground")}>
                      {valid ? v.toFixed(1) : "—"}
                    </div>
                    {ev.oaIds && ev.oaIds.length > 0 && (
                      <div className="text-[9px] text-muted-foreground mt-0.5">{ev.oaIds.length} OA</div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <p className="text-[12.5px] text-muted-foreground">Selecciona un estudiante para ver el detalle.</p>
        )}
      </div>
    </div>
  )
}

function CoberturaView({ estudiantes, evaluaciones, oaOpciones }: {
  estudiantes: EstudianteCalif[]
  evaluaciones: Evaluacion[]
  oaOpciones: OaOpcion[]
}) {
  const oaIdsUsados = useMemo(() => {
    const set = new Set<string>()
    evaluaciones.forEach(ev => (ev.oaIds || []).forEach(oa => set.add(oa)))
    return Array.from(set)
  }, [evaluaciones])

  const oaInfo = useMemo(() => {
    return oaIdsUsados.map(id => {
      const found = oaOpciones.find(o => o.id === id)
      return { id, label: found?.label || id, descripcion: found?.descripcion || "" }
    })
  }, [oaIdsUsados, oaOpciones])

  if (oaInfo.length === 0) {
    return (
      <div className="rounded-[14px] border border-dashed border-border bg-card p-8 text-center text-[12.5px] text-muted-foreground">
        Aún no has vinculado evaluaciones a OAs. Vincula al menos una en la pestaña &quot;Tabla densa&quot; → &quot;Nueva evaluación&quot;.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-[10px] border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/30 px-3 py-2 text-[11.5px] text-blue-900 dark:text-blue-100">
        <Hash className="inline h-3.5 w-3.5 mr-1" />
        Heatmap de cobertura: cada celda muestra el promedio del estudiante en las evaluaciones que tocan ese OA.
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-border bg-card">
        <table className="min-w-full text-[12px]">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="sticky left-0 z-10 bg-background px-3 py-2 text-left font-extrabold text-[11.5px] min-w-[200px]">Estudiante</th>
              {oaInfo.map(oa => (
                <th key={oa.id} className="px-2 py-2 text-center font-extrabold text-[11px] min-w-[70px]" title={oa.descripcion}>
                  {oa.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {estudiantes.map(est => (
              <tr key={est.id} className="border-b border-border last:border-b-0">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5 text-[12px] font-medium truncate max-w-[200px]">
                  {est.name}
                  {est.hasPie && <Badge variant="outline" className="ml-1 text-[8.5px] h-4 px-1">PIE</Badge>}
                </td>
                {oaInfo.map(oa => {
                  const evalsDeOa = evaluaciones.filter(ev => (ev.oaIds || []).includes(oa.id))
                  const notas = evalsDeOa.map(ev => parseFloat(est.notas[ev.id])).filter(n => !isNaN(n))
                  const prom = notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null
                  return (
                    <td key={oa.id} className={cn("px-2 py-1.5 text-center", prom != null && notaBg(prom, "strong"))}>
                      <div className={cn("text-[12.5px] font-extrabold", notaColor(prom))}>
                        {prom != null ? prom.toFixed(1) : "—"}
                      </div>
                      {notas.length > 0 && (
                        <div className="text-[9px] text-muted-foreground/70">{notas.length}× ev</div>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
