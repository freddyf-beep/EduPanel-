"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  GripVertical,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { ApiError, apiFetch } from "@/lib/api-client"
import { cargarHorarioSemanal } from "@/lib/horario"
import { buildUrl, withAsignatura, getCurriculoNivel } from "@/lib/shared"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { toast } from "@/hooks/use-toast"
import { cargarNivelMapping, type NivelMapping } from "@/lib/nivel-mapping"
import { getUnidades, type Unidad } from "@/lib/curriculo"
import { resolverMetadatosCurricularesRubrica, cargarOAsParaRubrica } from "@/lib/rubricas"
import { RubricaOAEditor } from "@/components/edu-panel/rubricas/rubrica-oa-editor"
import type { OAEditado } from "@/lib/curriculo"
import {
  buildListaCotejoId,
  cargarListaCotejo,
  guardarListaCotejo,
  normalizarListaCotejoTemplate,
  nuevaListaCotejo,
  nuevaSeccionLista,
  nuevoIndicadorLista,
  type IndicadorListaCotejo,
  type ListaCotejoTemplate,
  type SeccionListaCotejo,
} from "@/lib/listas-cotejo"
import { abrirListaCotejoPlantillaUTP } from "@/lib/export/lista-cotejo-pdf"
import { ListaCotejoIaModal } from "@/components/edu-panel/listas-cotejo/lista-cotejo-ia-modal"

interface Props {
  mode: "blank" | "import"
  listaId?: string
}

type ListaImportada = Omit<ListaCotejoTemplate, "id" | "createdAt" | "updatedAt">

function refsToInput(refs: string[]): string {
  return refs.join(", ")
}

function inputToRefs(value: string): string[] {
  return value
    .split(/\s*(?:,|;|\/|\||\sy\s)\s*/i)
    .map(item => item.trim())
    .filter(Boolean)
}

function validarVerbosMentalistas(texto: string): string | null {
  if (!texto) return null
  const verbosProhibidos = [
    "comprende", "comprender", "comprenden", "comprendio",
    "entiende", "entender", "entienden", "entendio",
    "sabe", "saber", "saben", "sabia",
    "conoce", "conocer", "conocen", "conocio",
    "reflexiona", "reflexionar", "reflexionan",
    "valora", "valorar", "valoran", "valoro",
    "aprecia", "apreciar", "aprecian",
    "asimila", "asimilar", "asimilacion",
    "piensa", "pensar", "piensan",
    "razona", "razonar", "razonan"
  ]
  const palabras = texto.toLowerCase().split(/[^a-záéíóúüñ]+/)
  const coincidencia = palabras.find(p => verbosProhibidos.includes(p))
  if (coincidencia) {
    return `Evita verbos cognitivos inobservables como "${coincidencia}". Usa verbos observables (ej: nombra, describe, señala, manipula).`
  }
  return null
}

function normalizarParaGuardar(lista: ListaCotejoTemplate): ListaCotejoTemplate {
  const secciones = lista.secciones
    .map((seccion, seccionIndex) => ({
      ...seccion,
      orden: seccionIndex + 1,
      nombre: seccion.nombre.trim() || `Seccion ${seccionIndex + 1}`,
      indicadores: seccion.indicadores
        .filter(indicador => indicador.texto.trim().length > 0)
        .map((indicador, indicadorIndex) => ({
          ...indicador,
          orden: indicadorIndex + 1,
          texto: indicador.texto.trim(),
          esTransversal: !!indicador.esTransversal,
          focoDiferenciadoActivo: !!indicador.focoDiferenciadoActivo,
          focoDiferenciadoTexto: indicador.focoDiferenciadoTexto?.trim() ?? "",
          puedoFilmarloConfirmado: !!indicador.puedoFilmarloConfirmado,
        })),
    }))
    .filter(seccion => seccion.indicadores.length > 0)

  return normalizarListaCotejoTemplate({
    ...lista,
    nombre: lista.nombre.trim() || "Lista de cotejo",
    instruccionesMetodologicas: lista.instruccionesMetodologicas?.trim() ?? "",
    escalaDicotomica: lista.escalaDicotomica || ["Sí", "No"],
    rbd: lista.rbd?.trim() ?? "",
    nombreEstablecimiento: lista.nombreEstablecimiento?.trim() ?? "",
    docenteNombre: lista.docenteNombre?.trim() ?? "",
    secciones,
  })
}

export function ListaCotejoEditor({ mode, listaId }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [cursos, setCursos] = useState<string[]>([])
  const [lista, setLista] = useState<ListaCotejoTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [importando, setImportando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState("")
  const [showIaModal, setShowIaModal] = useState(false)

  const [nivelMapping, setNivelMapping] = useState<NivelMapping>({})
  const [unidadesDisponibles, setUnidadesDisponibles] = useState<Unidad[]>([])
  const [cargandoUnidades, setCargandoUnidades] = useState(false)
  const [oasCargando, setOasCargando] = useState(false)
  const [curriculoCargando, setCurriculoCargando] = useState(false)
  const [curriculoResolucion, setCurriculoResolucion] = useState<any>(null)

  const ignoreFirstSave = useRef(true)
  const autoSaveRunRef = useRef(0)
  const curriculoRequestRef = useRef(0)
  const oasRequestRef = useRef(0)
  const loadedRef = useRef<string | null>(null)
  const isDirtyRef = useRef(false)

  const cursoParam = searchParams.get("curso") ?? ""
  const esEdicion = mode === "blank" && !!listaId

  // Cargar nivel mapping y cursos
  useEffect(() => {
    let cancelled = false
    const cargar = async () => {
      const loadKey = esEdicion ? listaId : "new"
      if (loadedRef.current === loadKey) {
        return
      }

      try {
        const horario = await cargarHorarioSemanal()
        const cursosDisponibles = Array.from(
          new Set(horario.filter(h => h.tipo === "clase").map(h => h.resumen).filter(Boolean))
        )
        if (cancelled) return

        setCursos(cursosDisponibles)
        const cursoBase = cursoParam || cursosDisponibles[0] || ""

        if (esEdicion && listaId) {
          const existente = await cargarListaCotejo(listaId)
          if (cancelled) return
          if (!existente) {
            setError("Lista de cotejo no encontrada")
            setLista(null)
            return
          }
          loadedRef.current = listaId
          setLista(existente)
          return
        }

        loadedRef.current = "new"
        setLista(nuevaListaCotejo(asignatura, cursoBase))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar editor")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    cargar()
    cargarNivelMapping().then(setNivelMapping).catch(console.error)

    return () => {
      cancelled = true
    }
  }, [asignatura, cursoParam, esEdicion, listaId])

  // Busca el nivel curricular haciendo match fuzzy
  const resolverNivelDeCurso = useCallback((cursoNombre: string): string | null => {
    if (!cursoNombre || !nivelMapping) return null
    if (nivelMapping[cursoNombre]) return nivelMapping[cursoNombre]
    const keyPrefijo = Object.keys(nivelMapping).find(k =>
      cursoNombre.startsWith(k) || k.startsWith(cursoNombre)
    )
    if (keyPrefijo) return nivelMapping[keyPrefijo]
    const grado = cursoNombre.match(/^(\d+)\s*[°º]/)?.[1]
    if (grado) {
      const keyGrado = Object.keys(nivelMapping).find(k => k.match(/^(\d+)\s*[°º]/)?.[1] === grado)
      if (keyGrado) return nivelMapping[keyGrado]
    }
    return null
  }, [nivelMapping])

  // Cargar unidades del currículum cuando cambia el curso o la asignatura
  useEffect(() => {
    const cursoActual = lista?.curso ?? cursoParam
    const nivel = resolverNivelDeCurso(cursoActual)
    if (!nivel || !asignatura) {
      setUnidadesDisponibles([])
      return
    }
    setCargandoUnidades(true)
    getUnidades(asignatura, nivel)
      .then(setUnidadesDisponibles)
      .catch(() => setUnidadesDisponibles([]))
      .finally(() => setCargandoUnidades(false))
  }, [lista?.curso, cursoParam, asignatura, resolverNivelDeCurso])

  // Cargar OAs interactivos cuando cambia la unidad seleccionada
  useEffect(() => {
    if (!lista?.unidadId || !asignatura) return
    const uid  = lista.unidadId
    const reqId = ++oasRequestRef.current
    setOasCargando(true)
    cargarOAsParaRubrica(asignatura, lista.curso, uid, lista.oas)
      .then(oas => {
        if (oasRequestRef.current !== reqId) return
        setLista(prev => {
          if (!prev || prev.unidadId !== uid) return prev
          return { ...prev, oas }
        })
      })
      .catch(console.error)
      .finally(() => { if (oasRequestRef.current === reqId) setOasCargando(false) })
  }, [lista?.unidadId, asignatura])

  // Lógica de auto-guardado en Firebase
  useEffect(() => {
    if (!lista) return
    if (!isDirtyRef.current) return
    if (ignoreFirstSave.current) {
      ignoreFirstSave.current = false
      setSaveStatus("idle")
      return
    }

    const runId = ++autoSaveRunRef.current
    setSaveStatus(prev => prev === "saving" ? prev : "idle")
    const timer = setTimeout(async () => {
      setSaveStatus("saving")
      try {
        const listaLimpia = normalizarParaGuardar(lista)
        await guardarListaCotejo(listaLimpia)
        if (autoSaveRunRef.current === runId) {
          setSaveStatus("saved")
        }
      } catch (saveError) {
        console.error(saveError)
        if (autoSaveRunRef.current === runId) {
          setSaveStatus("error")
          toast({
            title: "No se pudo autoguardar",
            description: saveError instanceof Error ? saveError.message : "Inténtalo nuevamente.",
            variant: "destructive",
          })
        }
      }
    }, 2500)

    return () => clearTimeout(timer)
  }, [lista])

  // Prevenir cierre de pestaña mientras se guarda
  useEffect(() => {
    if (saveStatus !== "saving") return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [saveStatus])

  // Resolver metadatos curriculares automáticamente al cambiar unidadNombre
  const resolverCurriculo = useCallback(async (baseLista: ListaCotejoTemplate) => {
    const requestId = ++curriculoRequestRef.current
    setCurriculoCargando(true)

    try {
      const resolucion = await resolverMetadatosCurricularesRubrica(baseLista)
      if (curriculoRequestRef.current !== requestId) {
        return baseLista
      }

      setCurriculoResolucion(resolucion)

      if (!resolucion.resolvedFromDatabase) {
        return baseLista
      }

      return {
        ...baseLista,
        unidadId: resolucion.unidadId ?? baseLista.unidadId,
        unidadNombre: resolucion.unidadNombre ?? baseLista.unidadNombre,
        metadatosCurriculares: resolucion.metadatosCurriculares,
      }
    } catch (curriculoError) {
      console.error(curriculoError)
      if (curriculoRequestRef.current === requestId) {
        setCurriculoResolucion({
          metadatosCurriculares: baseLista.metadatosCurriculares ?? { objetivos: [], indicadores: [], objetivosTransversales: [] },
          unidadId: baseLista.unidadId,
          unidadNombre: baseLista.unidadNombre,
          resolvedFromDatabase: false,
        })
      }
      return baseLista
    } finally {
      if (curriculoRequestRef.current === requestId) {
        setCurriculoCargando(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!lista) return

    resolverCurriculo(lista).then(listaConCurriculo => {
      if (listaConCurriculo === lista) return
      setLista(prev => {
        if (!prev || prev.id !== lista.id) return prev
        const metadatosPrevios = prev.metadatosCurriculares ?? { objetivos: [], indicadores: [], objetivosTransversales: [] }
        const metadatosNuevos = listaConCurriculo.metadatosCurriculares ?? { objetivos: [], indicadores: [], objetivosTransversales: [] }
        const noHayCambios =
          (prev.unidadId ?? "") === (listaConCurriculo.unidadId ?? "") &&
          (prev.unidadNombre ?? "") === (listaConCurriculo.unidadNombre ?? "") &&
          JSON.stringify(metadatosPrevios.objetivos) === JSON.stringify(metadatosNuevos.objetivos) &&
          JSON.stringify(metadatosPrevios.indicadores) === JSON.stringify(metadatosNuevos.indicadores) &&
          JSON.stringify(metadatosPrevios.objetivosTransversales) === JSON.stringify(metadatosNuevos.objetivosTransversales)

        if (noHayCambios) {
          return prev
        }
        return {
          ...prev,
          unidadId: listaConCurriculo.unidadId,
          unidadNombre: listaConCurriculo.unidadNombre,
          metadatosCurriculares: metadatosNuevos,
        }
      })
    })
  }, [lista?.asignatura, lista?.curso, lista?.unidadNombre, resolverCurriculo])

  const volver = () => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", curso: lista?.curso || cursoParam }, asignatura)))
  }

  const updateLista = (fn: (actual: ListaCotejoTemplate) => ListaCotejoTemplate) => {
    isDirtyRef.current = true
    setLista(prev => prev ? fn(prev) : prev)
  }

  const updateSeccion = (
    seccionId: string,
    fn: (seccion: SeccionListaCotejo) => SeccionListaCotejo
  ) => {
    updateLista(actual => ({
      ...actual,
      secciones: actual.secciones.map(seccion => seccion.id === seccionId ? fn(seccion) : seccion),
    }))
  }

  const updateIndicador = (
    seccionId: string,
    indicadorId: string,
    fn: (indicador: IndicadorListaCotejo) => IndicadorListaCotejo
  ) => {
    updateSeccion(seccionId, seccion => ({
      ...seccion,
      indicadores: seccion.indicadores.map(indicador => indicador.id === indicadorId ? fn(indicador) : indicador),
    }))
  }

  const agregarSeccion = () => {
    updateLista(actual => ({
      ...actual,
      secciones: [...actual.secciones, nuevaSeccionLista(actual.secciones.length + 1)],
    }))
  }

  const eliminarSeccion = (seccionId: string) => {
    updateLista(actual => {
      const restantes = actual.secciones.filter(seccion => seccion.id !== seccionId)
      return { ...actual, secciones: restantes.length > 0 ? restantes : [nuevaSeccionLista(1)] }
    })
  }

  const agregarIndicador = (seccionId: string) => {
    updateSeccion(seccionId, seccion => ({
      ...seccion,
      indicadores: [...seccion.indicadores, nuevoIndicadorLista()],
    }))
  }

  const eliminarIndicador = (seccionId: string, indicadorId: string) => {
    updateSeccion(seccionId, seccion => {
      const restantes = seccion.indicadores.filter(indicador => indicador.id !== indicadorId)
      return { ...seccion, indicadores: restantes.length > 0 ? restantes : [nuevoIndicadorLista()] }
    })
  }

  const handleImportarWord = async (file: File) => {
    setImportando(true)
    setError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await apiFetch("/api/parse-lista-cotejo", { method: "POST", body: formData })
      const data = await res.json() as ListaImportada
      const cursoResuelto = data.curso || lista?.curso || cursoParam || cursos[0] || ""
      isDirtyRef.current = true
      setLista(normalizarListaCotejoTemplate({
        ...data,
        id: lista?.id || buildListaCotejoId(asignatura, cursoResuelto),
        asignatura: asignatura,
        curso: cursoResuelto,
      }))
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | undefined
        setError(body?.error || err.message)
      } else {
        setError(err instanceof Error ? err.message : "Error al importar Word")
      }
    } finally {
      setImportando(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleGuardar = async () => {
    if (!lista) return
    setGuardando(true)
    setSaveStatus("saving")
    setError("")
    try {
      const listaLimpia = normalizarParaGuardar(lista)
      if (!listaLimpia.curso) throw new Error("Selecciona un curso")
      if (listaLimpia.secciones.length === 0) throw new Error("Agrega al menos un indicador")
      await guardarListaCotejo(listaLimpia)
      setSaveStatus("saved")
      router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", curso: listaLimpia.curso }, asignatura)))
    } catch (err) {
      setSaveStatus("error")
      setError(err instanceof Error ? err.message : "Error al guardar")
    } finally {
      setGuardando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Cargando editor...
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

  return (
    <div className="mx-auto max-w-6xl space-y-4">
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
            <h1 className="text-[22px] font-extrabold text-foreground">
              {mode === "import" ? "Importar lista de cotejo" : esEdicion ? "Editar lista de cotejo" : "Nueva lista de cotejo"}
            </h1>
            <div
              className={`flex items-center gap-1.5 truncate text-[11px] sm:text-[12px] ${
                saveStatus === "saved"
                  ? "text-green-600"
                  : saveStatus === "error"
                    ? "text-red-600"
                    : "text-muted-foreground"
              }`}
            >
              {saveStatus === "saving" && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />}
              {saveStatus === "saved" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
              {saveStatus === "error" && <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
              <span className="truncate">
                {saveStatus === "saving"
                  ? "Guardando..."
                  : saveStatus === "saved"
                    ? "Guardado"
                    : saveStatus === "error"
                      ? "Error al guardar"
                      : "Los cambios se guardan automáticamente"}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowIaModal(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-violet-300 bg-violet-50 text-violet-800 px-3.5 text-[12px] font-bold transition-colors hover:bg-violet-100"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Asistente IA
          </button>
          <button
            type="button"
            onClick={() => {
              if (lista) {
                abrirListaCotejoPlantillaUTP({
                  lista: normalizarParaGuardar(lista),
                  profesorNombre: lista.docenteNombre || "Docente Evaluador"
                })
              }
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-sky-300 bg-sky-50 text-sky-800 px-3.5 text-[12px] font-bold transition-colors hover:bg-sky-100"
          >
            Exportar UTP
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={guardando}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <Save className="h-3.5 w-3.5 shrink-0" />}
            Guardar y salir
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {mode === "import" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div
            onDragOver={event => event.preventDefault()}
            onDrop={event => {
              event.preventDefault()
              const file = event.dataTransfer.files?.[0]
              if (file) void handleImportarWord(file)
            }}
            className="rounded-[14px] border border-dashed border-border bg-card p-5"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0]
                if (file) void handleImportarWord(file)
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importando}
              className="flex w-full flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:bg-muted/40 disabled:opacity-60 cursor-pointer"
            >
              {importando ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
              <span className="mt-3 text-[14px] font-bold text-foreground">Arrastra tu Word aquí</span>
              <span className="mt-1 text-[12px] text-muted-foreground">o haz clic para seleccionar un .docx con indicadores Si/No</span>
            </button>
          </div>

          <div className="rounded-[14px] border border-dashed border-border bg-card p-5">
            <div className="flex w-full flex-col items-center justify-center rounded-[12px] border border-dashed border-violet-200 bg-violet-500/5 px-4 py-8 text-center h-full min-h-[180px]">
              <Sparkles className="h-8 w-8 text-violet-500 animate-pulse animate-duration-1000" />
              <span className="mt-3 text-[14px] font-bold text-foreground">Genera o Adapta con IA</span>
              <span className="mt-1 text-[12px] text-muted-foreground px-2">Utiliza nuestro Asistente IA Avanzado para crear tu lista de cotejo con DUA en segundos</span>
              <button
                type="button"
                onClick={() => setShowIaModal(true)}
                className="mt-5 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-violet-600 px-4 text-[12px] font-bold text-white transition-opacity hover:opacity-90 cursor-pointer shadow-sm shadow-violet-500/10"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Abrir Asistente IA
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-[14px] font-extrabold text-foreground">Información general</h2>
        
        {/* Fila 1: Trazabilidad Básica */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Nombre del Establecimiento</span>
            <input
              value={lista.nombreEstablecimiento || ""}
              onChange={event => updateLista(actual => ({ ...actual, nombreEstablecimiento: event.target.value }))}
              placeholder="Ej: Colegio San Agustín"
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">RBD (Rol Base Datos)</span>
            <input
              value={lista.rbd || ""}
              onChange={event => updateLista(actual => ({ ...actual, rbd: event.target.value }))}
              placeholder="Ej: 12345-6"
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Nombre del Docente</span>
            <input
              value={lista.docenteNombre || ""}
              onChange={event => updateLista(actual => ({ ...actual, docenteNombre: event.target.value }))}
              placeholder="Ej: Prof. María José"
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Escala Dicotómica</span>
            <select
              value={lista.escalaDicotomica ? `${lista.escalaDicotomica[0]}/${lista.escalaDicotomica[1]}` : "Sí/No"}
              onChange={event => {
                const parts = event.target.value.split("/")
                updateLista(actual => ({ ...actual, escalaDicotomica: [parts[0], parts[1]] }))
              }}
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            >
              <option value="Sí/No">Sí / No</option>
              <option value="Logrado/No logrado">Logrado / No logrado</option>
              <option value="Presente/Ausente">Presente / Ausente</option>
            </select>
          </label>
        </div>

        {/* Fila 2: Trazabilidad Didáctica */}
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Nombre del Instrumento</span>
            <input
              value={lista.nombre}
              onChange={event => updateLista(actual => ({ ...actual, nombre: event.target.value }))}
              placeholder="Ej: Pauta de Cotejo - Lectura Rítmica"
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Curso</span>
            <select
              value={lista.curso}
              onChange={event => updateLista(actual => ({ ...actual, curso: event.target.value }))}
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            >
              {!lista.curso && <option value="">Seleccionar</option>}
              {cursos.map(curso => (
                <option key={curso} value={curso}>{curso}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Puntos por Logro</span>
            <input
              type="number"
              min={0.1}
              step={0.5}
              value={lista.puntajePorSi}
              onChange={event => {
                const value = Number.parseFloat(event.target.value)
                updateLista(actual => ({ ...actual, puntajePorSi: Number.isFinite(value) && value > 0 ? value : 1 }))
              }}
              className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
            />
          </label>
        </div>

        {/* Fila 3: Unidad Curricular */}
        <div className="mt-3">
          <label className="space-y-1.5 block">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">
              Unidad curricular
              {cargandoUnidades && <Loader2 className="ml-1 inline h-3 w-3 animate-spin text-primary" />}
            </span>
            {unidadesDisponibles.length > 0 ? (
              <select
                value={lista.unidadNombre || ""}
                onChange={event => {
                  const unidadSel = unidadesDisponibles.find(u => (u.nombre_unidad || "") === event.target.value)
                  updateLista(actual => ({
                    ...actual,
                    unidadNombre: event.target.value || undefined,
                    unidadId: unidadSel?.id || undefined,
                    oas: undefined,
                  }))
                }}
                className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
              >
                <option value="">— Seleccionar unidad —</option>
                {unidadesDisponibles.map(u => (
                  <option key={u.id} value={u.nombre_unidad || u.id}>
                    {u.numero_unidad ? `Unidad ${u.numero_unidad}: ` : ""}{u.nombre_unidad || u.id}
                  </option>
                ))}
              </select>
            ) : (
              <div className="h-10 flex items-center rounded-[10px] border border-border bg-background px-3 text-[13px] text-muted-foreground">
                {cargandoUnidades
                  ? "Cargando unidades..."
                  : nivelMapping[lista.curso]
                    ? "Sin unidades en la base curricular para este nivel"
                    : `Configura el nivel curricular de "${lista.curso}" en Mi Perfil`}
              </div>
            )}
          </label>
        </div>

        {/* Fila 4: Instrucciones Metodológicas */}
        <div className="mt-3">
          <label className="space-y-1.5 block">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Instrucciones Metodológicas</span>
            <textarea
              value={lista.instruccionesMetodologicas || ""}
              onChange={event => updateLista(actual => ({ ...actual, instruccionesMetodologicas: event.target.value }))}
              placeholder="Indica cómo los estudiantes deben realizar la tarea o cómo el evaluador registrará la información (ej: Marque una X por cada criterio observado directamente en la ejecución musical)."
              rows={2}
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] outline-none focus:border-primary resize-y min-h-[60px]"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3 rounded-[14px] border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-foreground">Objetivos e indicadores</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {oasCargando
                ? "Cargando OA desde la base curricular..."
                : lista.unidadId
                  ? "Haz clic en los puntos para seleccionar/deseleccionar OA e indicadores."
                  : "Selecciona una unidad para cargar los OA automáticamente, o agrega uno propio."}
            </p>
          </div>
          {curriculoCargando && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <RubricaOAEditor
          oas={lista.oas ?? []}
          onChange={(oas: OAEditado[]) => updateLista(current => ({ ...current, oas }))}
          asignatura={lista.asignatura || asignatura}
          cargando={oasCargando}
        />
      </section>

      <section className="space-y-3">
        {lista.secciones.map((seccion, seccionIndex) => (
          <div key={seccion.id} className="rounded-[14px] border border-border bg-card p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex flex-1 items-start gap-2">
                <GripVertical className="mt-3 h-4 w-4 text-muted-foreground" />
                <div className="grid flex-1 gap-3 md:grid-cols-[1fr_220px]">
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">Seccion {seccionIndex + 1}</span>
                    <input
                      value={seccion.nombre}
                      onChange={event => updateSeccion(seccion.id, actual => ({ ...actual, nombre: event.target.value }))}
                      className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] font-bold outline-none focus:border-primary"
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[11px] font-bold uppercase text-muted-foreground">OA/OAA</span>
                    <input
                      value={refsToInput(seccion.oasVinculados)}
                      onChange={event => updateSeccion(seccion.id, actual => ({ ...actual, oasVinculados: inputToRefs(event.target.value) }))}
                      placeholder="OA 1, OAA A"
                      className="h-10 w-full rounded-[10px] border border-border bg-background px-3 text-[13px] outline-none focus:border-primary"
                    />
                  </label>
                </div>
              </div>
              <button
                type="button"
                onClick={() => eliminarSeccion(seccion.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border px-3 text-[12px] font-bold text-red-600 transition-colors hover:border-red-200 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Eliminar
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {seccion.indicadores.map((indicador, indicadorIndex) => (
                <div key={indicador.id} className="rounded-[12px] border border-border bg-background p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[12px] font-bold text-muted-foreground">
                      {indicadorIndex + 1}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <textarea
                        value={indicador.texto}
                        onChange={event => updateIndicador(seccion.id, indicador.id, actual => ({ ...actual, texto: event.target.value }))}
                        placeholder="Escribe un indicador observable (ej: Toca la secuencia rítmica respetando la pulsación)..."
                        rows={2}
                        className="w-full resize-y rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-primary"
                      />
                      {(() => {
                        const warning = validarVerbosMentalistas(indicador.texto)
                        if (warning) {
                          return (
                            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 font-medium animate-pulse">
                              ⚠️ {warning}
                            </p>
                          )
                        }
                        return null
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => eliminarIndicador(seccion.id, indicador.id)}
                      className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-border text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      aria-label="Eliminar indicador"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Focos y metadatos del indicador */}
                  <div className="grid gap-3 sm:grid-cols-3 pl-11 text-[12px]">
                    <label className="flex items-center gap-2 cursor-pointer select-none font-medium">
                      <input
                        type="checkbox"
                        checked={!!indicador.puedoFilmarloConfirmado}
                        onChange={event => updateIndicador(seccion.id, indicador.id, actual => ({ ...actual, puedoFilmarloConfirmado: event.target.checked }))}
                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      />
                      <span className="flex items-center gap-1">
                        📹 ¿Puedo filmarlo?
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none font-medium">
                      <input
                        type="checkbox"
                        checked={!!indicador.esTransversal}
                        onChange={event => updateIndicador(seccion.id, indicador.id, actual => ({ ...actual, esTransversal: event.target.checked }))}
                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      />
                      <span>🌱 Es Transversal (OAT)</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none font-medium">
                      <input
                        type="checkbox"
                        checked={!!indicador.focoDiferenciadoActivo}
                        onChange={event => updateIndicador(seccion.id, indicador.id, actual => ({ ...actual, focoDiferenciadoActivo: event.target.checked }))}
                        className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer"
                      />
                      <span>♿ Canal alternativo (Dec 83)</span>
                    </label>
                  </div>

                  {indicador.focoDiferenciadoActivo && (
                    <div className="pl-11 animate-fadeIn">
                      <label className="space-y-1.5 block">
                        <span className="text-[11px] font-bold uppercase text-purple-700">Mecanismo de salida alternativo para inclusión</span>
                        <input
                          value={indicador.focoDiferenciadoTexto || ""}
                          onChange={event => updateIndicador(seccion.id, indicador.id, actual => ({ ...actual, focoDiferenciadoTexto: event.target.value }))}
                          placeholder="Ej: Señala mediante gestos la secuencia o percute sobre sus piernas en reemplazo del instrumento."
                          className="h-9 w-full rounded-[10px] border border-purple-200 bg-purple-50/30 px-3 text-[12px] outline-none focus:border-purple-500 text-purple-900"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => agregarIndicador(seccion.id)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-bold transition-colors hover:bg-muted/60"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar indicador
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={agregarSeccion}
          className="inline-flex items-center gap-1.5 rounded-[10px] border border-border bg-card px-3 py-2 text-[12px] font-bold transition-colors hover:bg-muted/60"
        >
          <Plus className="h-3.5 w-3.5" />
          Agregar seccion
        </button>
      </section>

      {lista && (
        <ListaCotejoIaModal
          open={showIaModal}
          onOpenChange={setShowIaModal}
          listaActual={lista}
          onApplyLista={(nuevaLista) => {
            isDirtyRef.current = true
            setLista(normalizarListaCotejoTemplate({
              ...lista,
              ...nuevaLista,
              id: lista.id,
              asignatura: lista.asignatura,
              curso: lista.curso,
            }))
            toast({
              title: "Lista de cotejo actualizada",
              description: "Los indicadores generados por la IA se han cargado en el editor.",
            })
          }}
        />
      )}
    </div>
  )
}
