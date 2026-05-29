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
        })),
    }))
    .filter(seccion => seccion.indicadores.length > 0)

  return normalizarListaCotejoTemplate({
    ...lista,
    nombre: lista.nombre.trim() || "Lista de cotejo",
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

  const cursoParam = searchParams.get("curso") ?? ""
  const esEdicion = mode === "blank" && !!listaId

  // Cargar nivel mapping y cursos
  useEffect(() => {
    let cancelled = false
    const cargar = async () => {
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
          setLista(existente)
          return
        }

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
      setLista(normalizarListaCotejoTemplate({
        ...data,
        id: buildListaCotejoId(asignatura, cursoResuelto),
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
            onClick={handleGuardar}
            disabled={guardando}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-4 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
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
            className="flex w-full flex-col items-center justify-center rounded-[12px] border border-dashed border-border bg-background px-4 py-8 text-center transition-colors hover:bg-muted/40 disabled:opacity-60"
          >
            {importando ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" />}
            <span className="mt-3 text-[14px] font-bold text-foreground">Arrastra tu Word aqui</span>
            <span className="mt-1 text-[12px] text-muted-foreground">o haz clic para seleccionar un .docx con indicadores Si/No</span>
          </button>
        </div>
      )}

      <section className="rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-[14px] font-extrabold text-foreground">Informacion general</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_180px]">
          <label className="space-y-1.5">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Nombre</span>
            <input
              value={lista.nombre}
              onChange={event => updateLista(actual => ({ ...actual, nombre: event.target.value }))}
              placeholder="Ej: Lista de cotejo Unidad 2"
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
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Puntos por Si</span>
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

            <div className="mt-4 space-y-2">
              {seccion.indicadores.map((indicador, indicadorIndex) => (
                <div key={indicador.id} className="grid gap-2 rounded-[12px] border border-border bg-background p-3 md:grid-cols-[36px_1fr_36px] md:items-start">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-muted text-[12px] font-bold text-muted-foreground">
                    {indicadorIndex + 1}
                  </div>
                  <textarea
                    value={indicador.texto}
                    onChange={event => updateIndicador(seccion.id, indicador.id, actual => ({ ...actual, texto: event.target.value }))}
                    placeholder="Escribe un indicador observable..."
                    rows={2}
                    className="min-h-[70px] w-full resize-y rounded-[10px] border border-border bg-card px-3 py-2 text-[13px] outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => eliminarIndicador(seccion.id, indicador.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-border text-muted-foreground transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label="Eliminar indicador"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
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
    </div>
  )
}
