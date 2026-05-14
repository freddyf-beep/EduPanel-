"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { ArrowLeft, Download, CheckCircle2, AlertCircle, Loader2, List, Send, Printer, Lock, BookOpen, ChevronDown } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { auth } from "@/lib/firebase"
import { cargarInfoColegio, type InfoColegio } from "@/lib/perfil"
import { apiFetch } from "@/lib/api-client"
import { toast } from "@/hooks/use-toast"
import { abrirRubricaPlantillaImprimible } from "@/lib/export/hoja-evaluacion-pdf"
import { abrirResultadosIndividualesImprimible } from "@/lib/export/resultados-individuales-pdf"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  cargarRubrica, cargarEvaluacion,
  calcularPuntajeEstudiante, calcularNota,
  sincronizarConCalificaciones,
  type RubricaTemplate, type EvaluacionRubrica, type EstudianteEvaluacion,
  type SincronizarCalificacionesResultado,
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
  const [exportandoGrupo, setExportandoGrupo] = useState(false)
  const [exportandoAlumno, setExportandoAlumno] = useState<string | null>(null)
  const [sincronizandoCalif, setSincronizandoCalif] = useState(false)
  const [syncPendiente, setSyncPendiente] = useState<SincronizarCalificacionesResultado | null>(null)
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false)
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
      const res = await apiFetch("/api/export-rubrica", {
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
      const res = await apiFetch("/api/export-rubrica", {
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

  const handleExportarGrupo = async () => {
    if (!rubrica || !evaluacion) return
    setExportandoGrupo(true)
    const profesorNombre = auth?.currentUser?.displayName ?? ""
    const colegio = infoColegio?.nombre ?? ""
    const logoBase64 = infoColegio?.logoBase64
    try {
      const res = await apiFetch("/api/export-rubrica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubrica, evaluacion, modo: "grupo", profesorNombre, colegio, logoBase64 }),
      })
      if (!res.ok) throw new Error("Error al generar el Word")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rubrica_${rubrica.nombre}_${rubrica.curso}_grupos.docx`.replace(/\s+/g, "_")
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar")
    } finally {
      setExportandoGrupo(false)
    }
  }

  const handleExportarAlumno = async (estudianteId: string, nombreAlumno: string) => {
    if (!rubrica || !evaluacion) return
    setExportandoAlumno(estudianteId)
    const profesorNombre = auth?.currentUser?.displayName ?? ""
    const colegio = infoColegio?.nombre ?? ""
    const logoBase64 = infoColegio?.logoBase64
    try {
      const res = await apiFetch("/api/export-rubrica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rubrica, evaluacion, modo: "alumno", estudianteId, profesorNombre, colegio, logoBase64 }),
      })
      if (!res.ok) throw new Error("Error al generar el Word")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `rubrica_${nombreAlumno.replace(/\s+/g, "_")}.docx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al exportar")
    } finally {
      setExportandoAlumno(null)
    }
  }

  const handleResultadosIndividuales = () => {
    if (!rubrica || !evaluacion) return
    abrirResultadosIndividualesImprimible({
      rubrica,
      evaluacion,
      colegio: infoColegio,
      profesorNombre: auth?.currentUser?.displayName ?? "",
    })
  }

  const handleVerPlantilla = () => {
    if (!rubrica) return
    abrirRubricaPlantillaImprimible({
      rubrica,
      colegio: infoColegio,
      profesorNombre: auth?.currentUser?.displayName ?? "",
    })
  }

  const handleSincronizarCalificaciones = async (sobrescribir = false) => {
    if (!rubrica || !evaluacion) return
    setSincronizandoCalif(true)
    try {
      const resultado = await sincronizarConCalificaciones(rubrica, evaluacion, { sobrescribir })
      if (resultado.requiereConfirmacion) {
        setSyncPendiente(resultado)
        setConfirmSyncOpen(true)
        return
      }

      setSyncPendiente(null)
      toast({
        title: "Calificaciones actualizadas",
        description: `${resultado.notasSincronizadas} notas sincronizadas desde la rubrica.`,
      })
    } catch (e) {
      toast({
        title: "No se pudo sincronizar",
        description: e instanceof Error ? e.message : "Intentalo nuevamente.",
        variant: "destructive",
      })
    } finally {
      setSincronizandoCalif(false)
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
  const bloqueada = !!evaluacion?.bloqueada

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
      <AlertDialog open={confirmSyncOpen} onOpenChange={setConfirmSyncOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescribir notas existentes</AlertDialogTitle>
            <AlertDialogDescription>
              Ya hay {syncPendiente?.conflictos.length || 0} notas distintas en calificaciones para esta rubrica.
              Si continuas, EduPanel reemplazara esas notas con los resultados actuales de la rubrica.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {syncPendiente && (
            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-muted/30 p-3 text-[12px]">
              {syncPendiente.conflictos.slice(0, 8).map(conflicto => (
                <div key={conflicto.estudianteId} className="flex items-center justify-between gap-3 py-1">
                  <span className="font-medium text-foreground">{conflicto.nombre}</span>
                  <span className="text-muted-foreground">{conflicto.anterior} {"->"} {conflicto.nueva}</span>
                </div>
              ))}
              {syncPendiente.conflictos.length > 8 && (
                <p className="pt-2 text-muted-foreground">+{syncPendiente.conflictos.length - 8} cambios mas</p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleSincronizarCalificaciones(true)}>
              Sobrescribir y sincronizar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <button
          onClick={() => router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "rubricas" }, asignatura)))}
          className="p-2 rounded-[10px] hover:bg-muted/60 transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0 order-first sm:order-none w-full sm:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[18px] sm:text-[20px] font-extrabold text-foreground">Resultados</h1>
            {bloqueada && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                <Lock className="h-3 w-3" />
                Finalizada
              </span>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground truncate">{rubrica.nombre} · {rubrica.curso}</p>
        </div>
        <button
          onClick={handleResultadosIndividuales}
          disabled={!evaluacion || todosEstudiantes.length === 0}
          title="Abrir resultados individuales compactos para imprimir o guardar como PDF"
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 disabled:opacity-50"
        >
          <Printer className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Resultados individuales</span>
          <span className="sm:hidden">Resultados</span>
        </button>
        <button
          onClick={handleVerPlantilla}
          disabled={!rubrica}
          title="Ver la rúbrica completa con criterios y descriptores (sin alumnos)"
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors disabled:opacity-50"
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Ver rúbrica</span>
          <span className="sm:hidden">Rúbrica</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              disabled={(exportandoGrupo || exportandoListado) || !evaluacion || todosEstudiantes.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border border-border rounded-[10px] hover:bg-muted/60 transition-colors disabled:opacity-50"
            >
              {exportandoGrupo || exportandoListado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Exportaciones</span>
              <span className="sm:hidden">Exportar</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[11px]">Word</DropdownMenuLabel>
            <DropdownMenuItem onClick={handleExportarGrupo} disabled={exportandoGrupo || !evaluacion || todosEstudiantes.length === 0}>
              <Download className="w-3.5 h-3.5" />
              Ver grupos
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleExportarListado} disabled={exportandoListado}>
              <List className="w-3.5 h-3.5" />
              Lista de notas
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button
          onClick={handleExportarWord}
          disabled={exportando || !evaluacion}
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium bg-primary text-primary-foreground rounded-[10px] hover:opacity-90 disabled:opacity-50"
        >
          {exportando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">Word completo</span>
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
              <table className="w-full text-[12px] min-w-[700px]">
                <thead>
                  <tr className="border-b border-border bg-muted/20">
                    <th className="sticky left-0 z-10 bg-muted/20 text-left px-4 py-2.5 font-semibold text-muted-foreground border-r border-border min-w-[160px]">Alumno</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Grupo</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Puntaje</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Nota</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Estado</th>
                    <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Observaciones</th>
                    <th className="text-center px-3 py-2.5 font-semibold text-muted-foreground">Word</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluacion.grupos.flatMap(grupo =>
                    grupo.estudiantes.map(est => {
                      const puntaje = calcularPuntajeEstudiante(est.puntajes, rubrica.partes)
                      const nota = calcularNota(puntaje, rubrica.puntajeMaximo, exigenciaEstudiante(est))
                      const aprobado = nota >= 4.0
                      const descargandoEste = exportandoAlumno === est.estudianteId
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
                          <td className="px-3 py-2.5 text-center">
                            <button
                              onClick={() => handleExportarAlumno(est.estudianteId, est.nombre)}
                              disabled={descargandoEste}
                              title={`Descargar rúbrica individual de ${est.nombre}`}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-[8px] border border-border hover:bg-muted/60 transition-colors disabled:opacity-50"
                            >
                              {descargandoEste ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                            </button>
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

          <div className="bg-card border border-border rounded-[14px] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-foreground">Enviar notas a Calificaciones</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Sincroniza el listado del curso cuando ya revisaste los resultados.
                </p>
              </div>
              <button
                onClick={() => handleSincronizarCalificaciones(false)}
                disabled={!evaluacion || sincronizandoCalif || todosEstudiantes.length === 0}
                title="Enviar las notas calculadas a Calificaciones"
                className="flex items-center justify-center gap-1.5 rounded-[10px] border border-primary px-3 py-2 text-[12px] font-medium text-primary transition-colors hover:bg-pink-light disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sincronizandoCalif ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                Sincronizar calificaciones
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
