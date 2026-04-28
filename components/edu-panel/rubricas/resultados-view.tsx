"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { ArrowLeft, Download, Users, CheckCircle2, AlertCircle, Loader2, List } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { auth } from "@/lib/firebase"
import { cargarInfoColegio, type InfoColegio } from "@/lib/perfil"
import {
  cargarRubrica, cargarEvaluacion,
  calcularPuntajeEstudiante, calcularNota,
  type RubricaTemplate, type EvaluacionRubrica, type EstudianteEvaluacion
} from "@/lib/rubricas"

interface Props {
  rubricaId: string
}

const exigenciaEstudiante = (estudiante: Pick<EstudianteEvaluacion, "hasPie">) =>
  estudiante.hasPie ? 0.5 : 0.6

const normalizeName = (value: string) => value.trim().toLocaleLowerCase("es")

export function ResultadosView({ rubricaId }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()

  const [rubrica, setRubrica] = useState<RubricaTemplate | null>(null)
  const [evaluacion, setEvaluacion] = useState<EvaluacionRubrica | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [exportando, setExportando] = useState(false)
  const [exportandoListado, setExportandoListado] = useState(false)
  const [infoColegio, setInfoColegio] = useState<InfoColegio | null>(null)

  useEffect(() => {
    cargarInfoColegio().then(c => { if (c) setInfoColegio(c) }).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([cargarRubrica(rubricaId), cargarEvaluacion(rubricaId)])
      .then(async ([r, ev]) => {
        if (!r) { setError("Rúbrica no encontrada"); return }
        setRubrica(r)
        if (!ev) {
          setEvaluacion(ev)
          return
        }

        const alumnos = await cargarEstudiantes(r.curso)
        const alumnosPorId = new Map(alumnos.map(alumno => [alumno.id, alumno]))
        const alumnosPorNombre = new Map(alumnos.map(alumno => [normalizeName(alumno.nombre), alumno]))
        setEvaluacion({
          ...ev,
          grupos: ev.grupos.map(grupo => ({
            ...grupo,
            estudiantes: grupo.estudiantes.map(est => {
              const alumnoPerfil = alumnosPorId.get(est.estudianteId) ?? alumnosPorNombre.get(normalizeName(est.nombre))
              return alumnoPerfil
                ? { ...est, nombre: alumnoPerfil.nombre || est.nombre, hasPie: alumnoPerfil.pie ?? false }
                : est
            }),
          })),
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [rubricaId])

  const handleExportarWord = async () => {
    if (!rubrica || !evaluacion) return
    setExportando(true)
    try {
      const res = await fetch("/api/export-rubrica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubrica, evaluacion }),
      })
      if (!res.ok) throw new Error("Error al generar Word")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `resultados_${rubrica.nombre}_${rubrica.curso}.docx`.replace(/\s+/g, "_")
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error")
    } finally {
      setExportando(false)
    }
  }

  const handleExportarListado = async () => {
    if (!rubrica || !evaluacion) return
    setExportandoListado(true)
    const profesorNombre = auth?.currentUser?.displayName ?? ""
    const colegio = infoColegio?.nombre ?? ""
    const logoBase64 = infoColegio?.logoBase64
    try {
      const res = await fetch("/api/export-rubrica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubrica, evaluacion, modo: "listado", profesorNombre, colegio, logoBase64 }),
      })
      if (!res.ok) throw new Error("Error al generar Word")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `lista_notas_${rubrica.nombre}_${rubrica.curso}.docx`.replace(/\s+/g, "_")
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar listado")
    } finally {
      setExportandoListado(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground text-[13px]">
      <Loader2 className="w-4 h-4 animate-spin" /> Cargando resultados...
    </div>
  )

  if (error || !rubrica) return (
    <div className="flex items-center gap-2 text-red-600 text-[13px] p-4">
      <AlertCircle className="w-4 h-4" /> {error || "No se pudo cargar"}
    </div>
  )

  // ── Calcular estadísticas ──────────────────────────────────────────────────
  const todosEstudiantes: EstudianteEvaluacion[] = evaluacion
    ? evaluacion.grupos.flatMap(g => g.estudiantes)
    : []

  const notasConDatos = todosEstudiantes
    .map(e => {
      const puntaje = calcularPuntajeEstudiante(e.puntajes, rubrica.partes)
      const nota = calcularNota(puntaje, rubrica.puntajeMaximo, exigenciaEstudiante(e))
      return { ...e, puntaje, nota }
    })
    .sort((a, b) => b.nota - a.nota)

  const aprobados = notasConDatos.filter(e => e.nota >= 4.0).length
  const reprobados = notasConDatos.length - aprobados
  const promedio = notasConDatos.length > 0
    ? notasConDatos.reduce((s, e) => s + e.nota, 0) / notasConDatos.length
    : 0

  // Histograma de notas
  const bins = [
    { rango: "1.0–1.9", count: 0 },
    { rango: "2.0–2.9", count: 0 },
    { rango: "3.0–3.9", count: 0 },
    { rango: "4.0–4.9", count: 0 },
    { rango: "5.0–5.9", count: 0 },
    { rango: "6.0–7.0", count: 0 },
  ]
  notasConDatos.forEach(({ nota }) => {
    const i = Math.min(Math.floor(nota) - 1, 5)
    if (i >= 0) bins[i].count++
  })

  // Promedio por criterio
  const criterioStats: { nombre: string; promedio: number; parte: string }[] = []
  for (const parte of rubrica.partes) {
    for (const criterio of parte.criterios) {
      const vals = todosEstudiantes.map(e => e.puntajes[criterio.id]).filter(v => v !== undefined)
      const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
      criterioStats.push({ nombre: criterio.nombre || criterio.id, promedio: avg, parte: parte.nombre })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          onClick={() => router.push(buildUrl("/rubricas", withAsignatura({}, asignatura)))}
          className="p-2 rounded-[10px] hover:bg-muted/60 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 order-first sm:order-none w-full sm:w-auto">
          <h1 className="text-[18px] sm:text-[20px] font-extrabold text-foreground">Resultados</h1>
          <p className="text-[12px] text-muted-foreground truncate">{rubrica.nombre} · {rubrica.curso}</p>
        </div>
        <button
          onClick={() => router.push(buildUrl("/rubricas", withAsignatura({ view: "evaluacion", rubricaId }, asignatura)))}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60"
        >
          <Users className="w-3.5 h-3.5" />
          Evaluar
        </button>
        <button
          onClick={handleExportarListado}
          disabled={exportandoListado}
          title="Descargar Word con el listado de notas de todos los alumnos"
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors disabled:opacity-50 ml-auto sm:ml-0"
        >
          {exportandoListado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <List className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Lista notas</span>
          <span className="sm:hidden">Lista</span>
        </button>
        <button
          onClick={handleExportarWord}
          disabled={exportando}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90 disabled:opacity-50"
        >
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Exportar Word</span>
          <span className="sm:hidden">Word</span>
        </button>
      </div>

      {!evaluacion || todosEstudiantes.length === 0 ? (
        <div className="bg-card border border-border rounded-[14px] p-8 text-center text-muted-foreground text-[13px]">
          No hay evaluaciones registradas aún.
        </div>
      ) : (
        <>
          {/* Stats rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Alumnos evaluados", valor: todosEstudiantes.length, color: "text-foreground" },
              { label: "Promedio", valor: promedio.toFixed(1), color: promedio >= 4 ? "text-green-600" : "text-red-500" },
              { label: "Aprobados", valor: aprobados, color: "text-green-600" },
              { label: "Reprobados", valor: reprobados, color: reprobados > 0 ? "text-red-500" : "text-foreground" },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-border rounded-[14px] p-4 text-center">
                <p className={`text-[28px] font-extrabold ${stat.color}`}>{stat.valor}</p>
                <p className="text-[12px] text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Histograma */}
          <div className="bg-card border border-border rounded-[14px] p-5">
            <h2 className="text-[14px] font-bold text-foreground mb-4">Distribución de notas</h2>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={bins} barSize={28}>
                <XAxis dataKey="rango" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [`${value} alumnos`]}
                  labelFormatter={(l) => `Nota ${l}`}
                />
                <ReferenceLine x="4.0–4.9" stroke="var(--primary)" strokeDasharray="3 3" />
                <Bar dataKey="count" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Promedio por criterio */}
          <div className="bg-card border border-border rounded-[14px] p-4 sm:p-5">
            <h2 className="text-[14px] font-bold text-foreground mb-3">Promedio por criterio</h2>
            <div className="space-y-3 sm:space-y-2">
              {criterioStats.map(cs => (
                <div key={cs.nombre} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-muted-foreground truncate">{cs.parte}</p>
                    <p className="text-[13px] font-medium text-foreground truncate">{cs.nombre}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 sm:flex-initial sm:w-32 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(cs.promedio / 4) * 100}%` }}
                      />
                    </div>
                    <span className="text-[12px] font-semibold tabular-nums w-8 text-right flex-shrink-0">
                      {cs.promedio.toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tabla de alumnos */}
          <div className="scroll-hint-x rounded-[14px]">
          <div className="bg-card border border-border rounded-[14px] overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b border-border">
              <h2 className="text-[14px] font-bold text-foreground">Notas por alumno</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px] min-w-[640px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="sticky left-0 z-10 bg-muted/20 text-left px-4 py-2.5 font-semibold text-muted-foreground border-r border-border min-w-[160px]">Alumno</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Grupo</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Puntaje</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Nota</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluacion.grupos.flatMap(grupo =>
                    grupo.estudiantes.map(est => {
                      const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica.partes)
                      const nota = calcularNota(puntaje, rubrica.puntajeMaximo, exigenciaEstudiante(est))
                      const aprobado = nota >= 4.0
                      return (
                        <tr key={est.estudianteId} className="border-b border-border hover:bg-muted/30">
                          <td className="sticky left-0 z-10 bg-card border-r border-border px-4 py-2.5 font-medium text-foreground">
                            {est.nombre}
                            {est.hasPie && (
                              <span className="ml-1.5 text-[9px] bg-blue-100 text-blue-700 rounded px-1 font-medium">PIE</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center text-muted-foreground">{grupo.nombre}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{puntaje}/{rubrica.puntajeMaximo}</td>
                          <td className={`px-3 py-2.5 text-center font-bold tabular-nums ${aprobado ? "text-green-600" : "text-red-500"}`}>
                            {nota.toFixed(1)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {est.completado
                              ? <span className="flex items-center justify-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> Completo</span>
                              : <span className="text-amber-500">Incompleto</span>
                            }
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground max-w-[200px] truncate">
                            {est.observaciones || "—"}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  )
}
