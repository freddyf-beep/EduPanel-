"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Upload, LayoutList, FileArchive, Loader2, AlertCircle, Save, X, CheckCircle2 } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import {
  buildRubricaId,
  cargarRubricas,
  guardarRubrica,
  guardarEvaluacion,
  resolverMetadatosCurricularesRubrica,
  type RubricaTemplate,
  type EvaluacionRubrica,
} from "@/lib/rubricas"
import { guardarEstudiantes, cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { RubricaCard } from "./rubrica-card"

interface ImportZipPreview {
  fileName: string
  cursoDetectado: string
  rubrica: RubricaTemplate
  evaluacion: EvaluacionRubrica
  estudiantesDetectados: Estudiante[]
  estudiantesNuevos: Estudiante[]
  estudiantesExistentes: Estudiante[]
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("es")
}

function extraerGrado(value: string): string | null {
  const match = value.match(/(\d+)/)
  return match?.[1] ?? null
}

function resolverCursoImportado(cursoImportado: string, cursosDisponibles: string[], cursoActual: string): string {
  const parsed = cursoImportado.trim()
  if (!parsed) return cursoActual
  if (cursosDisponibles.includes(parsed)) return parsed

  const porPrefijo = cursosDisponibles.find(curso =>
    curso.startsWith(parsed) || parsed.startsWith(curso)
  )
  if (porPrefijo) return porPrefijo

  const gradoImportado = extraerGrado(parsed)
  if (gradoImportado) {
    const porGrado = cursosDisponibles.find(curso => extraerGrado(curso) === gradoImportado)
    if (porGrado) return porGrado
  }

  return cursoActual || parsed
}

function normalizarEstudiantesDetectados(value: unknown): Estudiante[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()
  const estudiantes: Estudiante[] = []

  value.forEach((item, index) => {
    const raw = item as Partial<Estudiante>
    const nombre = typeof raw.nombre === "string" ? raw.nombre.trim() : ""
    const id = typeof raw.id === "string" && raw.id.trim()
      ? raw.id.trim()
      : `est_importado_${index + 1}`
    if (!nombre || seen.has(id)) return
    seen.add(id)
    estudiantes.push({
      id,
      nombre,
      orden: index + 1,
      pie: raw.pie ?? false,
    })
  })

  return estudiantes
}

function reconciliarEvaluacionConPerfil(
  evaluacion: EvaluacionRubrica,
  estudiantesDetectados: Estudiante[],
  existentes: Estudiante[]
): { evaluacion: EvaluacionRubrica; estudiantesNuevos: Estudiante[]; estudiantesExistentes: Estudiante[] } {
  const existentesPorNombre = new Map(existentes.map(est => [normalizeName(est.nombre), est]))
  const nuevos: Estudiante[] = []
  const yaExistentes: Estudiante[] = []
  const idMap = new Map<string, string>()
  const estudianteFinalPorIdOriginal = new Map<string, Estudiante>()

  estudiantesDetectados.forEach((est, index) => {
    const existente = existentesPorNombre.get(normalizeName(est.nombre))
    if (existente) {
      idMap.set(est.id, existente.id)
      estudianteFinalPorIdOriginal.set(est.id, existente)
      yaExistentes.push(existente)
      return
    }

    const nuevo = {
      ...est,
      orden: existentes.length + nuevos.length + index + 1,
    }
    idMap.set(est.id, nuevo.id)
    estudianteFinalPorIdOriginal.set(est.id, nuevo)
    nuevos.push(nuevo)
  })

  return {
    estudiantesNuevos: nuevos,
    estudiantesExistentes: yaExistentes,
    evaluacion: {
      ...evaluacion,
      grupos: evaluacion.grupos.map(grupo => ({
        ...grupo,
        estudiantes: grupo.estudiantes.map(est => ({
          ...est,
          estudianteId: idMap.get(est.estudianteId) ?? est.estudianteId,
          hasPie: estudianteFinalPorIdOriginal.get(est.estudianteId)?.pie ?? est.hasPie,
        })),
      })),
    },
  }
}

export function RubricasHub() {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const [cursos, setCursos] = useState<string[]>([])
  const [curso, setCurso] = useState("")
  const [rubricas, setRubricas] = useState<RubricaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [importandoZip, setImportandoZip] = useState(false)
  const [guardandoZip, setGuardandoZip] = useState(false)
  const [errorImport, setErrorImport] = useState("")
  const [zipPreview, setZipPreview] = useState<ImportZipPreview | null>(null)
  const [duplicarRubrica, setDuplicarRubrica] = useState<RubricaTemplate | null>(null)
  const [duplicarCurso, setDuplicarCurso] = useState("")
  const [duplicando, setDuplicando] = useState(false)
  const zipInputRef = useRef<HTMLInputElement>(null)

  // Cargar cursos del horario
  useEffect(() => {
    cargarHorarioSemanal()
      .then(horario => {
        if (!horario) return
        const unicos = Array.from(
          new Set(horario.filter(h => h.tipo === "clase").map(h => h.resumen))
        )
        setCursos(unicos)
        if (unicos.length > 0) setCurso(unicos[0])
      })
      .catch(console.error)
  }, [])

  // Cargar rúbricas cuando cambia curso o asignatura
  useEffect(() => {
    if (!curso) return
    setLoading(true)
    cargarRubricas(asignatura, curso)
      .then(setRubricas)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [asignatura, curso])

  const irA = (view: string, extra?: Record<string, string>) =>
    router.push(buildUrl("/rubricas", withAsignatura({ view, ...extra }, asignatura)))

  const handleEliminar = (id: string) => {
    setRubricas(prev => prev.filter(r => r.id !== id))
  }

  const abrirDuplicar = (rubrica: RubricaTemplate) => {
    const cursoSugerido = cursos.find(c => c !== rubrica.curso) ?? (rubrica.curso || curso)
    setDuplicarRubrica(rubrica)
    setDuplicarCurso(cursoSugerido)
    setErrorImport("")
  }

  const cerrarDuplicar = () => {
    if (duplicando) return
    setDuplicarRubrica(null)
    setDuplicarCurso("")
  }

  const handleDuplicar = async () => {
    if (!duplicarRubrica || !duplicarCurso) return
    setDuplicando(true)
    setErrorImport("")

    try {
      const copiaBase = JSON.parse(JSON.stringify(duplicarRubrica)) as RubricaTemplate
      const nombreBase = copiaBase.nombre?.trim() || "Rubrica"
      const copia: RubricaTemplate = {
        ...copiaBase,
        id: buildRubricaId(copiaBase.asignatura, duplicarCurso, nombreBase),
        nombre: nombreBase.endsWith("(copia)") ? nombreBase : `${nombreBase} (copia)`,
        curso: duplicarCurso,
        createdAt: undefined,
        updatedAt: undefined,
      }

      await guardarRubrica(copia)

      if (duplicarCurso === curso) {
        setRubricas(prev => [copia, ...prev.filter(r => r.id !== copia.id)])
      }

      setDuplicarRubrica(null)
      setDuplicarCurso("")
    } catch (err) {
      setErrorImport(err instanceof Error ? err.message : "Error al duplicar rubrica")
    } finally {
      setDuplicando(false)
    }
  }

  const handleImportarZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportandoZip(true)
    setErrorImport("")
    setZipPreview(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/import-rubrica", { method: "POST", body: formData })
      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()
      const rubricaImportada = data.rubrica as RubricaTemplate
      const cursoResuelto = resolverCursoImportado(rubricaImportada.curso || "", cursos, curso)
      const rubricaConCursoReal: RubricaTemplate = {
        ...rubricaImportada,
        curso: cursoResuelto,
      }
      const resolucionCurricular = await resolverMetadatosCurricularesRubrica(rubricaConCursoReal)
      const rubricaFinal: RubricaTemplate = {
        ...rubricaConCursoReal,
        unidadId: resolucionCurricular.unidadId ?? rubricaConCursoReal.unidadId,
        unidadNombre: resolucionCurricular.unidadNombre ?? rubricaConCursoReal.unidadNombre,
        metadatosCurriculares: resolucionCurricular.metadatosCurriculares,
      }
      const evaluacionFinal: EvaluacionRubrica = {
        ...(data.evaluacion as EvaluacionRubrica),
        rubricaNombre: rubricaFinal.nombre,
        asignatura: rubricaFinal.asignatura,
        curso: cursoResuelto,
      }

      const estudiantesDetectados = normalizarEstudiantesDetectados(data.estudiantesDetectados)
      const existentes = rubricaFinal.curso ? await cargarEstudiantes(rubricaFinal.curso) : []
      const reconciliado = reconciliarEvaluacionConPerfil(evaluacionFinal, estudiantesDetectados, existentes)

      setZipPreview({
        fileName: file.name,
        cursoDetectado: rubricaImportada.curso || "",
        rubrica: rubricaFinal,
        evaluacion: reconciliado.evaluacion,
        estudiantesDetectados,
        estudiantesNuevos: reconciliado.estudiantesNuevos,
        estudiantesExistentes: reconciliado.estudiantesExistentes,
      })
      if (rubricaFinal.curso) setCurso(rubricaFinal.curso)
    } catch (err) {
      setErrorImport(err instanceof Error ? err.message : "Error al importar ZIP")
    } finally {
      setImportandoZip(false)
      if (zipInputRef.current) zipInputRef.current.value = ""
    }
  }

  const guardarImportacionZip = async () => {
    if (!zipPreview) return
    setGuardandoZip(true)
    setErrorImport("")

    try {
      await guardarRubrica(zipPreview.rubrica)
      await guardarEvaluacion(zipPreview.evaluacion)

      if (zipPreview.estudiantesNuevos.length > 0 && zipPreview.rubrica.curso) {
        const existentes = await cargarEstudiantes(zipPreview.rubrica.curso)
        const existentesNombres = new Set(existentes.map(est => normalizeName(est.nombre)))
        const nuevos = zipPreview.estudiantesNuevos.filter(
          estudiante => !existentesNombres.has(normalizeName(estudiante.nombre))
        )
        if (nuevos.length > 0) {
          await guardarEstudiantes(zipPreview.rubrica.curso, [...existentes, ...nuevos])
        }
      }

      setZipPreview(null)
      setRubricas(prev => {
        const withoutDuplicated = prev.filter(r => r.id !== zipPreview.rubrica.id)
        return [zipPreview.rubrica, ...withoutDuplicated]
      })
      router.push(
        buildUrl(
          "/rubricas",
          withAsignatura({ view: "resultados", rubricaId: zipPreview.rubrica.id }, asignatura)
        )
      )
    } catch (err) {
      setErrorImport(err instanceof Error ? err.message : "Error al guardar importacion")
    } finally {
      setGuardandoZip(false)
    }
  }

  const cursosDestino = cursos.length > 0
    ? cursos
    : [curso || duplicarRubrica?.curso || ""].filter(Boolean)

  return (
    <div className="space-y-6">
      <Dialog open={!!duplicarRubrica} onOpenChange={open => { if (!open) cerrarDuplicar() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar rubrica</DialogTitle>
            <DialogDescription>
              Elige el curso donde se guardara una copia independiente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Curso destino
            </label>
            <select
              value={duplicarCurso}
              onChange={e => setDuplicarCurso(e.target.value)}
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            >
              {cursosDestino.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <button
              onClick={cerrarDuplicar}
              disabled={duplicando}
              className="rounded-[10px] border border-border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              onClick={handleDuplicar}
              disabled={!duplicarCurso || duplicando}
              className="flex items-center justify-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {duplicando ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Duplicar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input ref={zipInputRef} type="file" accept=".zip" className="hidden" onChange={handleImportarZip} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-extrabold text-foreground">
            <LayoutList className="h-6 w-6 text-primary" />
            Rúbricas de Evaluación
          </h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Crea rúbricas, evalúa por grupos, importa ZIP y exporta a Word
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => zipInputRef.current?.click()}
            disabled={importandoZip}
            className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {importandoZip ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
            {importandoZip ? "Importando..." : "Importar ZIP"}
          </button>

          <button
            onClick={() => irA("import")}
            className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[13px] font-medium transition-colors hover:bg-muted/60"
          >
            <Upload className="h-4 w-4" />
            Importar Word
          </button>

          <button
            onClick={() => irA("crear")}
            className="flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Nueva rúbrica
          </button>
        </div>
      </div>

      {errorImport && (
        <div className="flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errorImport}
          <button
            onClick={() => setErrorImport("")}
            className="ml-auto text-red-400 transition-colors hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}

      {zipPreview && (
        <div className="rounded-[14px] border border-primary/20 bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2 text-[12px] font-semibold text-primary">
                <CheckCircle2 className="h-4 w-4" />
                ZIP detectado correctamente
              </div>
              <h2 className="truncate text-[17px] font-extrabold text-foreground">
                {zipPreview.rubrica.nombre || zipPreview.fileName}
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {zipPreview.rubrica.curso || "Curso sin detectar"} · {zipPreview.evaluacion.grupos.length} grupos · {zipPreview.estudiantesDetectados.length} estudiantes
              </p>
              {zipPreview.cursoDetectado && zipPreview.cursoDetectado !== zipPreview.rubrica.curso && (
                <p className="mt-1 text-[11px] text-amber-600">
                  Detectado como {zipPreview.cursoDetectado}; se guardara en {zipPreview.rubrica.curso}.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setZipPreview(null)}
                disabled={guardandoZip}
                className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
              <button
                onClick={guardarImportacionZip}
                disabled={guardandoZip}
                className="flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {guardandoZip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Guardar importacion
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[10px] border border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rubrica</p>
              <p className="mt-1 text-[13px] font-bold text-foreground">{zipPreview.rubrica.partes.length} partes</p>
              <p className="text-[11px] text-muted-foreground">{zipPreview.rubrica.puntajeMaximo} pts max.</p>
            </div>
            <div className="rounded-[10px] border border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Alumnos nuevos</p>
              <p className="mt-1 text-[13px] font-bold text-foreground">{zipPreview.estudiantesNuevos.length}</p>
              <p className="text-[11px] text-muted-foreground">Se agregaran a Mi Perfil</p>
            </div>
            <div className="rounded-[10px] border border-border bg-muted/20 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ya existentes</p>
              <p className="mt-1 text-[13px] font-bold text-foreground">{zipPreview.estudiantesExistentes.length}</p>
              <p className="text-[11px] text-muted-foreground">Se vinculan por nombre</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-[10px] border border-border">
              <div className="border-b border-border px-3 py-2 text-[12px] font-bold text-foreground">
                Grupos detectados
              </div>
              <div className="max-h-44 overflow-y-auto p-2">
                {zipPreview.evaluacion.grupos.map(grupo => (
                  <div key={grupo.id} className="flex items-center justify-between rounded-[8px] px-2 py-1.5 text-[12px] hover:bg-muted/40">
                    <span className="font-medium text-foreground">{grupo.nombre}</span>
                    <span className="text-muted-foreground">{grupo.estudiantes.length} estudiantes</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[10px] border border-border">
              <div className="border-b border-border px-3 py-2 text-[12px] font-bold text-foreground">
                Alumnos nuevos para Mi Perfil
              </div>
              <div className="max-h-44 overflow-y-auto p-2">
                {zipPreview.estudiantesNuevos.length > 0 ? (
                  zipPreview.estudiantesNuevos.map(estudiante => (
                    <div key={estudiante.id} className="rounded-[8px] px-2 py-1.5 text-[12px] text-foreground hover:bg-muted/40">
                      {estudiante.nombre}
                    </div>
                  ))
                ) : (
                  <p className="px-2 py-4 text-center text-[12px] text-muted-foreground">
                    No hay alumnos nuevos. Se usaran los que ya existen en Mi Perfil.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {cursos.length > 1 && (
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Curso
            </label>
            <select
              value={curso}
              onChange={e => setCurso(e.target.value)}
              className="rounded-[10px] border border-border bg-background px-3 py-1.5 text-[13px] text-foreground"
            >
              {cursos.map(c => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-[13px] text-muted-foreground">
          Cargando rúbricas...
        </div>
      ) : rubricas.length === 0 ? (
        <div className="space-y-3 rounded-[14px] border border-border bg-card p-10 text-center">
          <LayoutList className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="text-[14px] font-medium text-foreground">Sin rúbricas aún</p>
          <p className="text-[13px] text-muted-foreground">
            Crea una rúbrica desde cero o importa un Word existente
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            <button
              onClick={() => irA("import")}
              className="flex items-center gap-1.5 rounded-[10px] border border-border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-muted/60"
            >
              <Upload className="h-4 w-4" />
              Importar Word
            </button>
            <button
              onClick={() => irA("crear")}
              className="flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nueva rúbrica
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rubricas.map(rubrica => (
            <RubricaCard
              key={rubrica.id}
              rubrica={rubrica}
              asignatura={asignatura}
              onEliminar={handleEliminar}
              onDuplicar={abrirDuplicar}
            />
          ))}
        </div>
      )}
    </div>
  )
}
