"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, BarChart2, Check, Loader2, Pencil, X, Send, Lock, Unlock, Printer, Eye } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { toast } from "@/hooks/use-toast"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
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
  cargarEvaluacionLista,
  cargarListaCotejo,
  getIndicadoresLista,
  sincronizarListaConCalificaciones,
  calcularNotaLista,
  type ListaCotejoEvaluacion,
  type ListaCotejoTemplate,
} from "@/lib/listas-cotejo"
import type { SincronizarCalificacionesResultado } from "@/lib/rubricas"
import {
  abrirListaCotejoResultadosIndividualesImprimible,
  abrirListaCotejoPlantillaUTP
} from "@/lib/export/lista-cotejo-pdf"

interface Props {
  listaId: string
}

export function ListaCotejoResultadosView({ listaId }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const [lista, setLista] = useState<ListaCotejoTemplate | null>(null)
  const [evaluacion, setEvaluacion] = useState<ListaCotejoEvaluacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const [sincronizandoCalif, setSincronizandoCalif] = useState(false)
  const [confirmSyncOpen, setConfirmSyncOpen] = useState(false)
  const [syncPendiente, setSyncPendiente] = useState<SincronizarCalificacionesResultado | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([cargarListaCotejo(listaId), cargarEvaluacionLista(listaId)])
      .then(([listaBase, evaluacionBase]) => {
        if (cancelled) return
        if (!listaBase) {
          setError("Lista de cotejo no encontrada")
          return
        }
        setLista(listaBase)
        setEvaluacion(evaluacionBase)
      })
      .catch(err => setError(err instanceof Error ? err.message : "Error al cargar resultados"))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [listaId])

  const handleSincronizarCalificaciones = async (sobrescribir = false) => {
    if (!lista || !evaluacion) return
    setSincronizandoCalif(true)
    try {
      const resultado = await sincronizarListaConCalificaciones(lista, evaluacion, { sobrescribir })
      if (resultado.requiereConfirmacion) {
        setSyncPendiente(resultado)
        setConfirmSyncOpen(true)
        return
      }

      setSyncPendiente(null)
      setConfirmSyncOpen(false)
      toast({
        title: "Calificaciones actualizadas",
        description: `${resultado.notasSincronizadas} notas sincronizadas desde la lista de cotejo.`,
      })
    } catch (e) {
      toast({
        title: "No se pudo sincronizar",
        description: e instanceof Error ? e.message : "Inténtalo nuevamente.",
        variant: "destructive",
      })
    } finally {
      setSincronizandoCalif(false)
    }
  }

  const indicadoresStats = useMemo(() => {
    if (!lista || !evaluacion) return []
    const estudiantesList = (evaluacion.grupos || []).flatMap(g => g.estudiantes)
    return getIndicadoresLista(lista).map(indicador => {
      const si = estudiantesList.filter(estudiante => estudiante.respuestas?.[indicador.id] === true).length
      const no = estudiantesList.filter(estudiante => estudiante.respuestas?.[indicador.id] === false).length
      const total = estudiantesList.length
      return {
        indicador,
        si,
        no,
        total,
        porcentaje: total > 0 ? Math.round((si / total) * 100) : 0,
      }
    })
  }, [lista, evaluacion])

  const volver = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", curso: lista?.curso }, asignatura)))
  }

  const irEvaluacion = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", view: "evaluacion", listaId, curso: lista?.curso }, asignatura)))
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Cargando resultados...
      </div>
    )
  }

  if (!lista) {
    return (
      <div className="mx-auto max-w-3xl rounded-[14px] border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error || "No se pudo cargar la lista"}
        </div>
        <button
          type="button"
          onClick={volver}
          className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-bold"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver
        </button>
      </div>
    )
  }

  const totalIndicadores = useMemo(() => {
    return (lista?.secciones || []).reduce((acc, s) => acc + (s?.indicadores?.length || 0), 0)
  }, [lista])

  const estudiantes = (evaluacion?.grupos || []).flatMap(g => g.estudiantes)
  const completados = estudiantes.filter(estudiante => estudiante.completado).length
  const promedioPorcentaje = estudiantes.length > 0
    ? Math.round(estudiantes.reduce((total, estudiante) => total + (estudiante.porcentaje ?? 0), 0) / estudiantes.length)
    : 0

  const bloqueada = !!evaluacion?.bloqueada

  // Detailed stats
  const notasConDatos = estudiantes
    .map(e => {
      const puntaje = e.puntaje ?? 0
      const nota = e.nota ?? calcularNotaLista(puntaje, lista.puntajeMaximo, e.hasPie ? 0.5 : 0.6)
      return { ...e, puntaje, nota }
    })
    .sort((a, b) => b.nota - a.nota)

  const aprobados = notasConDatos.filter(e => e.nota >= 4.0).length
  const reprobados = notasConDatos.length - aprobados
  const promedioNota = notasConDatos.length > 0
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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <AlertDialog open={confirmSyncOpen} onOpenChange={setConfirmSyncOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobrescribir notas existentes</AlertDialogTitle>
            <AlertDialogDescription>
              Ya hay {syncPendiente?.conflictos.length || 0} notas distintas en calificaciones para esta lista de cotejo.
              Si continúas, EduPanel reemplazará esas notas con los resultados actuales de la lista de cotejo.
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
                <p className="pt-2 text-muted-foreground">+{syncPendiente.conflictos.length - 8} cambios más</p>
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={volver}
            className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-border bg-card transition-colors hover:bg-muted/60"
            aria-label="Volver"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-extrabold text-foreground">Resultados</h1>
              {bloqueada && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                  <Lock className="h-3 w-3" />
                  Finalizada
                </span>
              )}
            </div>
            <p className="text-[12px] text-muted-foreground">{lista.nombre || "Lista de cotejo"} · {lista.curso}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (lista && evaluacion) {
                abrirListaCotejoResultadosIndividualesImprimible({
                  lista,
                  evaluacion,
                  profesorNombre: lista.docenteNombre || "Docente Evaluador"
                })
              }
            }}
            disabled={!evaluacion}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            <Printer className="h-3.5 w-3.5" />
            Reportes Alumnos
          </button>
          <button
            type="button"
            onClick={() => {
              if (lista) {
                abrirListaCotejoPlantillaUTP({
                  lista,
                  profesorNombre: lista.docenteNombre || "Docente Evaluador"
                })
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <Eye className="h-3.5 w-3.5" />
            Ficha UTP
          </button>
          <button
            type="button"
            onClick={irEvaluacion}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Pencil className="h-3.5 w-3.5" />
            Evaluar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {totalIndicadores === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[14px] border border-dashed border-amber-300 bg-amber-50/50 p-8 text-center text-amber-800">
          <AlertCircle className="h-8 w-8 text-amber-600 mb-2 animate-bounce" />
          <h3 className="text-[15px] font-bold">Sin resultados disponibles</h3>
          <p className="text-[12px] text-amber-700/80 mt-1 max-w-md">
            Esta lista de cotejo no tiene indicadores configurados, por lo que no se pueden calcular resultados.
          </p>
          <button
            type="button"
            onClick={() => router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", view: "crear", listaId, curso: lista?.curso }, asignatura)))}
            className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-amber-600 px-4 text-[12px] font-bold text-white hover:bg-amber-700 transition-colors shadow-xs"
          >
            Configurar Indicadores
          </button>
        </div>
      )}

      {totalIndicadores > 0 && (
        <>
          {!evaluacion ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[14px] border border-dashed border-border bg-card px-4 text-center">
              <BarChart2 className="h-9 w-9 text-muted-foreground/60" />
              <h2 className="mt-3 text-[15px] font-bold text-foreground">Aún no hay respuestas</h2>
              <p className="mt-1 max-w-md text-[12px] text-muted-foreground">Abre la evaluación para marcar Si/No por estudiante.</p>
              <button
                type="button"
                onClick={irEvaluacion}
                className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground"
              >
                <Pencil className="h-3.5 w-3.5" />
                Evaluar ahora
              </button>
            </div>
          ) : (
            <>
          {/* Stats rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Estudiantes", valor: estudiantes.length, color: "text-foreground" },
              { label: "Promedio", valor: promedioNota.toFixed(1), color: promedioNota >= 4.0 ? "text-green-600" : "text-red-500" },
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

          <section className="rounded-[14px] border border-border bg-card p-5">
            <h2 className="text-[14px] font-extrabold text-foreground">Resumen por indicador</h2>
            <div className="mt-4 space-y-3">
              {indicadoresStats.map(({ indicador, si, no, total, porcentaje }) => (
                <div key={indicador.id} className="rounded-[12px] border border-border bg-background p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <p className="text-[13px] font-semibold text-foreground">{indicador.texto}</p>
                    <span className="shrink-0 rounded-[999px] bg-muted px-2 py-1 text-[11px] font-extrabold text-muted-foreground">
                      {porcentaje}% {lista.escalaDicotomica?.[0] || "Si"}
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${porcentaje}%` }} />
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-green-600" /> {si} {lista.escalaDicotomica?.[0] || "Si"}</span>
                    <span className="inline-flex items-center gap-1"><X className="h-3 w-3 text-red-600" /> {no} {lista.escalaDicotomica?.[1] || "No"}</span>
                    <span>{total - si - no} sin marcar</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-[14px] border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-[14px] font-extrabold text-foreground">Resumen por estudiante</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[12px]">
                <thead className="bg-muted/40 text-[11px] font-extrabold uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Estudiante</th>
                    <th className="px-4 py-3 text-center">Puntaje</th>
                    <th className="px-4 py-3 text-center">%</th>
                    <th className="px-4 py-3 text-center">Nota</th>
                    <th className="px-4 py-3">Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {estudiantes.map(estudiante => {
                    const puntaje = estudiante.puntaje ?? 0
                    const nota = estudiante.nota ?? calcularNotaLista(puntaje, lista.puntajeMaximo, estudiante.hasPie ? 0.5 : 0.6)
                    return (
                      <tr key={estudiante.estudianteId} className="border-t border-border">
                        <td className="px-4 py-3 font-bold text-foreground">{estudiante.nombre}</td>
                        <td className="px-4 py-3 text-center text-muted-foreground">{puntaje}/{lista.puntajeMaximo}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="inline-flex min-w-[52px] justify-center rounded-[999px] bg-muted px-2 py-1 text-[11px] font-extrabold text-foreground">
                            {estudiante.porcentaje ?? 0}%
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-foreground">{nota.toFixed(1)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{estudiante.observaciones || "-"}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Sincronización con Calificaciones */}
          <div className="bg-card border border-border rounded-[14px] p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-[14px] font-bold text-foreground">Enviar notas a Calificaciones</h2>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  Sincroniza el listado del curso cuando ya revisaste los resultados.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleSincronizarCalificaciones(false)}
                disabled={!evaluacion || sincronizandoCalif || estudiantes.length === 0}
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
        </>
      )}
    </div>
  )
}
