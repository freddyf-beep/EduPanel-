"use client"

import { useEffect, useState, useMemo } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import { getFeatureFlags } from "@/lib/feature-flags"
import { cargarHorarioSemanal } from "@/lib/horario"
import {
  cargarPlanCurso,
  getUnidades,
  listarLibroClasesCurso,
  UnidadPlan,
  Unidad
} from "@/lib/curriculo"
import { cargarNivelMapping, resolveNivel } from "@/lib/nivel-mapping"
import { cargarPruebas } from "@/lib/pruebas"
import { cargarGuias } from "@/lib/guias"
import { useActiveSubject } from "@/hooks/use-active-subject"
import {
  TrendingUp,
  Loader2,
  BookOpen,
  ArrowRight,
  Brain,
  CheckCircle,
  AlertTriangle,
  X,
  FileText,
  Calendar,
  Sparkles,
  HelpCircle,
  FileSpreadsheet
} from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch } from "@/lib/api-client"

interface OAProgress {
  codigo: string
  descripcion: string
  estado: "cubierto" | "parcial" | "no-cubierto"
  origen: string[]
}

export default function PredictorCoberturaPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const { asignatura: ASIGNATURA } = useActiveSubject()
  const [featureActive, setFeatureActive] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(true)

  const [cursosDisponibles, setCursosDisponibles] = useState<string[]>([])
  const [selectedCurso, setSelectedCurso] = useState("")
  const [loadingData, setLoadingData] = useState(false)

  // Curricular metrics state
  const [nivel, setNivel] = useState<string | null>(null)
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [clasesFirmadas, setClasesFirmadas] = useState<number>(0)
  const [oasProgress, setOasProgress] = useState<OAProgress[]>([])
  
  // IA optimizer state
  const [aiReport, setAiReport] = useState<any | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const [semanasRestantes, setSemanasRestantes] = useState<number>(14)

  // Check Feature Flag first
  useEffect(() => {
    if (isReady && isAdmin) {
      getFeatureFlags().then(flags => {
        setFeatureActive(!!flags["predictor-cobertura"]?.active)
        setLoadingConfig(false)
      }).catch(err => {
        console.error("Error loading feature flags", err)
        setLoadingConfig(false)
      })
    }
  }, [isReady, isAdmin])

  // Load courses
  useEffect(() => {
    if (!isReady || !isAdmin || !featureActive) return
    cargarHorarioSemanal().then(hData => {
      const unique = Array.from(new Set(hData.map(h => h.resumen)))
      setCursosDisponibles(unique)
      if (unique.length > 0) setSelectedCurso(unique[0])
    })
  }, [isReady, isAdmin, featureActive])

  // Calculate curricular coverage for the selected course
  useEffect(() => {
    if (!selectedCurso || !featureActive) return
    
    let isCancelled = false

    async function calculateCoverage() {
      if (isCancelled) return
      setLoadingData(true)
      setAiReport(null)
      setAiError(null)

      try {
        const mapping = await cargarNivelMapping()
        const resolvedNivel = resolveNivel(selectedCurso, mapping, ASIGNATURA)
        if (!resolvedNivel) {
          if (!isCancelled) {
            setNivel(null)
            setUnidades([])
            setOasProgress([])
            setClasesFirmadas(0)
            setLoadingData(false)
          }
          return
        }

        if (!isCancelled) setNivel(resolvedNivel)

        // Load all standard units, class book records, tests and guides
        const [unidadesOficiales, libroClases, pruebas, guias] = await Promise.all([
          getUnidades(ASIGNATURA, resolvedNivel),
          listarLibroClasesCurso(ASIGNATURA, selectedCurso),
          cargarPruebas(ASIGNATURA, selectedCurso),
          cargarGuias(ASIGNATURA, selectedCurso)
        ])

        if (isCancelled) return

        setUnidades(unidadesOficiales)
        setClasesFirmadas(libroClases.length)

        // Gather all OAs from the curriculum units
        const allOasMap = new Map<string, { codigo: string; descripcion: string; origen: string[] }>()
        for (const unit of unidadesOficiales) {
          const oas = unit.objetivos_aprendizaje || []
          for (const oa of oas) {
            const code = oa.id || (oa.numero ? `OA${oa.numero}` : "")
            if (!code) continue
            allOasMap.set(code.toUpperCase().replace(/\s+/g, ""), {
              codigo: code,
              descripcion: oa.descripcion || "",
              origen: []
            })
          }
        }

        // 1. Mark OAs found in class book signatures
        for (const lc of (libroClases as any[])) {
          for (const block of lc.bloques || []) {
            const objText = block.objetivo || ""
            const matches = objText.match(/\bOA\s*\d+/gi)
            if (matches) {
              for (const m of matches) {
                const norm = m.toUpperCase().replace(/\s+/g, "")
                const oaObj = allOasMap.get(norm)
                if (oaObj) {
                  if (!oaObj.origen.includes("Libro de Clases")) {
                    oaObj.origen.push("Libro de Clases")
                  }
                }
              }
            }
          }
        }

        // 2. Mark OAs found in tests
        for (const p of pruebas) {
          const oas = p.metadatosCurriculares?.objetivos || []
          for (const oa of oas) {
            const matches = oa.match(/\bOA\s*\d+/gi)
            if (matches) {
              for (const m of matches) {
                const norm = m.toUpperCase().replace(/\s+/g, "")
                const oaObj = allOasMap.get(norm)
                if (oaObj) {
                  if (!oaObj.origen.includes("Prueba")) {
                    oaObj.origen.push("Prueba")
                  }
                }
              }
            }
          }
        }

        // 3. Mark OAs found in guides
        for (const g of guias) {
          const oas = g.metadatosCurriculares?.objetivos || []
          for (const oa of oas) {
            const matches = oa.match(/\bOA\s*\d+/gi)
            if (matches) {
              for (const m of matches) {
                const norm = m.toUpperCase().replace(/\s+/g, "")
                const oaObj = allOasMap.get(norm)
                if (oaObj) {
                  if (!oaObj.origen.includes("Guía")) {
                    oaObj.origen.push("Guía")
                  }
                }
              }
            }
          }
        }

        // Compute coverage status
        const progressList: OAProgress[] = Array.from(allOasMap.values()).map(oa => {
          let estado: "cubierto" | "parcial" | "no-cubierto" = "no-cubierto"
          if (oa.origen.includes("Prueba")) {
            estado = "cubierto"
          } else if (oa.origen.length > 0) {
            estado = "parcial"
          }
          return {
            codigo: oa.codigo,
            descripcion: oa.descripcion,
            estado,
            origen: oa.origen
          }
        })

        if (!isCancelled) {
          setOasProgress(progressList)
        }
      } catch (err) {
        console.error("Error computing coverage", err)
      } finally {
        if (!isCancelled) setLoadingData(false)
      }
    }

    void Promise.resolve().then(calculateCoverage)

    return () => {
      isCancelled = true
    }
  }, [selectedCurso, featureActive, ASIGNATURA])

  // Coverage statistics
  const stats = useMemo(() => {
    const total = oasProgress.length
    const covered = oasProgress.filter(o => o.estado === "cubierto").length
    const partial = oasProgress.filter(o => o.estado === "parcial").length
    const pending = oasProgress.filter(o => o.estado === "no-cubierto").length
    
    const pctActual = total > 0 ? Math.round((covered / total) * 100) : 0
    const pctParcial = total > 0 ? Math.round(((covered + partial) / total) * 100) : 0

    // Velocity projection
    // e.g. classes per week = 2. Velocity = covered / classes.
    // If clasesFirmadas = 0, fallback velocity.
    const classesHeld = Math.max(clasesFirmadas, 1)
    const velocity = covered / classesHeld
    const estimatedRemainingClasses = semanasRestantes * 2
    const projectedNewOasCovered = Math.round(velocity * estimatedRemainingClasses)
    const pctProyectado = Math.min(100, Math.round(((covered + projectedNewOasCovered) / Math.max(total, 1)) * 100))

    return { total, covered, partial, pending, pctActual, pctParcial, pctProyectado }
  }, [oasProgress, clasesFirmadas, semanasRestantes])

  // Request AI curriculum adjustments optimizer
  const getAiAdjustments = async () => {
    setLoadingAi(true)
    setAiError(null)
    setAiReport(null)
    try {
      const res = await apiFetch("/api/predecir-cobertura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asignatura: ASIGNATURA,
          curso: selectedCurso,
          totalOas: stats.total,
          oasCubiertos: stats.covered,
          oasParciales: stats.partial,
          oasPendientes: stats.pending,
          clasesFirmadas: clasesFirmadas,
          semanasRestantes: semanasRestantes,
          detallesOas: oasProgress.map(o => `${o.codigo}: Estado ${o.estado} (Origen: ${o.origen.join(",")})`)
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Error al obtener optimización IA.")
      }

      const data = await res.json()
      setAiReport(data.reporte)
    } catch (err: any) {
      console.error(err)
      setAiError(err.message || "No se pudo optimizar la cobertura.")
    } finally {
      setLoadingAi(false)
    }
  }

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
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-500" />
          <div className="w-16 h-16 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-md">
            <TrendingUp className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold">Predictor de Cobertura Curricular (IA)</h1>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Proyecta el cumplimiento del currículo escolar chileno comparando tu planificación y libro de clases. Esta función se encuentra inhabilitada actualmente.
            </p>
          </div>
          <div className="bg-muted/40 p-4 rounded-xl text-left text-xs max-w-md mx-auto space-y-2 border border-border">
            <div className="font-bold flex items-center gap-1.5 text-foreground">
              <Brain className="w-3.5 h-3.5 text-indigo-500" />
              ¿Qué aporta este módulo?
            </div>
            <ul className="list-disc pl-4 text-muted-foreground space-y-1">
              <li>Mide la tasa real de cumplimiento de los Objetivos de Aprendizaje.</li>
              <li>Calcula la velocidad pedagógica proyectando la cobertura de fin de año.</li>
              <li>Sugiere fisiones de contenidos (compactación curricular) con IA.</li>
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
            <TrendingUp className="w-8 h-8 text-emerald-500" />
            Predictor de Cobertura Curricular
          </h1>
          <p className="text-muted-foreground">
            Visualiza el avance de tus OAs planificados y optimiza el calendario escolar antes del cierre del año.
          </p>
        </div>
        
        {/* Selector de curso */}
        {cursosDisponibles.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-bold text-muted-foreground">Curso:</label>
            <select
              value={selectedCurso}
              onChange={e => setSelectedCurso(e.target.value)}
              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold outline-none focus:border-indigo-500"
            >
              {cursosDisponibles.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
      </div>

      {!nivel ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="font-bold text-sm">Nivel curricular no mapeado</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            El curso <span className="font-semibold text-foreground">{selectedCurso}</span> no tiene un nivel curricular oficial mapeado. Puedes configurarlo en la sección de Administración General.
          </p>
        </div>
      ) : loadingData ? (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500" />
          <p className="text-sm text-muted-foreground mt-3">Calculando cobertura curricular y cruzando firmas...</p>
        </div>
      ) : (
        <>
          {/* Progress Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Coverage current and projected */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Cobertura Oficial Real</h4>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-extrabold text-foreground">{stats.pctActual}%</div>
                  <p className="text-xs text-emerald-600 font-semibold mt-1">OAs completamente cubiertos</p>
                </div>
                <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 flex items-center justify-center font-extrabold text-sm border-2 border-emerald-300">
                  {stats.covered}/{stats.total}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-muted-foreground">
                  <span>Avance Real + Guías</span>
                  <span>{stats.pctParcial}%</span>
                </div>
                <div className="w-full bg-muted h-1.5 rounded-full overflow-hidden">
                  <div className="bg-teal-500 h-full" style={{ width: `${stats.pctParcial}%` }} />
                </div>
              </div>
            </div>

            {/* Projection Card */}
            <div className={cn(
              "bg-card border border-border rounded-xl p-5 shadow-sm space-y-4",
              stats.pctProyectado < 85 ? "border-amber-200 bg-amber-50/10" : "border-emerald-200"
            )}>
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Proyección a Fin de Año</h4>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-extrabold text-foreground">{stats.pctProyectado}%</div>
                  <p className="text-xs text-muted-foreground mt-1">Estimación de cumplimiento</p>
                </div>
                {stats.pctProyectado < 100 ? (
                  <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-600 flex items-center justify-center shadow-sm">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 flex items-center justify-center shadow-sm">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[10px] font-bold text-muted-foreground">Semanas Académicas Restantes:</label>
                  <input
                    type="number"
                    value={semanasRestantes}
                    onChange={e => setSemanasRestantes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full h-7 rounded border border-border bg-background px-2 text-xs font-semibold outline-none focus:border-indigo-500 mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Curriculum Velocity Card */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <h4 className="font-bold text-xs uppercase tracking-wider text-muted-foreground">Registros de Avance</h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase">Clases Firmadas</div>
                  <div className="text-lg font-extrabold mt-0.5 text-foreground">{clasesFirmadas}</div>
                </div>
                <div className="bg-muted/40 p-2.5 rounded-lg border border-border">
                  <div className="text-[9px] font-bold text-muted-foreground uppercase">Nivel Mineduc</div>
                  <div className="text-[11px] font-extrabold mt-1 truncate text-foreground" title={nivel}>{nivel}</div>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                El algoritmo analiza los códigos (ej. OA1) detectados en el Libro de Clases y los evalúa contra las evaluaciones.
              </p>
            </div>
          </div>

          {/* List and Optimization */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            
            {/* OAs list */}
            <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 lg:col-span-2">
              <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
                <BookOpen className="w-4 h-4 text-indigo-500" />
                Avance por Objetivo de Aprendizaje (OA)
              </h3>
              
              <div className="divide-y divide-border max-h-[500px] overflow-y-auto pr-2 space-y-2">
                {oasProgress.map(oa => (
                  <div key={oa.codigo} className="py-3 flex items-start gap-4 text-xs">
                    <span className={cn(
                      "px-2 py-0.5 rounded-md font-extrabold text-[10px] uppercase flex-shrink-0 mt-0.5",
                      oa.estado === "cubierto" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                      oa.estado === "parcial" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400" :
                      "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-400"
                    )}>
                      {oa.codigo}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground leading-relaxed">{oa.descripcion}</p>
                      <div className="flex flex-wrap gap-1 mt-1 text-[10px] text-muted-foreground">
                        {oa.origen.length === 0 ? (
                          <span>Sin registros</span>
                        ) : (
                          oa.origen.map((o, idx) => (
                            <span key={idx} className="bg-muted px-1.5 py-0.5 rounded border border-border">{o}</span>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Advisor Card */}
            <div className="border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/15 p-5 rounded-2xl space-y-4">
              <div className="flex items-start gap-3">
                <Brain className="w-6 h-6 text-indigo-500 animate-pulse mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm text-foreground">Asistente de Ajuste Curricular IA</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                    Genera una propuesta inteligente de compactación de objetivos y adecuaciones de tiempo para maximizar la cobertura del año.
                  </p>
                </div>
              </div>

              {!aiReport && !loadingAi && (
                <button
                  onClick={getAiAdjustments}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  Optimizar Cobertura Curricular
                </button>
              )}

              {loadingAi && (
                <div className="py-4 text-center space-y-2">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" />
                  <p className="text-xs text-muted-foreground">Gemini está analizando los OAs y priorizando fisiones...</p>
                </div>
              )}

              {aiError && (
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-800 dark:text-red-300 p-3 rounded-lg text-xs">
                  {aiError}
                </div>
              )}

              {aiReport && (
                <div className="space-y-4 border-t border-indigo-100 dark:border-indigo-900/50 pt-4 text-xs leading-relaxed animate-fadeIn">
                  <div className="bg-card border border-border p-3 rounded-xl">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground">Cobertura Proyectada con Ajuste</div>
                    <div className="text-xl font-extrabold mt-0.5 text-indigo-600">{aiReport.porcentajeProyectado}</div>
                  </div>

                  <div className="space-y-1">
                    <h5 className="font-bold text-foreground">Diagnóstico del Tiempo</h5>
                    <p className="text-muted-foreground bg-card border border-border p-3 rounded-xl">{aiReport.diagnosticoTiempo}</p>
                  </div>

                  {aiReport.oasEnRiesgo?.length > 0 && (
                    <div className="bg-card border border-border p-3 rounded-xl space-y-1">
                      <div className="font-bold text-rose-600 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> OAs en Riesgo de No Cobertura
                      </div>
                      <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
                        {aiReport.oasEnRiesgo.map((oa: string, idx: number) => (
                          <li key={idx}>{oa}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="bg-card border border-border p-3 rounded-xl space-y-1.5">
                    <h5 className="font-bold text-emerald-700 dark:text-emerald-400">Estrategias de Compactación / Fusión</h5>
                    <ul className="list-decimal pl-4 space-y-1 text-muted-foreground">
                      {aiReport.estrategiaCompactacion?.map((item: string, i: number) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-card border border-border p-3 rounded-xl space-y-1.5">
                    <h5 className="font-bold text-indigo-700 dark:text-indigo-400">Recomendaciones Prácticas</h5>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                      {aiReport.sugerenciasPlanificacion?.map((item: string, i: number) => (
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
                        a.download = `Reporte_Optimacion_Cobertura_${selectedCurso.replace(/\s+/g, "_")}.json`
                        a.click()
                      }}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] flex items-center gap-1.5 shadow-sm"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      Exportar Ajuste
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </>
      )}
    </div>
  )
}
