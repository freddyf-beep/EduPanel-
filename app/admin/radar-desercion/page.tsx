"use client"

import { useEffect, useState, useMemo } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import { getFeatureFlags } from "@/lib/feature-flags"
import { cargarHorarioSemanal } from "@/lib/horario"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { evaluarAlumno, AlertaAlumno } from "@/lib/alertas"
import {
  listarLibroClasesCurso,
  cargarObservaciones360,
  userDoc
} from "@/lib/curriculo"
import { getDoc } from "firebase/firestore"
import { useActiveSubject } from "@/hooks/use-active-subject"
import {
  AlertTriangle,
  Loader2,
  TrendingUp,
  Users,
  Search,
  BookOpen,
  ArrowRight,
  ShieldCheck,
  Brain,
  X,
  FileSpreadsheet,
  CheckCircle,
  HelpCircle
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

interface StudentRiskItem {
  id: string
  nombre: string
  curso: string
  promedio: number | null
  porcentajeAsistencia: number | null
  alertas: AlertaAlumno[]
  severidad: "Bajo" | "Medio" | "Crítico"
  observaciones: string[]
}

function buildCalifId(asignatura: string, curso: string) {
  return (`calif_${asignatura}_${curso}`)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

function calcPromedio(notas: Record<string, string>) {
  const vals = Object.values(notas).map((v) => parseFloat(v)).filter((v) => !Number.isNaN(v))
  if (!vals.length) return null
  return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1))
}

export default function RadarDesercionPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [featureActive, setFeatureActive] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(true)
  
  const [students, setStudents] = useState<StudentRiskItem[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<StudentRiskItem | null>(null)
  
  // IA modal state
  const [aiReport, setAiReport] = useState<any | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  
  const [searchQuery, setSearchQuery] = useState("")
  const [filterSeveridad, setFilterSeveridad] = useState<"Todos" | "Crítico" | "Medio" | "Bajo">("Todos")

  // Check Feature Flag first
  useEffect(() => {
    if (isReady && isAdmin) {
      getFeatureFlags().then(flags => {
        setFeatureActive(!!flags["radar-desercion"]?.active)
        setLoadingConfig(false)
      }).catch(err => {
        console.error("Error loading feature flags", err)
        setLoadingConfig(false)
      })
    }
  }, [isReady, isAdmin])

  // Load students, grades, and calculate risks
  useEffect(() => {
    if (!isReady || !isAdmin || !featureActive) return
    
    let isCancelled = false

    async function loadData() {
      if (isCancelled) return
      setLoadingData(true)

      try {
        const hData = await cargarHorarioSemanal()
        const cursos = Array.from(new Set(hData.map(h => h.resumen)))
        
        const tempStudents: StudentRiskItem[] = []

        for (const curso of cursos) {
          const [librosData, califSnap, estDocs] = await Promise.all([
            listarLibroClasesCurso(ASIGNATURA, curso),
            getDoc(userDoc("calificaciones", buildCalifId(ASIGNATURA, curso))),
            cargarEstudiantes(curso)
          ])

          const calif = califSnap.exists() ? califSnap.data() : null
          const studentGradesMap = new Map<string, Record<string, string>>()
          if (calif?.estudiantes?.length) {
            for (const est of calif.estudiantes) {
              studentGradesMap.set(est.name, est.notas || {})
            }
          }

          // Asistencia map
          const presentCountMap = new Map<string, number>()
          const totalClassesMap = new Map<string, number>()

          for (const libro of (librosData as any[])) {
            for (const bloque of libro.bloques) {
              for (const a of bloque.asistencia) {
                const curP = presentCountMap.get(a.nombre) || 0
                const curT = totalClassesMap.get(a.nombre) || 0
                if (a.estado === "presente" || a.estado === "atraso") {
                  presentCountMap.set(a.nombre, curP + 1)
                }
                totalClassesMap.set(a.nombre, curT + 1)
              }
            }
          }

          // Load observations and evaluate alerts for each student
          for (const est of estDocs) {
            const notas = studentGradesMap.get(est.nombre) || {}
            const promedio = calcPromedio(notas)

            const totalClasses = totalClassesMap.get(est.nombre) || 0
            const presentClasses = presentCountMap.get(est.nombre) || 0
            const pctAsistencia = totalClasses > 0
              ? Math.round((presentClasses / totalClasses) * 100)
              : null

            // Cargar observaciones
            const obsData = await cargarObservaciones360(ASIGNATURA, curso, est.id).catch(() => [])

            const alerts = evaluarAlumno({
              promedio,
              porcentajeAsistencia: pctAsistencia,
              pie: !!est.pie,
              notas,
              observaciones: obsData
            })

            // Calculate overall risk
            let severidad: "Bajo" | "Medio" | "Crítico" = "Bajo"
            if (alerts.some(a => a.severidad === "alta") || (pctAsistencia !== null && pctAsistencia < 70) || (promedio !== null && promedio < 4.0)) {
              severidad = "Crítico"
            } else if (alerts.length > 0 || (pctAsistencia !== null && pctAsistencia < 85)) {
              severidad = "Medio"
            }

            tempStudents.push({
              id: est.id,
              nombre: est.nombre,
              curso,
              promedio,
              porcentajeAsistencia: pctAsistencia,
              alertas: alerts,
              severidad,
              observaciones: obsData.map(o => o.texto)
            })
          }
        }

        if (!isCancelled) {
          // Sort Critical first, then Medium, then Low
          tempStudents.sort((a, b) => {
            const riskMap = { "Crítico": 3, "Medio": 2, "Bajo": 1 }
            return riskMap[b.severidad] - riskMap[a.severidad]
          })
          setStudents(tempStudents)
        }
      } catch (err) {
        console.error("Error loading radar data", err)
      } finally {
        if (!isCancelled) setLoadingData(false)
      }
    }

    void Promise.resolve().then(loadData)

    return () => {
      isCancelled = true
    }
  }, [isReady, isAdmin, featureActive, ASIGNATURA])

  // Get AI predictive summary
  const getAiPrediction = async (student: StudentRiskItem) => {
    setLoadingAi(true)
    setAiError(null)
    setAiReport(null)
    try {
      const res = await apiFetch("/api/predecir-desercion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: student.nombre,
          curso: student.curso,
          promedio: student.promedio ?? "Sin notas",
          asistencia: student.porcentajeAsistencia ?? 100,
          observaciones: student.observaciones,
          alertas: student.alertas.map(a => `${a.titulo}: ${a.detalle}`)
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Error al obtener reporte IA.")
      }

      const data = await res.json()
      setAiReport(data.analisis)
    } catch (err: any) {
      console.error(err)
      setAiError(err.message || "No se pudo generar el reporte predictivo.")
    } finally {
      setLoadingAi(false)
    }
  }

  // Filter students
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchesSearch = s.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || s.curso.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesRisk = filterSeveridad === "Todos" || s.severidad === filterSeveridad
      return matchesSearch && matchesRisk
    })
  }, [students, searchQuery, filterSeveridad])

  // Stats summary
  const stats = useMemo(() => {
    const total = students.length
    const critical = students.filter(s => s.severidad === "Crítico").length
    const medium = students.filter(s => s.severidad === "Medio").length
    const low = students.filter(s => s.severidad === "Bajo").length
    return { total, critical, medium, low }
  }, [students])

  if (!isReady || loadingConfig) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
        <p className="text-sm text-muted-foreground mt-3">Validando acceso y configuraciones...</p>
      </div>
    )
  }

  if (!isAdmin) return null

  // If feature flag is off, show Premium locked state
  if (!featureActive) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="bg-card border border-border rounded-[24px] p-8 text-center space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-red-500 via-amber-500 to-indigo-500" />
          <div className="w-16 h-16 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-md">
            <AlertTriangle className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold">Radar de Deserción Escolar (IA)</h1>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Analiza de forma predictiva a los alumnos con riesgo académico y de asistencia. Esta función se encuentra inhabilitada actualmente.
            </p>
          </div>
          <div className="bg-muted/40 p-4 rounded-xl text-left text-xs max-w-md mx-auto space-y-2 border border-border">
            <div className="font-bold flex items-center gap-1.5 text-foreground">
              <Brain className="w-3.5 h-3.5 text-indigo-500" />
              ¿Qué hace esta función al activarse?
            </div>
            <ul className="list-disc pl-4 text-muted-foreground space-y-1">
              <li>Evalúa los promedios parciales y finales contra límites críticos.</li>
              <li>Detecta inasistencias acumuladas fuera de rangos del Decreto 67.</li>
              <li>Genera reportes de predicción y factores de protección con Gemini.</li>
            </ul>
          </div>
          <div>
            <a
              href="/admin/features"
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl shadow-md transition-all text-sm"
            >
              Habilitar en Funciones IA
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto pb-12 space-y-8 animate-fadeIn">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
            <AlertTriangle className="w-8 h-8 text-rose-500 animate-bounce" />
            Radar de Deserción Escolar
          </h1>
          <p className="text-muted-foreground">
            Monitoreo preventivo y proyecciones de permanencia escolar basadas en rendimiento y asistencia.
          </p>
        </div>
      </div>

      {loadingData ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
          <p className="text-sm text-muted-foreground mt-3">Calculando riesgos de deserción del establecimiento...</p>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Analizados</div>
              <div className="text-3xl font-extrabold mt-1">{stats.total}</div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-indigo-500" /> Alumnos activos
              </div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm bg-rose-50/40 dark:bg-rose-950/10 border-rose-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">Riesgo Crítico</div>
              <div className="text-3xl font-extrabold mt-1 text-rose-700 dark:text-rose-400">{stats.critical}</div>
              <div className="text-xs text-rose-600 dark:text-rose-500 mt-1">Requiere intervención inmediata</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm bg-amber-50/40 dark:bg-amber-950/10 border-amber-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">En Alerta</div>
              <div className="text-3xl font-extrabold mt-1 text-amber-700 dark:text-amber-400">{stats.medium}</div>
              <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">Seguimiento en aula</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm bg-emerald-50/40 dark:bg-emerald-950/10 border-emerald-200">
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Estables</div>
              <div className="text-3xl font-extrabold mt-1 text-emerald-700 dark:text-emerald-400">{stats.low}</div>
              <div className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">Permanencia esperada</div>
            </div>
          </div>

          {/* Filtering and list */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-4">
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: "Todos", label: `Todos (${stats.total})` },
                  { key: "Crítico", label: `Críticos (${stats.critical})`, cls: "text-rose-600 hover:bg-rose-50 border-rose-200" },
                  { key: "Medio", label: `En Alerta (${stats.medium})`, cls: "text-amber-600 hover:bg-amber-50 border-amber-200" },
                  { key: "Bajo", label: `Estables (${stats.low})`, cls: "text-emerald-600 hover:bg-emerald-50 border-emerald-200" }
                ].map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setFilterSeveridad(tab.key as any)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg border border-border text-xs font-bold transition-all",
                      filterSeveridad === tab.key
                        ? "bg-slate-900 text-white border-slate-900 dark:bg-slate-100 dark:text-slate-900"
                        : "bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative w-full md:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Buscar estudiante o curso..."
                  className="w-full h-9 rounded-lg border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Student Table/List */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground font-bold">
                    <th className="py-3 px-4">Estudiante</th>
                    <th className="py-3 px-4">Curso</th>
                    <th className="py-3 px-4">Asistencia</th>
                    <th className="py-3 px-4">Promedio</th>
                    <th className="py-3 px-4 text-center">Alertas</th>
                    <th className="py-3 px-4">Estado de Riesgo</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredStudents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground italic">
                        No se encontraron estudiantes para los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    filteredStudents.map(student => (
                      <tr key={student.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-foreground">{student.nombre}</td>
                        <td className="py-3.5 px-4 font-semibold text-muted-foreground">{student.curso}</td>
                        <td className={cn(
                          "py-3.5 px-4 font-bold",
                          student.porcentajeAsistencia !== null && student.porcentajeAsistencia < 70 ? "text-rose-600" :
                          student.porcentajeAsistencia !== null && student.porcentajeAsistencia < 85 ? "text-amber-600" : "text-emerald-600"
                        )}>
                          {student.porcentajeAsistencia !== null ? `${student.porcentajeAsistencia}%` : "—"}
                        </td>
                        <td className={cn(
                          "py-3.5 px-4 font-bold",
                          student.promedio !== null && student.promedio < 4.0 ? "text-rose-600" :
                          student.promedio !== null && student.promedio < 5.0 ? "text-amber-600" : "text-emerald-600"
                        )}>
                          {student.promedio !== null ? student.promedio.toFixed(1) : "—"}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-bold",
                            student.alertas.length > 0
                              ? "bg-rose-50 text-rose-700 dark:bg-rose-950/20 dark:text-rose-400"
                              : "bg-muted text-muted-foreground"
                          )}>
                            {student.alertas.length} alertas
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase",
                            student.severidad === "Crítico" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" :
                            student.severidad === "Medio" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                            "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                          )}>
                            <span className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              student.severidad === "Crítico" ? "bg-rose-500 animate-ping" :
                              student.severidad === "Medio" ? "bg-amber-500" : "bg-emerald-500"
                            )} />
                            {student.severidad}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSelectedStudent(student)
                              setAiReport(null)
                              setAiError(null)
                            }}
                            className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-[11px] transition-all cursor-pointer shadow-sm inline-flex items-center gap-1"
                          >
                            Ver Análisis
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Details Side Drawer/Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-sm">
          <div className="bg-card w-full max-w-2xl h-full border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-lg text-foreground">{selectedStudent.nombre}</h3>
                <p className="text-xs text-muted-foreground">{selectedStudent.curso} · Análisis de Permanencia</p>
              </div>
              <button
                onClick={() => setSelectedStudent(null)}
                className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded-md"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* KPIs & Alerts */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-muted/40 p-3 rounded-lg border border-border">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Asistencia</div>
                  <div className="text-xl font-bold mt-1 text-foreground">
                    {selectedStudent.porcentajeAsistencia !== null ? `${selectedStudent.porcentajeAsistencia}%` : "—"}
                  </div>
                </div>
                <div className="bg-muted/40 p-3 rounded-lg border border-border">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Promedio</div>
                  <div className="text-xl font-bold mt-1 text-foreground">
                    {selectedStudent.promedio !== null ? selectedStudent.promedio.toFixed(1) : "—"}
                  </div>
                </div>
                <div className="bg-muted/40 p-3 rounded-lg border border-border">
                  <div className="text-[10px] font-bold text-muted-foreground uppercase">Riesgo</div>
                  <div className="text-xl font-bold mt-1 text-foreground">{selectedStudent.severidad}</div>
                </div>
              </div>

              {/* System Alerts */}
              <div className="space-y-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Alertas del Historial</h4>
                {selectedStudent.alertas.length === 0 ? (
                  <div className="bg-emerald-50/50 dark:bg-emerald-950/10 border border-emerald-200 p-3 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    Sin factores de riesgo inmediatos detectados por algoritmos básicos.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {selectedStudent.alertas.map((a, i) => (
                      <div key={i} className="border border-border bg-card p-3 rounded-xl flex items-start gap-2.5 text-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5" />
                        <div>
                          <div className="font-bold text-foreground">{a.titulo}</div>
                          <div className="text-muted-foreground mt-0.5">{a.detalle}</div>
                          <div className="text-indigo-600 dark:text-indigo-400 font-semibold mt-1">Intervención: {a.accion}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* AI Predictor Trigger */}
              <div className="border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-5 rounded-2xl space-y-4">
                <div className="flex items-start gap-3">
                  <Brain className="w-6 h-6 text-indigo-500 animate-pulse mt-0.5" />
                  <div>
                    <h4 className="font-bold text-sm text-foreground">Análisis Cualitativo Predictivo con IA</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                      Proyecta la probabilidad de deserción del alumno en base al historial de bitácora docente y sugiere un plan de apoyo multidimensional personalizado.
                    </p>
                  </div>
                </div>

                {!aiReport && !loadingAi && (
                  <button
                    onClick={() => getAiPrediction(selectedStudent)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    Ejecutar Predicción IA
                  </button>
                )}

                {loadingAi && (
                  <div className="py-4 text-center space-y-2">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                    <p className="text-xs text-muted-foreground">Gemini está analizando las bitácoras y registros del alumno...</p>
                  </div>
                )}

                {aiError && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-800 dark:text-red-300 p-3 rounded-lg text-xs">
                    {aiError}
                  </div>
                )}

                {aiReport && (
                  <div className="space-y-4 border-t border-indigo-100 dark:border-indigo-900/50 pt-4 text-xs leading-relaxed animate-fadeIn">
                    <div className="grid grid-cols-2 gap-3 bg-card border border-border p-3 rounded-xl">
                      <div>
                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Probabilidad Deserción</div>
                        <div className="text-lg font-extrabold mt-0.5 text-indigo-600">{aiReport.probabilidadDesercion}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase font-bold text-muted-foreground">Nivel Proyectado</div>
                        <div className="text-lg font-extrabold mt-0.5 text-foreground">{aiReport.nivelRiesgo}</div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h5 className="font-bold flex items-center gap-1 text-foreground"><HelpCircle className="w-3.5 h-3.5 text-indigo-500" /> Diagnóstico Predictivo</h5>
                      <p className="text-muted-foreground bg-card border border-border p-3 rounded-xl">{aiReport.analisisCualitativo}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-card border border-border p-3 rounded-xl space-y-1">
                        <div className="font-bold text-rose-600">Factores de Riesgo</div>
                        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                          {aiReport.factoresRiesgo?.map((f: string, i: number) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-card border border-border p-3 rounded-xl space-y-1">
                        <div className="font-bold text-emerald-600">Factores Protectores</div>
                        <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground text-[11px]">
                          {aiReport.factoresProtectores?.map((f: string, i: number) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="bg-card border border-border p-3 rounded-xl space-y-1.5">
                      <h5 className="font-bold text-indigo-700 dark:text-indigo-400">Plan de Acción / Intervención Sugerido</h5>
                      <ul className="list-decimal pl-4 space-y-1 text-muted-foreground">
                        {aiReport.planIntervencionSugerido?.map((item: string, i: number) => (
                          <li key={i}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(aiReport, null, 2)], { type: "application/json" })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement("a")
                          a.href = url
                          a.download = `Reporte_Desercion_${selectedStudent.nombre.replace(/\s+/g, "_")}.json`
                          a.click()
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 shadow-sm"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        Exportar Reporte
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
