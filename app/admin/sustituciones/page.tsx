"use client"

import { useEffect, useState, useMemo } from "react"
import { useAdminGuard } from "@/hooks/use-admin-guard"
import { getFeatureFlags } from "@/lib/feature-flags"
import {
  Users,
  Loader2,
  Brain,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  Clipboard,
  Check,
  Calendar,
  Clock,
  BookOpen
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Teacher {
  id: string
  nombre: string
  especialidad: string
  // Horarios ocupados: { "Lunes": [1, 3], "Martes": [2], ... }
  bloquesOcupados: Record<string, number[]>
}

const MOCK_TEACHERS: Teacher[] = [
  { id: "1", nombre: "Constanza Rivas", especialidad: "Matemática", bloquesOcupados: { Lunes: [1, 2], Martes: [3, 4], Miércoles: [1] } },
  { id: "2", nombre: "José Tomás Pérez", especialidad: "Historia", bloquesOcupados: { Lunes: [3, 4], Martes: [1, 2], Jueves: [2] } },
  { id: "3", nombre: "Macarena Soto", especialidad: "Lenguaje", bloquesOcupados: { Miércoles: [1, 2], Jueves: [3, 4], Viernes: [1] } },
  { id: "4", nombre: "Francisco Allende", especialidad: "Matemática", bloquesOcupados: { Lunes: [3], Martes: [4], Miércoles: [2], Viernes: [3, 4] } },
  { id: "5", nombre: "María Paz Larraín", especialidad: "Ciencias", bloquesOcupados: { Lunes: [1], Martes: [2], Jueves: [1, 2], Viernes: [1, 2] } },
  { id: "6", nombre: "Claudio Valdés", especialidad: "Música", bloquesOcupados: { Miércoles: [3, 4], Jueves: [4], Viernes: [2] } }
]

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
const BLOQUES = [
  { id: 1, label: "Bloque 1 (08:00 - 09:30)" },
  { id: 2, label: "Bloque 2 (09:45 - 11:15)" },
  { id: 3, label: "Bloque 3 (11:30 - 13:00)" },
  { id: 4, label: "Bloque 4 (13:15 - 14:45)" }
]

export default function SustitucionesPage() {
  const { isReady, isAdmin } = useAdminGuard()
  const [featureActive, setFeatureActive] = useState(true)
  const [loadingConfig, setLoadingConfig] = useState(true)

  const [ausenteId, setAusenteId] = useState("1")
  const [dia, setDia] = useState("Lunes")
  const [bloqueId, setBloqueId] = useState(1)

  // IA recommendation state
  const [aiReport, setAiReport] = useState<any | null>(null)
  const [loadingAi, setLoadingAi] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Check Feature Flag
  useEffect(() => {
    if (isReady && isAdmin) {
      getFeatureFlags().then(flags => {
        setFeatureActive(!!flags["agente-sustituciones"]?.active)
        setLoadingConfig(false)
      }).catch(err => {
        console.error("Error loading flags", err)
        setLoadingConfig(false)
      })
    }
  }, [isReady, isAdmin])

  // Get absent teacher object
  const ausente = useMemo(() => MOCK_TEACHERS.find(t => t.id === ausenteId) || MOCK_TEACHERS[0], [ausenteId])

  // Candidates calculations
  const candidatos = useMemo(() => {
    return MOCK_TEACHERS.filter(t => t.id !== ausente.id).map(t => {
      const ocupados = t.bloquesOcupados[dia] || []
      const libre = !ocupados.includes(bloqueId)
      const coincidenciaEspecialidad = t.especialidad === ausente.especialidad
      
      return {
        nombre: t.nombre,
        especialidad: t.especialidad,
        libre,
        coincidenciaEspecialidad
      }
    }).sort((a, b) => {
      // Free and same specialty goes first
      if (a.libre && !b.libre) return -1
      if (!a.libre && b.libre) return 1
      if (a.coincidenciaEspecialidad && !b.coincidenciaEspecialidad) return -1
      if (!a.coincidenciaEspecialidad && b.coincidenciaEspecialidad) return 1
      return a.nombre.localeCompare(b.nombre)
    })
  }, [ausente, dia, bloqueId])

  const handleConsultarIA = async () => {
    setLoadingAi(true)
    setAiError(null)
    setAiReport(null)

    try {
      const res = await fetch("/api/sugerir-sustituto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ausenteNombre: ausente.nombre,
          ausenteAsignatura: ausente.especialidad,
          bloqueDia: `${dia}, Bloque ${bloqueId}`,
          candidatos
        })
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || "Error al obtener recomendación.")
      }

      const data = await res.json()
      setAiReport(data.recomendacion)
    } catch (err: any) {
      console.error(err)
      setAiError(err.message || "No se pudo obtener recomendación de la IA.")
    } finally {
      setLoadingAi(false)
    }
  }

  const handleCopy = async () => {
    if (!aiReport?.mensajeInvitacionDocente) return
    await navigator.clipboard.writeText(aiReport.mensajeInvitacionDocente)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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

  // If feature flag is off, show locked premium state
  if (!featureActive) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6">
        <div className="bg-card border border-border rounded-[24px] p-8 text-center space-y-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-violet-500 via-purple-500 to-indigo-500" />
          <div className="w-16 h-16 bg-purple-50 dark:bg-purple-950/20 text-purple-500 rounded-full flex items-center justify-center mx-auto shadow-md">
            <Users className="w-8 h-8 animate-pulse" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-extrabold">Agente Inteligente de Sustituciones (IA)</h1>
            <p className="text-sm text-muted-foreground max-w-lg mx-auto">
              Sugiere de forma automatizada al mejor profesor disponible para cubrir un bloque de clase basándose en horarios y especialidades. Esta función se encuentra inhabilitada actualmente.
            </p>
          </div>
          <div className="bg-muted/40 p-4 rounded-xl text-left text-xs max-w-md mx-auto space-y-2 border border-border">
            <div className="font-bold flex items-center gap-1.5 text-foreground">
              <Brain className="w-3.5 h-3.5 text-indigo-500" />
              ¿Qué aporta este módulo?
            </div>
            <ul className="list-disc pl-4 text-muted-foreground space-y-1">
              <li>Cruza el horario de clases de todos los docentes del establecimiento.</li>
              <li>Busca de manera prioritaria afinidades por departamento o especialidad.</li>
              <li>Genera la redacción automática del mensaje de reemplazo.</li>
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
      <div>
        <h1 className="text-3xl font-extrabold flex items-center gap-3 mb-2">
          <Sparkles className="w-8 h-8 text-indigo-500" />
          Agente Inteligente de Sustituciones
        </h1>
        <p className="text-muted-foreground">
          Encuentra al sustituto ideal para cubrir bloques de clases de profesores ausentes.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Form controls */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Detalles de la Ausencia
          </h3>
          
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase">Profesor Ausente</label>
              <select
                value={ausenteId}
                onChange={e => setAusenteId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-indigo-500 mt-1"
              >
                {MOCK_TEACHERS.map(t => (
                  <option key={t.id} value={t.id}>{t.nombre} ({t.especialidad})</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase">Día</label>
              <select
                value={dia}
                onChange={e => setDia(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-indigo-500 mt-1"
              >
                {DIAS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase">Bloque Horario</label>
              <select
                value={bloqueId}
                onChange={e => setBloqueId(parseInt(e.target.value))}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-indigo-500 mt-1"
              >
                {BLOQUES.map(b => (
                  <option key={b.id} value={b.id}>{b.label}</option>
                ))}
              </select>
            </div>

            <div className="pt-2">
              <button
                onClick={handleConsultarIA}
                disabled={loadingAi}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer disabled:opacity-50"
              >
                {loadingAi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                Consultar Agente Reemplazo IA
              </button>
            </div>
          </div>
        </div>

        {/* Candidates List */}
        <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4 lg:col-span-2">
          <h3 className="font-bold text-sm flex items-center gap-2 text-foreground">
            <Clock className="w-4 h-4 text-indigo-500" />
            Candidatos Evaluados en Tiempo Real
          </h3>

          <div className="divide-y divide-border">
            {candidatos.map((c, index) => (
              <div key={index} className="py-3 flex items-center justify-between text-xs hover:bg-muted/30 px-2 rounded-lg transition-colors">
                <div className="space-y-1">
                  <div className="font-bold text-foreground">{c.nombre}</div>
                  <div className="text-muted-foreground flex items-center gap-1.5">
                    <BookOpen className="w-3 h-3 text-indigo-500" /> {c.especialidad}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {c.coincidenciaEspecialidad && (
                    <span className="bg-indigo-50 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400 border border-indigo-200 px-2 py-0.5 rounded-full text-[9px] font-bold">
                      Afinidad Pedagógica
                    </span>
                  )}
                  <span className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase",
                    c.libre 
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                      : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
                  )}>
                    {c.libre ? "Disponible" : "Ocupado"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* IA Recommendation Results */}
      {aiReport && (
        <div className="bg-indigo-50/40 dark:bg-indigo-950/15 border border-indigo-200 dark:border-indigo-900 p-6 rounded-2xl space-y-6 animate-fadeIn">
          <div className="flex items-start gap-3">
            <Brain className="w-6 h-6 text-indigo-500" />
            <div>
              <h3 className="font-extrabold text-lg text-foreground">Recomendación del Agente de Reemplazo IA</h3>
              <p className="text-xs text-muted-foreground">Diagnóstico de disponibilidad e idoneidad escolar.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Best candidate */}
            <div className="bg-card border border-border p-5 rounded-xl space-y-3 md:col-span-1">
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Candidato Recomendado</span>
                <h4 className="text-xl font-extrabold text-indigo-600 mt-1">{aiReport.mejorCandidato}</h4>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Este docente presenta la máxima compatibilidad de especialidad para dictar {ausente.especialidad} y tiene el bloque disponible.
              </p>
            </div>

            {/* Qualitative analysis */}
            <div className="bg-card border border-border p-5 rounded-xl space-y-3 md:col-span-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Justificación de la Selección</span>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {aiReport.razonRecomendacion}
              </p>

              {aiReport.candidatosAlternativos?.length > 0 && (
                <div className="space-y-1.5 border-t border-border pt-3">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Opciones Secundarias</span>
                  <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-muted-foreground">
                    {aiReport.candidatosAlternativos.map((alt: string, i: number) => (
                      <li key={i}>{alt}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Message Generator */}
          {aiReport.mensajeInvitacionDocente && (
            <div className="bg-card border border-border p-5 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mensaje de Solicitud Generado</span>
                <button
                  onClick={handleCopy}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-bold px-3 py-1 rounded-lg text-[10px] flex items-center gap-1.5 shadow-sm transition-all"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Clipboard className="w-3.5 h-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <pre className="text-xs text-muted-foreground bg-muted p-4 rounded-lg whitespace-pre-wrap font-sans leading-relaxed border border-border">
                {aiReport.mensajeInvitacionDocente}
              </pre>
            </div>
          )}
        </div>
      )}

      {aiError && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 text-red-800 dark:text-red-300 p-4 rounded-xl text-xs">
          {aiError}
        </div>
      )}
    </div>
  )
}
