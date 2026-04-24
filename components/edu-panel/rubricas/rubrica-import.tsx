"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Upload,
  FileText,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
  ArrowLeft,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import { cargarNivelMapping, type NivelMapping } from "@/lib/nivel-mapping"
import { getUnidades } from "@/lib/curriculo"
import type { Unidad } from "@/lib/curriculo"
import {
  guardarRubrica,
  cargarRubrica,
  nuevaRubrica,
  nuevaParte,
  nuevoCriterio,
  calcularPuntajeMaximo,
  metadatosCurricularesVacios,
  resolverMetadatosCurricularesRubrica,
  cargarOAsParaRubrica,
  parseCurricularRefsInput,
  type RubricaTemplate,
  type RubricaParte,
  type CriterioRubrica,
  type RubricaCurriculoResolucion,
  type OAEditado,
} from "@/lib/rubricas"
import { RubricaOAEditor } from "./rubrica-oa-editor"

interface Props {
  mode?: "blank" | "import"
}

const NIVEL_LABELS = [
  { key: "logrado", label: "Logrado", puntos: 4, color: "text-green-600" },
  { key: "casiLogrado", label: "Casi logrado", puntos: 3, color: "text-blue-600" },
  { key: "parcialmenteLogrado", label: "Parcialmente", puntos: 2, color: "text-amber-600" },
  { key: "porLograr", label: "Por lograr", puntos: 1, color: "text-red-600" },
] as const

const CRITERIOS_GRID_TEMPLATE = "minmax(260px, 1.2fr) repeat(4, minmax(240px, 1fr)) 100px"
const CRITERIOS_MIN_WIDTH = "1360px"

function textListsEqual(a: string[], b: string[]) {
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}


export function RubricaImport({ mode = "import" }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()
  const rubricaIdParam = searchParams.get("rubricaId")

  const [cursos, setCursos] = useState<string[]>([])
  const [curso, setCurso] = useState("")
  const [rubrica, setRubrica] = useState<RubricaTemplate | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [guardadoOk, setGuardadoOk] = useState(false)
  const [error, setError] = useState("")
  const [importing, setImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [partesExpandidas, setPartesExpandidas] = useState<Set<string>>(new Set())
  const [curriculoResolucion, setCurriculoResolucion] = useState<RubricaCurriculoResolucion | null>(null)
  const [curriculoCargando, setCurriculoCargando] = useState(false)
  const [oasCargando, setOasCargando] = useState(false)
  const [oaInputs, setOaInputs] = useState<Record<string, string>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ignoreFirstSave = useRef(true)
  const curriculoRequestRef = useRef(0)
  const oasRequestRef = useRef(0)
  // Selector de unidad curricular
  const [nivelMapping, setNivelMapping] = useState<NivelMapping>({})
  const [unidadesDisponibles, setUnidadesDisponibles] = useState<Unidad[]>([])
  const [cargandoUnidades, setCargandoUnidades] = useState(false)

  const resolverCurriculo = useCallback(async (baseRubrica: RubricaTemplate) => {
    const requestId = ++curriculoRequestRef.current
    setCurriculoCargando(true)

    try {
      const resolucion = await resolverMetadatosCurricularesRubrica(baseRubrica)
      if (curriculoRequestRef.current !== requestId) {
        return baseRubrica
      }

      setCurriculoResolucion(resolucion)

      if (!resolucion.resolvedFromDatabase) {
        return baseRubrica
      }

      return {
        ...baseRubrica,
        unidadId: resolucion.unidadId ?? baseRubrica.unidadId,
        unidadNombre: resolucion.unidadNombre ?? baseRubrica.unidadNombre,
        metadatosCurriculares: resolucion.metadatosCurriculares,
      }
    } catch (curriculoError) {
      console.error(curriculoError)
      if (curriculoRequestRef.current === requestId) {
        setCurriculoResolucion({
          metadatosCurriculares: baseRubrica.metadatosCurriculares ?? metadatosCurricularesVacios(),
          unidadId: baseRubrica.unidadId,
          unidadNombre: baseRubrica.unidadNombre,
          resolvedFromDatabase: false,
        })
      }
      return baseRubrica
    } finally {
      if (curriculoRequestRef.current === requestId) {
        setCurriculoCargando(false)
      }
    }
  }, [])

  useEffect(() => {
    cargarHorarioSemanal()
      .then(horario => {
        if (!horario) return
        const unicos = Array.from(
          new Set(horario.filter(h => h.tipo === "clase").map(h => h.resumen))
        )
        setCursos(unicos)
        if (unicos.length > 0) setCurso(prev => prev || unicos[0])
      })
      .catch(console.error)
    // Cargar nivel mapping una sola vez
    cargarNivelMapping().then(setNivelMapping).catch(console.error)
  }, [])

  // Busca el nivel curricular haciendo match fuzzy cuando el nombre del curso es largo
  const resolverNivelDeCurso = useCallback((cursoNombre: string): string | null => {
    if (!cursoNombre || !nivelMapping) return null
    // 1. Exacto
    if (nivelMapping[cursoNombre]) return nivelMapping[cursoNombre]
    // 2. Prefijo: "3° Básico | Tema: ..." → buscar key "3° Básico" o "3°" en el mapping
    const keyPrefijo = Object.keys(nivelMapping).find(k =>
      cursoNombre.startsWith(k) || k.startsWith(cursoNombre)
    )
    if (keyPrefijo) return nivelMapping[keyPrefijo]
    // 3. Mismo número de grado
    const grado = cursoNombre.match(/^(\d+)\s*[°º]/)?.[1]
    if (grado) {
      const keyGrado = Object.keys(nivelMapping).find(k => k.match(/^(\d+)\s*[°º]/)?.[1] === grado)
      if (keyGrado) return nivelMapping[keyGrado]
    }
    return null
  }, [nivelMapping])

  // Cargar unidades del currículum cuando cambia el curso o la asignatura
  useEffect(() => {
    const cursoActual = rubrica?.curso ?? curso
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
  }, [rubrica?.curso, curso, asignatura, resolverNivelDeCurso])

  // Cargar OAs interactivos cuando cambia la unidad seleccionada
  useEffect(() => {
    if (!rubrica?.unidadId || !asignatura) return
    const uid  = rubrica.unidadId
    const reqId = ++oasRequestRef.current
    setOasCargando(true)
    cargarOAsParaRubrica(asignatura, rubrica.curso, uid, rubrica.oas)
      .then(oas => {
        if (oasRequestRef.current !== reqId) return
        setRubrica(prev => {
          if (!prev || prev.unidadId !== uid) return prev
          return { ...prev, oas }
        })
      })
      .catch(console.error)
      .finally(() => { if (oasRequestRef.current === reqId) setOasCargando(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rubrica?.unidadId, asignatura])

  useEffect(() => {
    if (!curso) return

    if (rubricaIdParam) {
      cargarRubrica(rubricaIdParam)
        .then(r => {
          if (!r) return
          setRubrica(r)
          setPartesExpandidas(new Set(r.partes.map(p => p.id)))
        })
        .catch(console.error)
      return
    }

    const nueva = nuevaRubrica(asignatura, curso)
    setRubrica(nueva)
    setPartesExpandidas(new Set(nueva.partes.map(p => p.id)))
  }, [curso, asignatura, rubricaIdParam])

  useEffect(() => {
    if (!rubrica) return
    setOaInputs(prev => {
      const next: Record<string, string> = {}
      rubrica.partes.forEach(parte => {
        next[parte.id] = prev[parte.id] ?? parte.oasVinculados.join(", ")
      })
      return next
    })
  }, [rubrica?.partes])

  useEffect(() => {
    if (!rubrica) return
    if (ignoreFirstSave.current) {
      ignoreFirstSave.current = false
      return
    }

    const timer = setTimeout(async () => {
      try {
        await guardarRubrica(rubrica)
        setGuardadoOk(true)
        setTimeout(() => setGuardadoOk(false), 2000)
      } catch (saveError) {
        console.error(saveError)
      }
    }, 2500)

    return () => clearTimeout(timer)
  }, [rubrica])

  useEffect(() => {
    if (!rubrica) return

    resolverCurriculo(rubrica).then(rubricaConCurriculo => {
      if (rubricaConCurriculo === rubrica) return
      setRubrica(prev => {
        if (!prev || prev.id !== rubrica.id) return prev
        const metadatosPrevios = prev.metadatosCurriculares ?? metadatosCurricularesVacios()
        const metadatosNuevos = rubricaConCurriculo.metadatosCurriculares ?? metadatosCurricularesVacios()
        const noHayCambios =
          (prev.unidadId ?? "") === (rubricaConCurriculo.unidadId ?? "") &&
          (prev.unidadNombre ?? "") === (rubricaConCurriculo.unidadNombre ?? "") &&
          textListsEqual(metadatosPrevios.objetivos, metadatosNuevos.objetivos) &&
          textListsEqual(metadatosPrevios.indicadores, metadatosNuevos.indicadores) &&
          textListsEqual(
            metadatosPrevios.objetivosTransversales,
            metadatosNuevos.objetivosTransversales
          )

        if (noHayCambios) {
          return prev
        }
        return {
          ...prev,
          unidadId: rubricaConCurriculo.unidadId,
          unidadNombre: rubricaConCurriculo.unidadNombre,
          metadatosCurriculares: metadatosNuevos,
        }
      })
    })
  }, [rubrica?.asignatura, rubrica?.curso, rubrica?.unidadNombre, resolverCurriculo])

  const procesarArchivo = useCallback(async (file: File) => {
    if (!file.name.endsWith(".docx")) {
      setError("Solo se aceptan archivos .docx")
      return
    }

    if (!rubrica) {
      setError("Todavia no hay una rubrica cargada para mezclar la importacion.")
      return
    }

    setImporting(true)
    setError("")

    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/parse-rubrica", { method: "POST", body: formData })
      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()

      // Intentar resolver el curso extraído del Word contra los cursos reales del schedule
      const cursoParsed: string = data.curso || ""
      const cursoResuelto = (() => {
        if (!cursoParsed) return rubrica.curso
        // 1. Coincidencia exacta
        if (cursos.includes(cursoParsed)) return cursoParsed
        // 2. Prefijo: "3° Básico" → "3° Básico | Tema: ..."  o viceversa
        const prefijo = cursos.find(c => c.startsWith(cursoParsed) || cursoParsed.startsWith(c))
        if (prefijo) return prefijo
        // 3. Mismo número de grado: "3° Básico" → "3°"
        const grado = cursoParsed.match(/^(\d+)\s*[°º]/)?.[1]
        if (grado) {
          const porGrado = cursos.find(c => c.match(/^(\d+)\s*[°º]/)?.[1] === grado)
          if (porGrado) return porGrado
        }
        // 4. Fallback: mantener el curso actual seleccionado
        return rubrica.curso
      })()

      const rubricaBase: RubricaTemplate = {
        ...rubrica,
        nombre: data.nombre || rubrica.nombre,
        curso: cursoResuelto,
        unidadNombre: data.unidadNombre || rubrica.unidadNombre,
        metadatosCurriculares: data.metadatosCurriculares || rubrica.metadatosCurriculares,
        partes: data.partes?.length ? data.partes : rubrica.partes,
        puntajeMaximo: calcularPuntajeMaximo(data.partes?.length ? data.partes : rubrica.partes),
        usaPonderaciones: data.usaPonderaciones ?? rubrica.usaPonderaciones,
      }

      const rubricaConCurriculo = await resolverCurriculo(rubricaBase)
      setRubrica(rubricaConCurriculo)

      if (data.partes?.length) {
        setPartesExpandidas(new Set(data.partes.map((parte: RubricaParte) => parte.id)))
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Error al leer el archivo")
    } finally {
      setImporting(false)
    }
  }, [resolverCurriculo, rubrica])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) procesarArchivo(file)
  }, [procesarArchivo])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  const updateRubrica = (fn: (current: RubricaTemplate) => RubricaTemplate) => {
    setRubrica(prev => (prev ? fn(prev) : prev))
  }

  const agregarParte = () => {
    updateRubrica(current => {
      const parteNueva = nuevaParte(current.partes.length + 1)
      setPartesExpandidas(prev => new Set([...prev, parteNueva.id]))
      setOaInputs(prev => ({ ...prev, [parteNueva.id]: "" }))
      const partes = [...current.partes, parteNueva]
      return {
        ...current,
        partes,
        puntajeMaximo: calcularPuntajeMaximo(partes),
      }
    })
  }

  const eliminarParte = (parteId: string) => {
    updateRubrica(current => {
      const partes = current.partes.filter(parte => parte.id !== parteId)
      setPartesExpandidas(prev => {
        const next = new Set(prev)
        next.delete(parteId)
        return next
      })
      setOaInputs(prev => {
        const next = { ...prev }
        delete next[parteId]
        return next
      })
      return {
        ...current,
        partes,
        puntajeMaximo: calcularPuntajeMaximo(partes),
      }
    })
  }

  const updateParte = (parteId: string, fn: (parte: RubricaParte) => RubricaParte) => {
    updateRubrica(current => ({
      ...current,
      partes: current.partes.map(parte => (parte.id === parteId ? fn(parte) : parte)),
    }))
  }

  const agregarCriterio = (parteId: string) => {
    updateRubrica(current => {
      const partes = current.partes.map(parte => {
        if (parte.id !== parteId) return parte
        return {
          ...parte,
          criterios: [...parte.criterios, nuevoCriterio()],
        }
      })

      return {
        ...current,
        partes,
        puntajeMaximo: calcularPuntajeMaximo(partes),
      }
    })
  }

  const eliminarCriterio = (parteId: string, criterioId: string) => {
    updateRubrica(current => {
      const partes = current.partes.map(parte => {
        if (parte.id !== parteId) return parte
        return {
          ...parte,
          criterios: parte.criterios.filter(criterio => criterio.id !== criterioId),
        }
      })

      return {
        ...current,
        partes,
        puntajeMaximo: calcularPuntajeMaximo(partes),
      }
    })
  }

  const moverCriterio = (parteOrigenId: string, criterioId: string, parteDestinoId: string) => {
    updateRubrica(current => {
      const origen = current.partes.find(p => p.id === parteOrigenId)
      const criterio = origen?.criterios.find(c => c.id === criterioId)
      if (!criterio || !origen) return current
      const partes = current.partes.map(p => {
        if (p.id === parteOrigenId) return { ...p, criterios: p.criterios.filter(c => c.id !== criterioId) }
        if (p.id === parteDestinoId) return { ...p, criterios: [...p.criterios, criterio] }
        return p
      })
      return { ...current, partes, puntajeMaximo: calcularPuntajeMaximo(partes) }
    })
  }

  const updateCriterio = (
    parteId: string,
    criterioId: string,
    fn: (criterio: CriterioRubrica) => CriterioRubrica
  ) => {
    updateParte(parteId, parte => ({
      ...parte,
      criterios: parte.criterios.map(criterio => (criterio.id === criterioId ? fn(criterio) : criterio)),
    }))
  }

  const normalizarOaParte = (parteId: string) => {
    const currentValue = oaInputs[parteId] ?? ""
    const parsed = parseCurricularRefsInput(currentValue)
    updateParte(parteId, parte => ({
      ...parte,
      oasVinculados: parsed,
    }))
    setOaInputs(prev => ({
      ...prev,
      [parteId]: parsed.join(", "),
    }))
  }

  const handleGuardar = async () => {
    if (!rubrica) return
    setGuardando(true)
    setError("")

    try {
      await guardarRubrica(rubrica)
      router.push(buildUrl("/rubricas", withAsignatura({}, asignatura)))
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Error al guardar")
    } finally {
      setGuardando(false)
    }
  }

  const toggleParte = (id: string) => {
    setPartesExpandidas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (!rubrica) {
    return (
      <div className="flex h-40 items-center justify-center text-[13px] text-muted-foreground">
        Cargando...
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push(buildUrl("/rubricas", withAsignatura({}, asignatura)))}
          className="rounded-[10px] p-2 transition-colors hover:bg-muted/60"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex-1">
          <h1 className="text-[20px] font-extrabold text-foreground">
            {rubricaIdParam ? "Editar rubrica" : mode === "blank" ? "Nueva rubrica" : "Importar desde Word"}
          </h1>
          <p className="text-[12px] text-muted-foreground">
            {guardadoOk ? "Guardado" : "Los cambios se guardan automaticamente"}
          </p>
        </div>

        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar y salir
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-4 rounded-[14px] border border-border bg-card p-5">
        <h2 className="text-[14px] font-bold text-foreground">Informacion general</h2>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <label className="text-[12px] font-semibold text-muted-foreground">Nombre de la rubrica</label>
            <input
              type="text"
              value={rubrica.nombre}
              onChange={e => updateRubrica(current => ({ ...current, nombre: e.target.value }))}
              placeholder="Ej: Rubrica Unidad 2 - Flauta"
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-semibold text-muted-foreground">Curso</label>
            <select
              value={rubrica.curso}
              onChange={e => updateRubrica(current => ({ ...current, curso: e.target.value }))}
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground"
            >
              {cursos.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {!cursos.includes(rubrica.curso) && rubrica.curso && (
                <option value={rubrica.curso}>{rubrica.curso}</option>
              )}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[12px] font-semibold text-muted-foreground">
              Unidad curricular
              {cargandoUnidades && <Loader2 className="ml-1 inline h-3 w-3 animate-spin" />}
            </label>
            {unidadesDisponibles.length > 0 ? (
              <select
                value={rubrica.unidadNombre || ""}
                onChange={e => {
                  const unidadSel = unidadesDisponibles.find(u => (u.nombre_unidad || "") === e.target.value)
                  updateRubrica(current => ({
                    ...current,
                    unidadNombre: e.target.value || undefined,
                    unidadId: unidadSel?.id || undefined,
                    oas: undefined,  // limpiar OAs para recargar los de la nueva unidad
                  }))
                }}
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground"
              >
                <option value="">— Seleccionar unidad —</option>
                {unidadesDisponibles.map(u => (
                  <option key={u.id} value={u.nombre_unidad || u.id}>
                    {u.numero_unidad ? `Unidad ${u.numero_unidad}: ` : ""}{u.nombre_unidad || u.id}
                  </option>
                ))}
              </select>
            ) : (
              <div className="min-h-[42px] rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground">
                {cargandoUnidades
                  ? "Cargando unidades..."
                  : nivelMapping[rubrica.curso]
                    ? "Sin unidades en la base curricular para este nivel"
                    : `Configura el nivel curricular de "${rubrica.curso}" en Mi Perfil`}
              </div>
            )}
            {rubrica.unidadNombre && (
              <p className="text-[11px] text-muted-foreground">
                Seleccionada: <span className="font-medium text-foreground">{rubrica.unidadNombre}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-muted/30 px-3 py-2 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground">{calcularPuntajeMaximo(rubrica.partes)} pts max.</span>
          <span>-</span>
          <span>{rubrica.partes.length} partes</span>
          <span>-</span>
          <span>{rubrica.partes.reduce((acc, parte) => acc + parte.criterios.length, 0)} criterios</span>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={rubrica.usaPonderaciones ?? false}
            onChange={e => {
              const activo = e.target.checked
              updateRubrica(current => ({
                ...current,
                usaPonderaciones: activo,
                // Al desactivar, limpiar ponderaciones de todos los criterios
                partes: activo
                  ? current.partes
                  : current.partes.map(p => ({
                      ...p,
                      criterios: p.criterios.map(c => {
                        const { ponderacion: _p, ...rest } = c
                        return rest
                      }),
                    })),
              }))
            }}
            className="h-4 w-4 rounded accent-purple-600"
          />
          <span className="text-[13px] font-medium text-foreground">
            Usar ponderaciones por criterio
          </span>
          {rubrica.usaPonderaciones && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-700">
              Activo
            </span>
          )}
        </label>
      </div>

      <div className="space-y-4 rounded-[14px] border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-foreground">Objetivos e indicadores</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {oasCargando
                ? "Cargando OA desde la base curricular..."
                : rubrica.unidadId
                  ? "Haz clic en los puntos para seleccionar/deseleccionar OA e indicadores."
                  : "Selecciona una unidad para cargar los OA automáticamente, o agrega uno propio."}
            </p>
          </div>
          {curriculoCargando && (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        <RubricaOAEditor
          oas={rubrica.oas ?? []}
          onChange={(oas: OAEditado[]) => updateRubrica(current => ({ ...current, oas }))}
          asignatura={rubrica.asignatura || asignatura}
          cargando={oasCargando}
        />
      </div>

      {mode === "import" && !rubricaIdParam && (
        <div
          onDragOver={e => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`cursor-pointer rounded-[14px] border-2 border-dashed p-8 text-center transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/50 hover:bg-muted/20"
          }`}
        >
          <input ref={fileInputRef} type="file" accept=".docx" className="hidden" onChange={handleFileChange} />

          {importing ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-[13px] text-muted-foreground">Leyendo el Word...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                {isDragging ? <FileText className="h-6 w-6 text-primary" /> : <Upload className="h-6 w-6 text-primary" />}
              </div>
              <p className="text-[14px] font-semibold text-foreground">
                {isDragging ? "Suelta el archivo aqui" : "Arrastra tu Word aqui"}
              </p>
              <p className="text-[12px] text-muted-foreground">o haz clic para seleccionar - solo .docx</p>
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[14px] font-bold text-foreground">Partes y criterios</h2>
            <p className="text-[12px] text-muted-foreground">
              Cada fila se puede borrar desde el boton rojo de la derecha y la tabla ahora se desplaza completa.
            </p>
          </div>

          <button
            onClick={agregarParte}
            className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-1.5 text-[12px] font-medium transition-colors hover:bg-muted/60"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar parte
          </button>
        </div>

        {rubrica.partes.map((parte, index) => (
          <div key={parte.id} className="overflow-hidden rounded-[14px] border border-border bg-card">
            <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 xl:flex-row xl:items-center">
              <button onClick={() => toggleParte(parte.id)} className="flex flex-1 items-center gap-2 text-left">
                {partesExpandidas.has(parte.id) ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <input
                  type="text"
                  value={parte.nombre}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateParte(parte.id, current => ({ ...current, nombre: e.target.value }))}
                  placeholder={`Parte ${index + 1}`}
                  className="flex-1 border-none bg-transparent text-[13px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
                />
              </button>

              <div className="flex flex-col gap-1 xl:w-[22rem]">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  OA/OAA vinculados
                </label>
                <input
                  type="text"
                  value={oaInputs[parte.id] ?? parte.oasVinculados.join(", ")}
                  onChange={e => setOaInputs(prev => ({ ...prev, [parte.id]: e.target.value }))}
                  onBlur={() => normalizarOaParte(parte.id)}
                  placeholder="Ej: OA 2, OA 4 / OA 2 - OA 4"
                  className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
                />
              </div>

              <button
                onClick={() => eliminarParte(parte.id)}
                title="Eliminar parte"
                className="flex h-9 w-9 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {partesExpandidas.has(parte.id) && (
              <div className="space-y-3 p-4">
                {(() => {
                  const gridTemplate = rubrica.usaPonderaciones
                    ? "minmax(260px, 1.2fr) repeat(4, minmax(240px, 1fr)) 80px 100px"
                    : CRITERIOS_GRID_TEMPLATE
                  const minWidth = rubrica.usaPonderaciones ? "1460px" : CRITERIOS_MIN_WIDTH
                  return (
                <>
                <div className="overflow-x-auto pb-2">
                  <div
                    className="grid gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    style={{ gridTemplateColumns: gridTemplate, minWidth }}
                  >
                    <span>Criterio</span>
                    {NIVEL_LABELS.map(nivel => (
                      <span key={nivel.key} className={nivel.color}>
                        {nivel.label} ({nivel.puntos})
                      </span>
                    ))}
                    {rubrica.usaPonderaciones && (
                      <span className="text-purple-600">Pond.</span>
                    )}
                    <span className="text-right">Mover / Borrar</span>
                  </div>
                </div>

                <div className="space-y-3 overflow-x-auto pb-2">
                  {parte.criterios.map(criterio => (
                    <div
                      key={criterio.id}
                      className="grid gap-2 rounded-[10px] border border-border p-2"
                      style={{ gridTemplateColumns: gridTemplate, minWidth }}
                    >
                      <textarea
                        value={criterio.nombre}
                        onChange={e => updateCriterio(parte.id, criterio.id, current => ({ ...current, nombre: e.target.value }))}
                        placeholder="Nombre del criterio"
                        rows={3}
                        className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                      />

                      {NIVEL_LABELS.map(nivel => (
                        <textarea
                          key={nivel.key}
                          value={criterio.niveles[nivel.key].descripcion}
                          onChange={e =>
                            updateCriterio(parte.id, criterio.id, current => ({
                              ...current,
                              niveles: {
                                ...current.niveles,
                                [nivel.key]: {
                                  ...current.niveles[nivel.key],
                                  descripcion: e.target.value,
                                },
                              },
                            }))
                          }
                          placeholder="Descripcion del nivel..."
                          rows={4}
                          className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
                        />
                      ))}

                      {rubrica.usaPonderaciones && (
                        <div className="flex flex-col items-center gap-1 pt-1">
                          <input
                            type="number"
                            step="0.5"
                            min="1"
                            max="5"
                            value={criterio.ponderacion ?? 1}
                            onChange={e => {
                              const val = parseFloat(e.target.value)
                              updateCriterio(parte.id, criterio.id, current => ({
                                ...current,
                                ponderacion: isFinite(val) && val > 0 ? val : undefined,
                              }))
                              updateRubrica(current => ({
                                ...current,
                                puntajeMaximo: calcularPuntajeMaximo(current.partes),
                              }))
                            }}
                            className="w-16 rounded-[8px] border border-purple-200 bg-purple-50 px-1.5 py-1 text-center text-[13px] font-bold text-purple-700 focus:outline-none focus:ring-1 focus:ring-purple-400"
                          />
                          <span className="text-[10px] text-muted-foreground">
                            = {4 * (criterio.ponderacion ?? 1)} pts
                          </span>
                        </div>
                      )}

                      <div className="flex flex-col items-center gap-1.5 pt-1">
                        {rubrica.partes.length > 1 && (
                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value) moverCriterio(parte.id, criterio.id, e.target.value)
                            }}
                            title="Mover criterio a otra parte"
                            className="w-full rounded-[6px] border border-border bg-background px-1 py-1 text-[10px] text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30"
                          >
                            <option value="">Mover a...</option>
                            {rubrica.partes
                              .filter(p => p.id !== parte.id)
                              .map((p, pi) => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre || `Parte ${pi + 1}`}
                                </option>
                              ))}
                          </select>
                        )}
                        <button
                          onClick={() => eliminarCriterio(parte.id, criterio.id)}
                          title="Eliminar criterio"
                          className="flex h-9 w-9 items-center justify-center rounded-[8px] border border-red-200 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => agregarCriterio(parte.id)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Agregar criterio
                </button>
                </>
                  )
                })()}
              </div>
            )}
          </div>
        ))}

        {rubrica.partes.length === 0 && (
          <div className="py-6 text-center text-[13px] text-muted-foreground">
            No hay partes aun.{" "}
            <button onClick={agregarParte} className="text-primary hover:underline">
              Agregar la primera
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
