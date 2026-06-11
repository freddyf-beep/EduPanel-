"use client"

import { useEffect, useRef, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Loader2,
  Save,
  X,
  Lock,
  Unlock,
  Download,
  Upload,
  Printer,
  Search,
  Users,
  LayoutGrid,
  User,
  CheckSquare,
  Plus,
  Sparkles,
  FileText
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarEstudiantes } from "@/lib/estudiantes"
import { toast } from "@/hooks/use-toast"
import { apiFetch } from "@/lib/api-client"
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog"
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
import { abrirListaCotejoHojaEvaluacionImprimible } from "@/lib/export/lista-cotejo-pdf"

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

  // Nuevos estados para la visualización por Sección e Individual (Estilo Rúbrica)
  const [vistaModo, setVistaModo] = useState<"seccion" | "individual">("seccion")
  const [seccionActivaIdx, setSeccionActivaIdx] = useState(0) // -1 es "Todas"
  const [alumnoActivoId, setAlumnoActivoId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "pendientes" | "completados">("todos")
  const [grupoActivoIdx, setGrupoActivoIdx] = useState(0)

  // Estados para distribución de grupos
  const [showDistribucionModal, setShowDistribucionModal] = useState(false)
  const [distribucionTipo, setDistribucionTipo] = useState<"porGrupo" | "totalGrupos">("porGrupo")
  const [distribucionValor, setDistribucionValor] = useState(2)
  const [reglaEvitarPieJuntos, setReglaEvitarPieJuntos] = useState(true)

  const [mostrarAsistenteIA, setMostrarAsistenteIA] = useState(false)
  const [analizandoIA, setAnalizandoIA] = useState(false)
  const [progresoIA, setProgresoIA] = useState("")
  const [errorIA, setErrorIA] = useState("")
  const [fileBase64, setFileBase64] = useState<string | null>(null)
  const [fileMime, setFileMime] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [resultadoIA, setResultadoIA] = useState<{
    transcripcion?: string
    respuestas?: Record<string, { valor: boolean; justificacion?: string }>
    observaciones?: string
  } | null>(null)

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
        const evSincronizada = sincronizarEstudiantesLista(evaluacionInicial, alumnos, listaBase)
        setEvaluacion(evSincronizada)
        const primerAlumno = evSincronizada.grupos[0]?.estudiantes[0]?.estudianteId ?? null
        setAlumnoActivoId(primerAlumno)
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
        
        let parsedEv = parsed
        if (!parsedEv.grupos && (parsedEv as any).estudiantes) {
          parsedEv.grupos = [
            {
              id: "grupo_1",
              nombre: "Grupo 1",
              estudiantes: (parsedEv as any).estudiantes || []
            }
          ]
        }

        if (!Array.isArray(parsedEv.grupos)) {
          throw new Error("El archivo no contiene un registro válido de estudiantes o grupos.")
        }

        setEvaluacion(parsedEv)
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

  const updateEvaluacion = (fn: (ev: ListaCotejoEvaluacion) => ListaCotejoEvaluacion) => {
    setEvaluacion(prev => {
      if (!prev || prev.bloqueada) return prev
      return fn(prev)
    })
  }

  const findGrupoIndexByNombre = (nombre: string) => {
    if (!evaluacion) return -1
    const nombreNormalizado = nombre.trim().toLowerCase()
    return evaluacion.grupos.findIndex(
      g => g.nombre.trim().toLowerCase() === nombreNormalizado
    )
  }

  const moverAlumno = (estudianteId: string, desdeGrupo: number, hastaGrupo: number) => {
    if (desdeGrupo === hastaGrupo || !evaluacion) return
    const est = evaluacion.grupos[desdeGrupo]?.estudiantes.find(e => e.estudianteId === estudianteId)
    if (!est) return
    updateEvaluacion(ev => ({
      ...ev,
      grupos: ev.grupos.map((g, gi) => {
        if (gi === desdeGrupo) return { ...g, estudiantes: g.estudiantes.filter(e => e.estudianteId !== estudianteId) }
        if (gi === hastaGrupo) return { ...g, estudiantes: [...g.estudiantes, est] }
        return g
      }),
    }))
  }

  const agregarGrupo = () => {
    updateEvaluacion(ev => {
      const nextNum = ev.grupos.length + 1
      const nuevoGrupo = {
        id: `grupo_${nextNum}_${Date.now()}`,
        nombre: `Grupo ${nextNum}`,
        estudiantes: [],
      }
      return { ...ev, grupos: [...ev.grupos, nuevoGrupo] }
    })
  }

  const asegurarGrupoAusentes = () => {
    const grupoExistenteIdx = findGrupoIndexByNombre("Ausentes")
    if (grupoExistenteIdx >= 0) {
      setGrupoActivoIdx(grupoExistenteIdx)
      setAlumnoActivoId(evaluacion?.grupos[grupoExistenteIdx]?.estudiantes[0]?.estudianteId ?? null)
      return
    }

    updateEvaluacion(ev => {
      const nuevoGrupo = {
        id: `grupo_ausentes_${Date.now()}`,
        nombre: "Ausentes",
        estudiantes: [],
      }
      const grupos = [...ev.grupos, nuevoGrupo]
      setGrupoActivoIdx(grupos.length - 1)
      setAlumnoActivoId(null)
      return { ...ev, grupos }
    })
  }

  const eliminarGrupo = (grupoIdx: number) => {
    if (!evaluacion) return
    const grupo = evaluacion.grupos[grupoIdx]
    if (!grupo) return
    updateEvaluacion(ev => {
      const estudiantesMover = ev.grupos[grupoIdx]?.estudiantes ?? []
      const gruposNuevos = ev.grupos
        .filter((_, i) => i !== grupoIdx)
        .map((g, i) => (i === 0 ? { ...g, estudiantes: [...g.estudiantes, ...estudiantesMover] } : g))
      return { ...ev, grupos: gruposNuevos }
    })
    setGrupoActivoIdx(prev => Math.min(prev, evaluacion.grupos.length - 2))
    setAlumnoActivoId(null)
  }

  const updateEstudiante = (
    estudianteId: string,
    fn: (estudiante: EstudianteListaCotejo) => EstudianteListaCotejo
  ) => {
    if (!lista) return
    updateEvaluacion(prev => {
      return {
        ...prev,
        grupos: prev.grupos.map(grupo => ({
          ...grupo,
          estudiantes: grupo.estudiantes.map(est =>
            est.estudianteId === estudianteId
              ? recalcularEstudianteLista(fn(est), lista)
              : est
          ),
        })),
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

  const handleFileChangeIA = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setErrorIA("")
    setFileName(file.name)
    setFileMime(file.type)

    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const base64String = result.split(",")[1]
      setFileBase64(base64String)
      setPreviewUrl(file.type.startsWith("image/") ? result : null)
    }
    reader.readAsDataURL(file)
  }

  const handleAnalizarConIA = async () => {
    if (!fileBase64 || !fileMime || !lista || !alumnoActivoObj) return
    setAnalizandoIA(true)
    setProgresoIA("Procesando documento...")
    setErrorIA("")
    try {
      setProgresoIA("Transcribiendo y contrastando indicadores...")
      const response = await apiFetch("/api/corregir-con-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: fileBase64,
          mimeType: fileMime,
          lista,
          studentName: alumnoActivoObj.nombre,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Error del servidor (${response.status})`)
      }

      const data = await response.json()
      setResultadoIA(data)
      setProgresoIA("")
    } catch (err) {
      setErrorIA(err instanceof Error ? err.message : "Error al analizar el trabajo.")
    } finally {
      setAnalizandoIA(false)
    }
  }

  const aplicarEvaluacionIA = () => {
    if (!resultadoIA || !alumnoActivoObj) return
    const respuestasIA = resultadoIA.respuestas || {}
    updateEstudiante(alumnoActivoObj.estudianteId, estudiante => {
      const respuestas = { ...estudiante.respuestas }
      Object.entries(respuestasIA).forEach(([indicadorId, data]) => {
        if (typeof data?.valor === "boolean") {
          respuestas[indicadorId] = data.valor
        }
      })
      return {
        ...estudiante,
        respuestas,
        observaciones: resultadoIA.observaciones
          ? `${estudiante.observaciones ? `${estudiante.observaciones}\n` : ""}${resultadoIA.observaciones}`
          : estudiante.observaciones,
      }
    })

    setMostrarAsistenteIA(false)
    setResultadoIA(null)
    setFileBase64(null)
    setFileMime(null)
    setFileName(null)
    setPreviewUrl(null)
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

  const ejecutarDistribucion = (
    tipo: "porGrupo" | "totalGrupos",
    valor: number,
    evitarPieJuntos: boolean
  ) => {
    if (!evaluacion) return

    // 1. Encontrar grupo Ausentes si existe, para excluir a sus alumnos de la distribución
    const idxAusentes = evaluacion.grupos.findIndex(
      g => g.nombre.trim().toLowerCase() === "ausentes"
    )
    const grupoAusentesObj = idxAusentes >= 0 ? evaluacion.grupos[idxAusentes] : null

    // Alumnos a distribuir son todos los alumnos de los demás grupos
    const gruposNoAusentes = evaluacion.grupos.filter(
      (_, idx) => idx !== idxAusentes
    )
    const todosAlumnosADistribuir = gruposNoAusentes.flatMap(g => g.estudiantes)

    if (todosAlumnosADistribuir.length === 0) {
      toast({
        title: "Sin estudiantes",
        description: "No hay estudiantes disponibles para distribuir.",
        variant: "destructive",
      })
      return
    }

    // 2. Separar alumnos en PIE y regulares
    const alumnosPie = todosAlumnosADistribuir.filter(a => a.hasPie)
    const alumnosRegulares = todosAlumnosADistribuir.filter(a => !a.hasPie)

    // Mezclar aleatoriamente ambos grupos para que la distribución sea dinámica
    const shuffle = <T,>(array: T[]): T[] => {
      const copy = [...array]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    }

    const pieShuffled = shuffle(alumnosPie)
    const regularShuffled = shuffle(alumnosRegulares)

    // 3. Determinar cantidad de grupos N
    let numGrupos = 1
    if (tipo === "porGrupo") {
      numGrupos = Math.max(1, Math.ceil(todosAlumnosADistribuir.length / valor))
    } else {
      numGrupos = Math.max(1, valor)
    }

    // 4. Crear los N grupos
    interface GrupoTemporal {
      nombre: string
      estudiantes: typeof todosAlumnosADistribuir
    }
    const nuevosGruposTemp: GrupoTemporal[] = Array.from({ length: numGrupos }, (_, i) => ({
      nombre: `Grupo ${i + 1}`,
      estudiantes: [],
    }))

    // 5. Asignar alumnos
    if (evitarPieJuntos) {
      // Regla: Evitar juntar 2 estudiantes PIE en el mismo grupo
      // Primero colocamos los alumnos PIE de forma balanceada (uno a uno en cada grupo)
      pieShuffled.forEach((estudiante, idx) => {
        const grupoIdx = idx % numGrupos
        nuevosGruposTemp[grupoIdx].estudiantes.push(estudiante)
      })

      // Luego colocamos los alumnos regulares en los grupos para balancear el tamaño
      regularShuffled.forEach((estudiante, idx) => {
        // Encontramos el grupo actual con menor cantidad de estudiantes
        let minGrupoIdx = 0
        let minSize = Infinity
        for (let i = 0; i < numGrupos; i++) {
          if (nuevosGruposTemp[i].estudiantes.length < minSize) {
            minSize = nuevosGruposTemp[i].estudiantes.length
            minGrupoIdx = i
          }
        }
        nuevosGruposTemp[minGrupoIdx].estudiantes.push(estudiante)
      })
    } else {
      // Sin regla: mezclar todos y distribuir equitativamente
      const todosMezclados = shuffle(todosAlumnosADistribuir)
      todosMezclados.forEach((estudiante, idx) => {
        const grupoIdx = idx % numGrupos
        nuevosGruposTemp[grupoIdx].estudiantes.push(estudiante)
      })
    }

    // 6. Mapear a GrupoListaCotejo estructurados
    const nuevosGrupos = nuevosGruposTemp.map((g, idx) => ({
      id: `grupo_${idx + 1}_${Date.now()}_${idx}`,
      nombre: g.nombre,
      estudiantes: g.estudiantes,
    }))

    // 7. Si existía el grupo de Ausentes, añadirlo al final
    if (grupoAusentesObj) {
      nuevosGrupos.push(grupoAusentesObj)
    }

    // Actualizar la evaluación
    updateEvaluacion(ev => ({
      ...ev,
      grupos: nuevosGrupos,
    }))

    // Resetear a primer grupo y cerrar modal
    setGrupoActivoIdx(0)
    setAlumnoActivoId(nuevosGrupos[0]?.estudiantes[0]?.estudianteId ?? null)
    setShowDistribucionModal(false)

    toast({
      title: "Distribución completa",
      description: `Se han creado ${numGrupos} grupos de forma automática.`,
    })
  }

  const idxGrupoSeguro = useMemo(() => {
    if (!evaluacion) return 0
    return Math.min(grupoActivoIdx, Math.max(0, evaluacion.grupos.length - 1))
  }, [grupoActivoIdx, evaluacion])

  const grupoActualObj = useMemo(() => {
    if (!evaluacion) return null
    return evaluacion.grupos[idxGrupoSeguro] || null
  }, [evaluacion, idxGrupoSeguro])

  const estudiantesDelGrupo = useMemo(() => {
    if (!grupoActualObj) return []
    return grupoActualObj.estudiantes.filter(est => {
      const matchesSearch = est.nombre.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesEstado = filtroEstado === "todos"
        ? true
        : filtroEstado === "completados"
          ? est.completado
          : !est.completado
      return matchesSearch && matchesEstado
    })
  }, [grupoActualObj, searchQuery, filtroEstado])

  const alumnoActivoObj = useMemo(() => {
    if (!evaluacion || estudiantesDelGrupo.length === 0) return null
    return estudiantesDelGrupo.find(e => e.estudianteId === alumnoActivoId) || estudiantesDelGrupo[0]
  }, [estudiantesDelGrupo, alumnoActivoId, evaluacion])

  // Sincronizar el alumno activo si cambia el grupo
  useEffect(() => {
    if (alumnoActivoObj && alumnoActivoId !== alumnoActivoObj.estudianteId) {
      setAlumnoActivoId(alumnoActivoObj.estudianteId)
    }
  }, [alumnoActivoObj, alumnoActivoId])

  const todosLosAlumnos = useMemo(() => {
    if (!evaluacion) return []
    return evaluacion.grupos.flatMap(g => g.estudiantes)
  }, [evaluacion])

  const completados = useMemo(() => {
    return todosLosAlumnos.filter(estudiante => estudiante.completado).length
  }, [todosLosAlumnos])

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

  const totalIndicadores = (lista.secciones || []).reduce((total, seccion) => total + (seccion?.indicadores?.length || 0), 0)

  const bloqueada = !!evaluacion.bloqueada
  const fechaBloqueo = formatearFechaBloqueo(evaluacion.bloqueadaEn)

  // Filtrado de secciones para mostrar en la grilla
  const seccionesAMostrar = seccionActivaIdx === -1 
    ? (lista.secciones || []) 
    : (lista.secciones[seccionActivaIdx] ? [lista.secciones[seccionActivaIdx]] : [])

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
              {lista.curso} · {totalIndicadores} indicadores · {completados}/{todosLosAlumnos.length} completos
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
            onClick={() => {
              abrirListaCotejoHojaEvaluacionImprimible({
                lista,
                evaluacion,
                profesorNombre: lista.docenteNombre || "Docente Evaluador"
              })
            }}
            title="Imprimir hoja de evaluación para marcar en sala"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 text-[12px] font-bold text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <Printer className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Imprimir Hoja</span>
          </button>
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

      {lista.instruccionesMetodologicas && (
        <div className="rounded-[12px] border border-border bg-card p-3.5 text-[12.5px] text-muted-foreground">
          <b>Instrucciones Metodológicas:</b> {lista.instruccionesMetodologicas}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {totalIndicadores === 0 && (
        <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-amber-300 bg-amber-50/50 p-8 text-center text-amber-800">
          <AlertCircle className="h-8 w-8 text-amber-600 mb-2 animate-bounce" />
          <h3 className="text-[15px] font-bold">Esta lista de cotejo no tiene indicadores</h3>
          <p className="text-[12px] text-amber-700/80 mt-1 max-w-md">
            Para evaluar a tus estudiantes, primero debes configurar al menos un indicador en la lista.
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
          {bloqueada && (
            <div className="flex items-center gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] font-bold text-amber-900">
              <Lock className="h-3.5 w-3.5 animate-bounce" />
              Evaluación finalizada el {fechaBloqueo}. Desbloquéala para modificar respuestas u observaciones.
            </div>
          )}

          {/* Selector de Sección y Toggle Vista */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b border-border pb-3">
        <div className="flex flex-wrap gap-1">
          {lista.secciones.map((sec, idx) => {
            const esActivo = seccionActivaIdx === idx && vistaModo === "seccion"
            return (
              <button
                key={sec.id}
                type="button"
                onClick={() => {
                  setSeccionActivaIdx(idx)
                  setVistaModo("seccion")
                }}
                className={`px-3.5 py-1.5 rounded-[10px] text-[12px] font-bold transition-all border ${
                  esActivo
                    ? "bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-500/20"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                {sec.nombre.split(".")[0] || `S${idx + 1}`}. {sec.nombre.split(".").slice(1).join(".").trim() || sec.nombre}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => {
              setVistaModo("seccion")
              setSeccionActivaIdx(-1)
            }}
            className={`px-3.5 py-1.5 rounded-[10px] text-[12px] font-bold transition-all border ${
              seccionActivaIdx === -1 && vistaModo === "seccion"
                ? "bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-500/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            }`}
          >
            Ver Todas
          </button>
        </div>

        <div className="flex items-center gap-1.5 bg-muted/65 p-1 rounded-lg border border-border/80 self-end md:self-center">
          <button
            type="button"
            onClick={() => setVistaModo("seccion")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-extrabold transition-all cursor-pointer ${
              vistaModo === "seccion"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            Vista Tabla
          </button>
          <button
            type="button"
            onClick={() => {
              setVistaModo("individual")
              if (estudiantesDelGrupo.length > 0 && !alumnoActivoId) {
                setAlumnoActivoId(estudiantesDelGrupo[0].estudianteId)
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11.5px] font-extrabold transition-all cursor-pointer ${
              vistaModo === "individual"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Ficha Individual
          </button>
        </div>
      </div>

      {/* Selector de Grupos (Estilo Rúbrica) */}
      <div className="flex flex-wrap gap-2 items-center border-b border-border pb-3 overflow-x-auto">
        {evaluacion.grupos.map((grupo, gi) => {
          const completadosGrupo = grupo.estudiantes.filter(e => e.completado).length
          const esActivo = idxGrupoSeguro === gi
          return (
            <div key={grupo.id} className="relative flex-shrink-0 group/tab">
              <button
                type="button"
                onClick={() => {
                  setGrupoActivoIdx(gi)
                  setAlumnoActivoId(grupo.estudiantes[0]?.estudianteId ?? null)
                }}
                className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold rounded-[10px] whitespace-nowrap transition-colors pr-7 cursor-pointer ${
                  esActivo
                    ? "bg-violet-600 border-violet-600 text-white shadow-sm shadow-violet-500/20"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                {grupo.nombre}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-extrabold ${
                  esActivo ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                }`}>
                  {completadosGrupo}/{grupo.estudiantes.length}
                </span>
              </button>
              {/* Botón eliminar grupo (visible al hacer hover, solo si hay >1 grupos) */}
              {evaluacion.grupos.length > 1 && (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); eliminarGrupo(gi) }}
                  disabled={bloqueada}
                  title={grupo.estudiantes.length > 0 ? `Eliminar "${grupo.nombre}" y mover sus alumnos al Grupo 1` : `Eliminar "${grupo.nombre}"`}
                  className={`absolute right-1 top-1/2 -translate-y-1/2 flex h-4 w-4 items-center justify-center rounded-full opacity-0 group-hover/tab:opacity-100 transition-opacity disabled:cursor-not-allowed disabled:opacity-30 cursor-pointer ${
                    esActivo ? "bg-white/20 hover:bg-white/40 text-white" : "bg-muted hover:bg-red-100 hover:text-red-500 text-muted-foreground"
                  }`}
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          )
        })}
        {/* Botón agregar grupo */}
        <button
          type="button"
          onClick={asegurarGrupoAusentes}
          disabled={bloqueada}
          title="Crear o abrir el grupo de ausentes"
          className="flex items-center gap-1 px-2.5 py-2 text-[12px] font-bold rounded-[10px] border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 whitespace-nowrap transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
          Ausentes
        </button>
        <button
          type="button"
          onClick={agregarGrupo}
          disabled={bloqueada}
          title="Agregar nuevo grupo"
          className="flex items-center gap-1 px-2.5 py-2 text-[12px] font-bold rounded-[10px] border border-dashed border-border hover:border-primary/50 hover:text-primary text-muted-foreground bg-card whitespace-nowrap transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Grupo
        </button>
        <button
          type="button"
          onClick={() => setShowDistribucionModal(true)}
          disabled={bloqueada}
          title="Distribución automática de estudiantes en grupos"
          className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-bold rounded-[10px] border border-violet-300 bg-violet-50 text-violet-800 hover:bg-violet-100 whitespace-nowrap transition-colors flex-shrink-0 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer shadow-xs"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-600 animate-pulse" />
          Distribución Rápida
        </button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-xl border border-border bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Búsqueda */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => {
                setSearchQuery(e.target.value)
              }}
              placeholder="Buscar estudiante..."
              className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-[12.5px] outline-none focus:border-primary"
            />
          </div>

          {/* Filtro Estado */}
          <select
            value={filtroEstado}
            onChange={e => {
              setFiltroEstado(e.target.value as any)
            }}
            className="h-9 rounded-lg border border-border bg-background px-3 text-[12px] font-semibold outline-none"
          >
            <option value="todos">Todos los alumnos</option>
            <option value="pendientes">Pendientes</option>
            <option value="completados">Completados</option>
          </select>
        </div>
      </div>

      {/* Renderizado de Modos de Vista */}
      {vistaModo === "seccion" ? (
        <div className="overflow-x-auto rounded-[14px] border border-border bg-card shadow-sm">
          <table className="w-full min-w-[800px] border-collapse text-left text-[12px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="sticky left-0 z-20 w-[240px] bg-muted/40 px-4 py-3.5 text-[11px] font-extrabold uppercase text-muted-foreground">
                  Estudiante
                </th>
                {seccionesAMostrar.map(seccion => (
                  <th
                    key={seccion.id}
                    colSpan={seccion.indicadores.length}
                    className="border-l border-border px-3 py-3 text-center text-[11px] font-extrabold uppercase text-muted-foreground bg-muted/10"
                  >
                    {seccion.nombre}
                  </th>
                ))}
                <th className="w-[85px] border-l border-border px-3 py-3 text-center text-[11px] font-extrabold uppercase text-muted-foreground">
                  %
                </th>
                <th className="w-[85px] border-l border-border px-3 py-3 text-center text-[11px] font-extrabold uppercase text-muted-foreground">
                  Nota
                </th>
                <th className="w-[280px] border-l border-border px-3 py-3 text-[11px] font-extrabold uppercase text-muted-foreground">
                  Observaciones
                </th>
              </tr>
              <tr className="border-b border-border bg-card">
                <th className="sticky left-0 z-20 bg-card px-4 py-2" />
                {seccionesAMostrar.flatMap(seccion =>
                  seccion.indicadores.map(indicador => (
                    <th key={indicador.id} className="min-w-[200px] border-l border-border px-3 py-2.5 align-top">
                      <div className="text-[11px] font-bold text-foreground leading-snug">
                        {indicador.texto}
                      </div>
                      {indicador.focoDiferenciadoActivo && (
                        <div className="mt-1.5 text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-bold border border-purple-200 leading-normal" title={indicador.focoDiferenciadoTexto}>
                          Alt: {indicador.focoDiferenciadoTexto}
                        </div>
                      )}
                      {indicador.esTransversal && (
                        <div className="mt-1.5 text-[9px] bg-green-50 text-green-700 px-1.5 py-0.5 rounded font-bold border border-green-200 leading-normal w-max">
                          🌱 OAT
                        </div>
                      )}
                    </th>
                  ))
                )}
                <th className="border-l border-border px-2 py-2 bg-muted/5" />
                <th className="border-l border-border px-2 py-2 bg-muted/5" />
                <th className="border-l border-border px-2 py-2 bg-muted/5" />
              </tr>
            </thead>
            <tbody>
              {estudiantesDelGrupo.length === 0 ? (
                <tr>
                  <td colSpan={5 + seccionesAMostrar.reduce((acc, s) => acc + s.indicadores.length, 0)} className="text-center py-8 text-muted-foreground">
                    No se encontraron estudiantes para los filtros aplicados.
                  </td>
                </tr>
              ) : (
                estudiantesDelGrupo.map(estudiante => (
                  <tr key={estudiante.estudianteId} className="border-b border-border last:border-b-0 hover:bg-muted/5 transition-colors">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 align-top border-r border-border/40">
                      <div className="font-extrabold text-foreground text-[12.5px]">{estudiante.nombre}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-foreground bg-muted px-1.5 py-0.5 rounded">{estudiante.puntaje ?? 0}/{lista.puntajeMaximo} pts</span>
                        {estudiante.hasPie && <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded text-[9.5px]">PIE</span>}
                      </div>
                      {evaluacion.grupos.length > 1 && (
                        <div className="mt-2 text-[10px] text-muted-foreground flex items-center gap-1">
                          <span>Mover:</span>
                          <select
                            value={grupoActivoIdx}
                            disabled={bloqueada}
                            onChange={(e) => {
                              const targetIdx = Number(e.target.value)
                              moverAlumno(estudiante.estudianteId, grupoActivoIdx, targetIdx)
                            }}
                            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background outline-none font-bold text-foreground"
                          >
                            {evaluacion.grupos.map((g, gi) => (
                              <option key={g.id} value={gi}>
                                {g.nombre}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </td>
                    {seccionesAMostrar.flatMap(seccion =>
                      seccion.indicadores.map(indicador => {
                        const valor = estudiante.respuestas[indicador.id]
                        return (
                          <td key={indicador.id} className="border-l border-border px-3 py-3 align-middle bg-card">
                            <div className="grid grid-cols-2 gap-1.5">
                              <button
                                type="button"
                                disabled={bloqueada}
                                onClick={() => setRespuesta(estudiante.estudianteId, indicador.id, true)}
                                className={`flex h-8.5 items-center justify-center gap-1 rounded-lg border text-[11.5px] font-extrabold transition-colors cursor-pointer ${
                                  valor === true
                                    ? "border-green-600 bg-green-600 text-white shadow-sm"
                                    : "border-border bg-background text-muted-foreground hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                                } ${bloqueada ? "opacity-60 cursor-not-allowed" : ""}`}
                              >
                                <Check className="h-3.5 w-3.5" />
                                {lista.escalaDicotomica?.[0] || "Si"}
                              </button>
                              <button
                                type="button"
                                disabled={bloqueada}
                                onClick={() => setRespuesta(estudiante.estudianteId, indicador.id, false)}
                                className={`flex h-8.5 items-center justify-center gap-1 rounded-lg border text-[11.5px] font-extrabold transition-colors cursor-pointer ${
                                  valor === false
                                    ? "border-red-600 bg-red-600 text-white shadow-sm"
                                    : "border-border bg-background text-muted-foreground hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                                } ${bloqueada ? "opacity-60 cursor-not-allowed" : ""}`}
                              >
                                <X className="h-3.5 w-3.5" />
                                {lista.escalaDicotomica?.[1] || "No"}
                              </button>
                            </div>
                          </td>
                        )
                      })
                    )}
                    <td className="border-l border-border px-3 py-3 text-center align-top bg-muted/5">
                      <span className={`inline-flex min-w-[50px] justify-center rounded-full px-2 py-0.5 text-[11px] font-extrabold ${
                        estudiante.completado ? "bg-green-50 text-green-700 border border-green-200" : "bg-muted text-muted-foreground"
                      }`}>
                        {estudiante.porcentaje ?? 0}%
                      </span>
                    </td>
                    <td className="border-l border-border px-3 py-3 text-center align-top bg-muted/5">
                      <span className={`text-[13px] font-extrabold ${
                        estudiante.nota && estudiante.nota >= 4.0 ? "text-green-600" : "text-red-500"
                      }`}>
                        {estudiante.nota ? estudiante.nota.toFixed(1) : "1.0"}
                      </span>
                    </td>
                    <td className="border-l border-border px-3 py-3 align-top bg-muted/5">
                      <textarea
                        value={estudiante.observaciones}
                        disabled={bloqueada}
                        onChange={event => updateEstudiante(estudiante.estudianteId, actual => ({ ...actual, observaciones: event.target.value }))}
                        rows={2}
                        className="min-h-[58px] w-full resize-y rounded-lg border border-border bg-background px-3 py-1.5 text-[12px] outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed focus:bg-card transition-all"
                        placeholder="Observaciones pedagógicas..."
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        /* Vista Ficha Individual (Estilo Rúbrica) */
        <div className="flex flex-col lg:flex-row gap-4 border border-border bg-card rounded-[14px] overflow-hidden min-h-[520px]">
          {/* Sidebar de alumnos del grupo */}
          <div className="w-full lg:w-56 border-b lg:border-b-0 lg:border-r border-border bg-muted/10 shrink-0">
            <div className="bg-muted/30 border-b border-border px-4 py-2.5 flex items-center justify-between">
              <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Estudiantes ({estudiantesDelGrupo.length})</span>
            </div>
            <div className="flex lg:flex-col overflow-x-auto lg:overflow-x-visible p-2 gap-1.5 lg:gap-1 max-h-[300px] lg:max-h-[520px] lg:overflow-y-auto">
              {estudiantesDelGrupo.length === 0 ? (
                <div className="w-full px-3 py-6 text-center text-muted-foreground text-[12px]">No se encontraron alumnos.</div>
              ) : (
                estudiantesDelGrupo.map(est => {
                  const esActivo = alumnoActivoObj?.estudianteId === est.estudianteId
                  return (
                    <button
                      key={est.estudianteId}
                      type="button"
                      onClick={() => setAlumnoActivoId(est.estudianteId)}
                      className={`flex-shrink-0 lg:flex-shrink w-max lg:w-full text-left px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                        esActivo
                          ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                          : "hover:bg-muted/50 border-transparent text-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12.5px] font-bold truncate max-w-[130px] lg:max-w-none">{est.nombre}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {est.hasPie && (
                            <span className={`text-[8.5px] font-extrabold px-1.5 rounded ${
                              esActivo ? "bg-white/20 text-white" : "bg-blue-100 text-blue-700"
                            }`}>PIE</span>
                          )}
                          {est.completado && (
                            <CheckCircle2 className={`w-3.5 h-3.5 ${esActivo ? "text-white" : "text-green-500"}`} />
                          )}
                        </div>
                      </div>
                      <div className={`text-[11px] mt-0.5 flex justify-between items-center ${
                        esActivo ? "text-white/80" : "text-muted-foreground"
                      }`}>
                        <span>{est.puntaje ?? 0}/{lista.puntajeMaximo} pts</span>
                        <span className="font-extrabold">{est.nota ? est.nota.toFixed(1) : "1.0"}</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          {/* Panel de Evaluación del estudiante activo */}
          <div className="flex-grow p-4 bg-card flex flex-col justify-between min-w-0">
            {!alumnoActivoObj ? (
              <div className="flex h-full items-center justify-center text-muted-foreground text-[13px]">
                Seleccione un estudiante de la lista.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Resumen del estudiante */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border pb-3 bg-muted/5 p-3 rounded-xl border gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[16px] font-extrabold text-foreground">{alumnoActivoObj.nombre}</h3>
                      <button
                        type="button"
                        disabled={bloqueada}
                        onClick={() => {
                          setMostrarAsistenteIA(prev => {
                            const next = !prev
                            if (next) {
                              setResultadoIA(null)
                              setFileBase64(null)
                              setFileMime(null)
                              setFileName(null)
                              setPreviewUrl(null)
                              setErrorIA("")
                              setProgresoIA("")
                            }
                            return next
                          })
                        }}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 text-[11px] font-extrabold text-violet-700 hover:bg-violet-100 ${
                          bloqueada ? "cursor-not-allowed opacity-60" : ""
                        }`}
                        title="Corregir con foto o documento"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        IA
                      </button>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
                      <span className="font-semibold text-foreground bg-muted px-1.5 py-0.5 rounded">{alumnoActivoObj.puntaje ?? 0}/{lista.puntajeMaximo} puntos</span>
                      {alumnoActivoObj.hasPie && <span className="bg-blue-100 text-blue-700 font-bold px-1.5 py-0.5 rounded text-[9.5px]">PIE (Exigencia 50%)</span>}
                      {!alumnoActivoObj.hasPie && <span className="bg-zinc-100 text-zinc-700 font-bold px-1.5 py-0.5 rounded text-[9.5px]">Regular (Exigencia 60%)</span>}
                      {evaluacion.grupos.length > 1 && (
                        <span className="text-[10px] text-muted-foreground ml-1">
                          Mover a:{" "}
                          <select
                            value={grupoActivoIdx}
                            disabled={bloqueada}
                            onChange={(e) => {
                              const targetIdx = Number(e.target.value)
                              moverAlumno(alumnoActivoObj.estudianteId, grupoActivoIdx, targetIdx)
                              setAlumnoActivoId(null)
                            }}
                            className="text-[10px] border border-border rounded px-1.5 py-0.5 bg-background outline-none font-bold text-foreground font-sans cursor-pointer"
                          >
                            {evaluacion.grupos.map((g, gi) => (
                              <option key={g.id} value={gi}>
                                {g.nombre}
                              </option>
                            ))}
                          </select>
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`text-[24px] font-extrabold leading-none ${
                      alumnoActivoObj.nota && alumnoActivoObj.nota >= 4.0 ? "text-green-600" : "text-red-500"
                    }`}>
                      {alumnoActivoObj.nota ? alumnoActivoObj.nota.toFixed(1) : "1.0"}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1 font-medium">Nota formativa</div>
                  </div>
                </div>

                {mostrarAsistenteIA && (
                  <div className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/30 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Sparkles className="mt-0.5 h-4 w-4 text-violet-700" />
                        <div>
                          <h4 className="text-[13px] font-extrabold text-violet-950">Asistente IA</h4>
                          <p className="text-[11px] text-muted-foreground">
                            Sube una foto, escaneo o PDF del trabajo para sugerir las marcas de esta lista.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setMostrarAsistenteIA(false)}
                        className="rounded-full p-1 text-muted-foreground hover:bg-background"
                        title="Cerrar asistente"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {!resultadoIA && !analizandoIA && (
                      <div className="space-y-3">
                        <div className="rounded-xl border-2 border-dashed border-violet-200 bg-background/70 p-5 text-center">
                          <input
                            type="file"
                            id="lista-ai-file-upload"
                            accept="image/*,application/pdf"
                            onChange={handleFileChangeIA}
                            className="hidden"
                          />
                          <label htmlFor="lista-ai-file-upload" className="flex cursor-pointer flex-col items-center gap-2">
                            <span className="rounded-full bg-violet-50 p-3 text-violet-700">
                              <Upload className="h-5 w-5" />
                            </span>
                            <span className="text-[12px] font-extrabold text-violet-950">
                              {fileName || "Seleccionar archivo"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">PNG, JPG o PDF</span>
                          </label>
                        </div>

                        {previewUrl && (
                          <div className="flex max-h-40 justify-center overflow-hidden rounded-lg border border-border bg-background p-2">
                            <img src={previewUrl} alt="Vista previa" className="max-h-36 rounded object-contain" />
                          </div>
                        )}

                        {fileName && (
                          <button
                            type="button"
                            onClick={handleAnalizarConIA}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-[12px] font-extrabold text-white shadow-sm hover:bg-violet-800"
                          >
                            <Sparkles className="h-4 w-4" />
                            Analizar con IA
                          </button>
                        )}
                      </div>
                    )}

                    {analizandoIA && (
                      <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                        <Loader2 className="h-7 w-7 animate-spin text-violet-700" />
                        <p className="text-[12px] font-extrabold text-violet-950">{progresoIA}</p>
                        <p className="max-w-md text-[10.5px] text-muted-foreground">
                          Se esta leyendo el trabajo y contrastando la evidencia con los indicadores de la lista.
                        </p>
                      </div>
                    )}

                    {errorIA && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <div>
                          <p className="font-extrabold">Error al analizar</p>
                          <p>{errorIA}</p>
                        </div>
                      </div>
                    )}

                    {resultadoIA && (
                      <div className="space-y-4">
                        {resultadoIA.transcripcion && (
                          <div className="rounded-lg border border-border bg-background p-3">
                            <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold text-violet-950">
                              <FileText className="h-3.5 w-3.5 text-violet-700" />
                              Texto transcrito
                            </p>
                            <p className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-border/60 bg-muted/30 p-2 text-[11px] leading-relaxed text-foreground">
                              {resultadoIA.transcripcion}
                            </p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <p className="text-[11px] font-extrabold text-violet-950">Marcas sugeridas por indicador</p>
                          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                            {lista.secciones.flatMap(seccion => seccion.indicadores).map(indicador => {
                              const sugerencia = resultadoIA.respuestas?.[indicador.id]
                              if (!sugerencia) return null
                              const esSi = sugerencia.valor === true
                              return (
                                <div key={indicador.id} className="rounded-lg border border-border bg-background p-2.5">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-[11.5px] font-semibold leading-snug text-foreground">{indicador.texto}</p>
                                    <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-extrabold ${
                                      esSi
                                        ? "border-green-200 bg-green-100 text-green-800"
                                        : "border-red-200 bg-red-100 text-red-800"
                                    }`}>
                                      {esSi ? (lista.escalaDicotomica?.[0] || "Si") : (lista.escalaDicotomica?.[1] || "No")}
                                    </span>
                                  </div>
                                  {sugerencia.justificacion && (
                                    <p className="mt-1.5 text-[10.5px] italic leading-normal text-muted-foreground">
                                      {sugerencia.justificacion}
                                    </p>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>

                        {resultadoIA.observaciones && (
                          <div className="rounded-lg border border-border bg-background p-3">
                            <p className="mb-1 flex items-center gap-1 text-[11px] font-extrabold text-violet-950">
                              <Check className="h-3.5 w-3.5 text-green-600" />
                              Retroalimentacion sugerida
                            </p>
                            <p className="text-[11.5px] leading-relaxed text-foreground">{resultadoIA.observaciones}</p>
                          </div>
                        )}

                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            onClick={aplicarEvaluacionIA}
                            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-[12px] font-extrabold text-white shadow-sm hover:bg-green-700"
                          >
                            <Check className="h-4 w-4" />
                            Aplicar a la lista
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResultadoIA(null)
                              setFileBase64(null)
                              setFileMime(null)
                              setFileName(null)
                              setPreviewUrl(null)
                              setErrorIA("")
                            }}
                            className="rounded-lg border border-border px-3 py-2 text-[12px] font-bold text-muted-foreground hover:bg-muted"
                          >
                            Descartar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Indicadores agrupados por sección */}
                <div className="space-y-5 max-h-[380px] overflow-y-auto pr-1">
                  {lista.secciones.map(seccion => (
                    <div key={seccion.id} className="space-y-2.5">
                      <h4 className="text-[12.5px] font-extrabold text-violet-700 border-b border-violet-100 pb-1 bg-violet-50/30 px-2 py-0.5 rounded">{seccion.nombre}</h4>
                      <div className="grid gap-2">
                        {seccion.indicadores.map(indicador => {
                          const valor = alumnoActivoObj.respuestas[indicador.id]
                          return (
                            <div key={indicador.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-xl border border-border hover:border-zinc-300 bg-background transition-colors gap-3">
                              <div className="space-y-1 pr-2">
                                <p className="text-[12px] font-semibold text-foreground leading-snug">{indicador.texto}</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {indicador.focoDiferenciadoActivo && (
                                    <span className="text-[9.5px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold" title={indicador.focoDiferenciadoTexto}>
                                      ♿ DUA: {indicador.focoDiferenciadoTexto}
                                    </span>
                                  )}
                                  {indicador.esTransversal && (
                                    <span className="text-[9.5px] bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-bold">
                                      🌱 OAT Actitudinal
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                                <button
                                  type="button"
                                  disabled={bloqueada}
                                  onClick={() => setRespuesta(alumnoActivoObj.estudianteId, indicador.id, true)}
                                  className={`flex h-9 min-w-[75px] px-3 items-center justify-center gap-1 rounded-lg border text-[12px] font-bold transition-all cursor-pointer ${
                                    valor === true
                                      ? "border-green-600 bg-green-600 text-white shadow-sm"
                                      : "border-border bg-background text-muted-foreground hover:bg-green-50 hover:text-green-700 hover:border-green-300"
                                  } ${bloqueada ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  <Check className="h-4 w-4" />
                                  {lista.escalaDicotomica?.[0] || "Si"}
                                </button>
                                <button
                                  type="button"
                                  disabled={bloqueada}
                                  onClick={() => setRespuesta(alumnoActivoObj.estudianteId, indicador.id, false)}
                                  className={`flex h-9 min-w-[75px] px-3 items-center justify-center gap-1 rounded-lg border text-[12px] font-bold transition-all cursor-pointer ${
                                    valor === false
                                      ? "border-red-600 bg-red-600 text-white shadow-sm"
                                      : "border-border bg-background text-muted-foreground hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                                  } ${bloqueada ? "opacity-60 cursor-not-allowed" : ""}`}
                                >
                                  <X className="h-4 w-4" />
                                  {lista.escalaDicotomica?.[1] || "No"}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Observaciones del estudiante activo */}
                <div className="space-y-1.5 border-t border-border pt-3">
                  <span className="text-[11px] font-bold uppercase text-muted-foreground tracking-wider block">Observaciones Pedagógicas Formativas</span>
                  <textarea
                    value={alumnoActivoObj.observaciones}
                    disabled={bloqueada}
                    onChange={event => updateEstudiante(alumnoActivoObj.estudianteId, actual => ({ ...actual, observaciones: event.target.value }))}
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[12.5px] outline-none focus:border-primary disabled:opacity-60 disabled:cursor-not-allowed focus:bg-card transition-all"
                    placeholder="Escriba aquí la retroalimentación formativa cualitativa para el estudiante..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
      {/* Modal de Distribución Rápida */}
      <Dialog open={showDistribucionModal} onOpenChange={setShowDistribucionModal}>
        <DialogContent className="sm:max-w-md border-border bg-card p-6 rounded-[14px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-violet-800 text-[18px] font-extrabold">
              <Sparkles className="h-5 w-5 text-violet-600 animate-pulse" />
              Distribución Rápida y Reglas
            </DialogTitle>
            <DialogDescription className="text-[12.5px] text-muted-foreground mt-1">
              Organiza a los estudiantes en grupos de manera aleatoria respetando reglas de inclusión y asistencia.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            {/* Tipo de distribución */}
            <div className="space-y-2">
              <label className="text-[11.5px] font-bold uppercase text-muted-foreground">Método de distribución</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDistribucionTipo("porGrupo")}
                  className={`py-2 px-3 text-[12px] font-bold rounded-lg border transition-all ${
                    distribucionTipo === "porGrupo"
                      ? "border-violet-600 bg-violet-50 text-violet-800"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  Alumnos por grupo
                </button>
                <button
                  type="button"
                  onClick={() => setDistribucionTipo("totalGrupos")}
                  className={`py-2 px-3 text-[12px] font-bold rounded-lg border transition-all ${
                    distribucionTipo === "totalGrupos"
                      ? "border-violet-600 bg-violet-50 text-violet-800"
                      : "border-border bg-background text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  Cantidad de grupos
                </button>
              </div>
            </div>

            {/* Valor numérico */}
            <div className="space-y-1.5">
              <label className="text-[11.5px] font-bold uppercase text-muted-foreground">
                {distribucionTipo === "porGrupo" ? "Cantidad de alumnos por grupo" : "Total de grupos a crear"}
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={distribucionValor}
                onChange={(e) => setDistribucionValor(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-[13px] font-medium outline-none focus:border-violet-500"
              />
            </div>

            {/* Reglas seleccionables */}
            <div className="space-y-2 border-t border-border pt-3">
              <label className="text-[11.5px] font-bold uppercase text-muted-foreground block mb-1">Reglas de distribución</label>
              
              <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-lg border border-purple-100 bg-purple-50/20 p-3 hover:bg-purple-50/40 transition-colors">
                <input
                  type="checkbox"
                  checked={reglaEvitarPieJuntos}
                  onChange={(e) => setReglaEvitarPieJuntos(e.target.checked)}
                  className="rounded border-purple-300 text-purple-600 focus:ring-purple-500 w-4.5 h-4.5 cursor-pointer mt-0.5"
                />
                <div>
                  <span className="text-[12.5px] font-bold text-purple-950 block">Evitar PIE juntos</span>
                  <span className="text-[11px] text-purple-700/80 block mt-0.5">
                    No se asignarán 2 estudiantes con diagnóstico PIE en el mismo grupo a menos que sea matemáticamente necesario.
                  </span>
                </div>
              </label>

              <div className="rounded-lg border border-amber-100 bg-amber-50/20 p-3 text-[11px] text-amber-800">
                ⚠️ <b>Nota de Asistencia:</b> Los estudiantes que se encuentren actualmente en el grupo de <b>Ausentes</b> no serán redistribuidos.
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <DialogClose asChild>
              <button
                type="button"
                className="px-4 py-2 text-[12px] font-bold rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted/40 transition-colors"
              >
                Cancelar
              </button>
            </DialogClose>
            <button
              type="button"
              onClick={() => ejecutarDistribucion(distribucionTipo, distribucionValor, reglaEvitarPieJuntos)}
              className="px-4 py-2 text-[12px] font-bold rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors shadow-sm shadow-violet-500/10"
            >
              Aplicar distribución
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
