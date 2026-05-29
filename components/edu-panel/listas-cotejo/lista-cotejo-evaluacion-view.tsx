"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Loader2, Save, X, Lock, Unlock, Download, Upload } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { toast } from "@/hooks/use-toast"
import { serverTimestamp } from "firebase/firestore"
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
  guardarEvaluacionLista,
  nuevaEvaluacionLista,
  recalcularEstudianteLista,
  sincronizarEstudiantesLista,
  type EstudianteListaCotejo,
  type ListaCotejoEvaluacion,
  type ListaCotejoTemplate,
} from "@/lib/listas-cotejo"

interface Props {
  listaId: string
}

function formatearFechaBloqueo(value: unknown): string {
  if (!value) return "ahora"
  const rawDate =
    value instanceof Date ? value :
    typeof value === "number" ? new Date(value) :
    typeof (value as { toDate?: () => Date })?.toDate === "function" ? (value as { toDate: () => Date }).toDate() :
    null
  if (!rawDate || Number.isNaN(rawDate.getTime())) return "ahora"
  return new Intl.DateTimeFormat("es-CL").format(rawDate)
}

export function ListaCotejoEvaluacionView({ listaId }: Props) {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const [lista, setLista] = useState<ListaCotejoTemplate | null>(null)
  const [evaluacion, setEvaluacion] = useState<ListaCotejoEvaluacion | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState("")
  const [confirmBloqueo, setConfirmBloqueo] = useState<"bloquear" | "desbloquear" | null>(null)
  const ignoreFirstSave = useRef(true)
  const skipNextSave = useRef(false)

  useEffect(() => {
    let cancelled = false

    const cargar = async () => {
      try {
        const listaBase = await cargarListaCotejo(listaId)
        if (!listaBase) {
          setError("Lista de cotejo no encontrada")
          return
        }

        const [evaluacionBase, alumnos] = await Promise.all([
          cargarEvaluacionLista(listaId),
          cargarEstudiantes(listaBase.curso),
        ])
        if (cancelled) return

        const evaluacionInicial = evaluacionBase ?? nuevaEvaluacionLista(listaBase, alumnos)
        setLista(listaBase)
        setEvaluacion(sincronizarEstudiantesLista(evaluacionInicial, alumnos, listaBase))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar evaluacion")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    cargar()
    return () => {
      cancelled = true
    }
  }, [listaId])

  useEffect(() => {
    if (!evaluacion) return
    if (ignoreFirstSave.current) {
      ignoreFirstSave.current = false
      return
    }
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    if (evaluacion.bloqueada) return

    const timeout = setTimeout(async () => {
      try {
        await guardarEvaluacionLista(evaluacion)
        setGuardadoOk(true)
        setTimeout(() => setGuardadoOk(false), 1600)
      } catch (err) {
        console.error(err)
      }
    }, 1800)

    return () => clearTimeout(timeout)
  }, [evaluacion])

  const aplicarBloqueo = async (bloquear: boolean) => {
    if (!evaluacion) return
    const siguiente: ListaCotejoEvaluacion = {
      ...evaluacion,
      bloqueada: bloquear,
      bloqueadaEn: bloquear ? serverTimestamp() : undefined,
    }
    skipNextSave.current = true
    setEvaluacion(siguiente)
    setConfirmBloqueo(null)
    setGuardando(true)
    setError("")
    try {
      await guardarEvaluacionLista(siguiente)
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 1600)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setGuardando(false)
    }
  }

  const downloadBackup = () => {
    if (!evaluacion || !lista) return
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(evaluacion, null, 2))
      const downloadAnchor = document.createElement("a")
      const safeName = (lista.nombre || "lista_cotejo")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "")
      downloadAnchor.setAttribute("href", dataStr)
      downloadAnchor.setAttribute("download", `evaluacion_${safeName}_${lista.curso.replace(/\s+/g, "_")}.json`)
      document.body.appendChild(downloadAnchor)
      downloadAnchor.click()
      downloadAnchor.remove()
      toast({
        title: "Copia descargada",
        description: "Se ha descargado la copia de seguridad local en tu equipo.",
      })
    } catch (err) {
      toast({
        title: "Error al descargar",
        description: err instanceof Error ? err.message : "No se pudo exportar la copia.",
        variant: "destructive",
      })
    }
  }

  const uploadBackup = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !lista) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const text = e.target?.result
        if (typeof text !== "string") throw new Error("Lectura de archivo inválida")
        const parsed = JSON.parse(text) as ListaCotejoEvaluacion
        if (!parsed || typeof parsed !== "object") throw new Error("Formato JSON inválido")
        if (parsed.listaId !== listaId) {
          throw new Error("Esta copia de seguridad corresponde a otra lista de cotejo.")
        }
        if (!Array.isArray(parsed.estudiantes)) {
          throw new Error("El archivo no contiene un registro válido de estudiantes.")
        }

        setEvaluacion(parsed)
        toast({
          title: "Copia de seguridad cargada",
          description: "Los puntajes y observaciones locales se han cargado en la vista.",
        })
      } catch (err) {
        toast({
          title: "Error al cargar copia",
          description: err instanceof Error ? err.message : "Formato inválido.",
          variant: "destructive",
        })
      }
    }
    reader.readAsText(file)
    event.target.value = ""
  }

  const volver = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", curso: lista?.curso }, asignatura)))
  }

  const irResultados = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", view: "resultados", listaId, curso: lista?.curso }, asignatura)))
  }

  const updateEstudiante = (
    estudianteId: string,
    fn: (estudiante: EstudianteListaCotejo) => EstudianteListaCotejo
  ) => {
    if (!lista) return
    setEvaluacion(prev => {
      if (!prev) return prev
      return {
        ...prev,
        estudiantes: prev.estudiantes.map(estudiante =>
          estudiante.estudianteId === estudianteId
            ? recalcularEstudianteLista(fn(estudiante), lista)
            : estudiante
        ),
      }
    })
  }

  const setRespuesta = (estudianteId: string, indicadorId: string, valor: boolean) => {
    updateEstudiante(estudianteId, estudiante => ({
      ...estudiante,
      respuestas: {
        ...estudiante.respuestas,
        [indicadorId]: valor,
      },
    }))
  }

  const guardarManual = async () => {
    if (!evaluacion) return
    setGuardando(true)
    setError("")
    try {
      await guardarEvaluacionLista(evaluacion)
      setGuardadoOk(true)
      setTimeout(() => setGuardadoOk(false), 1600)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setGuardando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Cargando evaluacion...
      </div>
    )
  }

  if (!lista || !evaluacion) {
    return (
      <div className="mx-auto max-w-3xl rounded-[14px] border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          {error || "No se pudo cargar la evaluacion"}
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

  const totalIndicadores = lista.secciones.reduce((total, seccion) => total + seccion.indicadores.length, 0)
  const completados = evaluacion.estudiantes.filter(estudiante => estudiante.completado).length
  const bloqueada = !!evaluacion.bloqueada
  const fechaBloqueo = formatearFechaBloqueo(evaluacion.bloqueadaEn)

  return (
    <div className="mx-auto max-w-none space-y-4">
      <AlertDialog open={confirmBloqueo !== null} onOpenChange={(open) => !open && setConfirmBloqueo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmBloqueo === "bloquear" ? "Finalizar y bloquear evaluacion" : "Desbloquear evaluacion"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmBloqueo === "bloquear"
                ? "Una vez bloqueada, no podras modificar respuestas ni observaciones hasta desbloquearla."
                : "La evaluacion volvera a ser editable. Podras ajustar respuestas y observaciones nuevamente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => aplicarBloqueo(confirmBloqueo === "bloquear")}>
              {confirmBloqueo === "bloquear" ? "Finalizar y bloquear" : "Desbloquear"}
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
            <h1 className="text-[22px] font-extrabold text-foreground">{lista.nombre || "Lista de cotejo"}</h1>
            <p className="text-[12px] text-muted-foreground">
              {lista.curso} · {totalIndicadores} indicadores · {completados}/{evaluacion.estudiantes.length} completos
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {guardadoOk && (
            <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-green-50 px-3 py-2 text-[12px] font-bold text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Guardado
            </span>
          )}
          <button
            type="button"
            onClick={irResultados}
            className="inline-flex h-9 items-center rounded-[10px] border border-border bg-card px-3 text-[12px] font-bold transition-colors hover:bg-muted/60"
          >
            Resultados
          </button>
          <button
            type="button"
            onClick={() => setConfirmBloqueo(bloqueada ? "desbloquear" : "bloquear")}
            disabled={guardando}
            title={bloqueada ? "Desbloquear evaluacion" : "Finalizar y bloquear la evaluacion"}
            className={`flex h-9 items-center gap-1.5 px-3 py-2 text-[12px] font-bold rounded-[10px] transition-colors disabled:opacity-50 ${
              bloqueada
                ? "border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                : "border border-border bg-card text-muted-foreground hover:bg-muted/60"
            }`}
          >
            {bloqueada ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{bloqueada ? "Desbloquear" : "Finalizar"}</span>
            <span className="sm:hidden">{bloqueada ? "Abrir" : "Finalizar"}</span>
          </button>
          <button
            type="button"
            onClick={downloadBackup}
            disabled={!evaluacion}
            title="Descargar copia de seguridad local (JSON)"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Respaldar local</span>
          </button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted/60">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Cargar respaldo</span>
            <input
              type="file"
              accept=".json"
              onChange={uploadBackup}
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={guardarManual}
            disabled={guardando || bloqueada}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Guardar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {bloqueada && (
        <div className="flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-900">
          <Lock className="h-3.5 w-3.5 animate-bounce" />
          Evaluación finalizada el {fechaBloqueo}. Desbloquéala para modificar respuestas u observaciones.
        </div>
      )}

      <div className="overflow-x-auto rounded-[14px] border border-border bg-card">
        <table className="w-full min-w-[980px] border-collapse text-left text-[12px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 z-20 w-[220px] bg-muted/40 px-3 py-3 text-[11px] font-extrabold uppercase text-muted-foreground">
                Estudiante
              </th>
              {lista.secciones.map(seccion => (
                <th
                  key={seccion.id}
                  colSpan={seccion.indicadores.length}
                  className="border-l border-border px-3 py-3 text-center text-[11px] font-extrabold uppercase text-muted-foreground"
                >
                  {seccion.nombre}
                </th>
              ))}
              <th className="w-[90px] border-l border-border px-3 py-3 text-center text-[11px] font-extrabold uppercase text-muted-foreground">
                %
              </th>
              <th className="w-[210px] border-l border-border px-3 py-3 text-[11px] font-extrabold uppercase text-muted-foreground">
                Observaciones
              </th>
            </tr>
            <tr className="border-b border-border bg-card">
              <th className="sticky left-0 z-20 bg-card px-3 py-2" />
              {lista.secciones.flatMap(seccion =>
                seccion.indicadores.map(indicador => (
                  <th key={indicador.id} className="w-[132px] border-l border-border px-2 py-2 align-top">
                    <div className="line-clamp-4 min-h-[58px] text-[11px] font-semibold text-foreground">
                       {indicador.texto}
                    </div>
                  </th>
                ))
              )}
              <th className="border-l border-border px-2 py-2" />
              <th className="border-l border-border px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {evaluacion.estudiantes.map(estudiante => (
              <tr key={estudiante.estudianteId} className="border-b border-border last:border-b-0">
                <td className="sticky left-0 z-10 bg-card px-3 py-3 align-top">
                  <div className="font-bold text-foreground">{estudiante.nombre}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    {estudiante.puntaje ?? 0}/{lista.puntajeMaximo} pts
                    {estudiante.hasPie ? " · PIE" : ""}
                  </div>
                </td>
                {lista.secciones.flatMap(seccion =>
                  seccion.indicadores.map(indicador => {
                    const valor = estudiante.respuestas[indicador.id]
                    return (
                      <td key={indicador.id} className="border-l border-border px-2 py-3 align-top">
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            disabled={bloqueada}
                            onClick={() => setRespuesta(estudiante.estudianteId, indicador.id, true)}
                            className={`flex h-8 items-center justify-center gap-1 rounded-[8px] border text-[11px] font-bold transition-colors ${
                              valor === true
                                ? "border-green-500 bg-green-500 text-white"
                                : "border-border bg-background text-muted-foreground hover:bg-green-50 hover:text-green-700"
                            } ${bloqueada ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Si
                          </button>
                          <button
                            type="button"
                            disabled={bloqueada}
                            onClick={() => setRespuesta(estudiante.estudianteId, indicador.id, false)}
                            className={`flex h-8 items-center justify-center gap-1 rounded-[8px] border text-[11px] font-bold transition-colors ${
                              valor === false
                                ? "border-red-500 bg-red-500 text-white"
                                : "border-border bg-background text-muted-foreground hover:bg-red-50 hover:text-red-700"
                            } ${bloqueada ? "opacity-60 cursor-not-allowed" : ""}`}
                          >
                            <X className="h-3.5 w-3.5" />
                            No
                          </button>
                        </div>
                      </td>
                    )
                  })
                )}
                <td className="border-l border-border px-3 py-3 text-center align-top">
                  <span className={`inline-flex min-w-[52px] justify-center rounded-[999px] px-2 py-1 text-[11px] font-extrabold ${
                    estudiante.completado ? "bg-green-50 text-green-700" : "bg-muted text-muted-foreground"
                  }`}>
                    {estudiante.porcentaje ?? 0}%
                  </span>
                </td>
                <td className="border-l border-border px-2 py-3 align-top">
                  <textarea
                    value={estudiante.observaciones}
                    disabled={bloqueada}
                    onChange={event => updateEstudiante(estudiante.estudianteId, actual => ({ ...actual, observaciones: event.target.value }))}
                    rows={2}
                    className="min-h-[56px] w-full resize-y rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed"
                    placeholder="Obs."
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
