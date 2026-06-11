"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, CheckCircle2, CheckSquare, Copy, FileArchive, Loader2, Plus, Save, Upload, X } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import {
  buildListaCotejoId,
  cargarListasCotejo,
  guardarEvaluacionLista,
  guardarListaCotejo,
  type ListaCotejoEvaluacion,
  type ListaCotejoTemplate,
} from "@/lib/listas-cotejo"
import { guardarEstudiantes, cargarEstudiantes, type Estudiante } from "@/lib/estudiantes"
import { apiFetch } from "@/lib/api-client"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ListaCotejoCard } from "./lista-cotejo-card"

interface ImportZipPreview {
  fileName: string
  cursoDetectado: string
  lista: ListaCotejoTemplate
  evaluacion: ListaCotejoEvaluacion
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
      : `est_lista_importado_${index + 1}`
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
  evaluacion: ListaCotejoEvaluacion,
  estudiantesDetectados: Estudiante[],
  existentes: Estudiante[]
): { evaluacion: ListaCotejoEvaluacion; estudiantesNuevos: Estudiante[]; estudiantesExistentes: Estudiante[] } {
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
          nombre: estudianteFinalPorIdOriginal.get(est.estudianteId)?.nombre ?? est.nombre,
          hasPie: estudianteFinalPorIdOriginal.get(est.estudianteId)?.pie ?? est.hasPie,
        })),
      })),
    },
  }
}

export function ListasCotejoHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()
  const [cursos, setCursos] = useState<string[]>([])
  const [curso, setCurso] = useState(searchParams.get("curso") ?? "")
  const [listas, setListas] = useState<ListaCotejoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [importandoZip, setImportandoZip] = useState(false)
  const [guardandoZip, setGuardandoZip] = useState(false)
  const [zipPreview, setZipPreview] = useState<ImportZipPreview | null>(null)
  const [duplicarLista, setDuplicarLista] = useState<ListaCotejoTemplate | null>(null)
  const [duplicarCurso, setDuplicarCurso] = useState("")
  const [duplicando, setDuplicando] = useState(false)
  const [error, setError] = useState("")
  const zipInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    cargarHorarioSemanal()
      .then(horario => {
        const unicos = Array.from(
          new Set(horario.filter(h => h.tipo === "clase").map(h => h.resumen).filter(Boolean))
        )
        setCursos(unicos)
        setCurso(prev => prev || unicos[0] || "")
      })
      .catch(err => setError(err instanceof Error ? err.message : "Error al cargar cursos"))
  }, [])

  useEffect(() => {
    if (!curso) {
      setListas([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")
    cargarListasCotejo(asignatura, curso)
      .then(setListas)
      .catch(err => setError(err instanceof Error ? err.message : "Error al cargar listas"))
      .finally(() => setLoading(false))
  }, [asignatura, curso])

  const irA = (view: string, extra?: Record<string, string>) => {
    router.push(buildUrl("/evaluaciones", withAsignatura({ tab: "listas", view, curso, ...extra }, asignatura)))
  }

  const abrirDuplicar = (lista: ListaCotejoTemplate) => {
    const cursoSugerido = cursos.find(c => c !== lista.curso) ?? (lista.curso || curso)
    setDuplicarLista(lista)
    setDuplicarCurso(cursoSugerido)
    setError("")
  }

  const cerrarDuplicar = () => {
    if (duplicando) return
    setDuplicarLista(null)
    setDuplicarCurso("")
  }

  const handleDuplicar = async () => {
    if (!duplicarLista || !duplicarCurso) return
    setDuplicando(true)
    setError("")
    try {
      const copiaBase = JSON.parse(JSON.stringify(duplicarLista)) as ListaCotejoTemplate
      const copia: ListaCotejoTemplate = {
        ...copiaBase,
        id: buildListaCotejoId(copiaBase.asignatura, duplicarCurso),
        nombre: copiaBase.nombre.endsWith("(copia)") ? copiaBase.nombre : `${copiaBase.nombre || "Lista de cotejo"} (copia)`,
        curso: duplicarCurso,
        createdAt: undefined,
        updatedAt: undefined,
      }
      await guardarListaCotejo(copia)
      if (duplicarCurso === curso) {
        setListas(prev => [copia, ...prev.filter(item => item.id !== copia.id)])
      }
      setDuplicarLista(null)
      setDuplicarCurso("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al duplicar lista")
    } finally {
      setDuplicando(false)
    }
  }

  const handleImportarZip = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setImportandoZip(true)
    setError("")
    setZipPreview(null)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await apiFetch("/api/import-lista-cotejo", { method: "POST", body: formData })
      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()
      const listaImportada = data.lista as ListaCotejoTemplate
      const cursoResuelto = resolverCursoImportado(listaImportada.curso || "", cursos, curso)
      const listaFinal: ListaCotejoTemplate = {
        ...listaImportada,
        curso: cursoResuelto,
      }
      const evaluacionFinal: ListaCotejoEvaluacion = {
        ...(data.evaluacion as ListaCotejoEvaluacion),
        listaNombre: listaFinal.nombre,
        asignatura: listaFinal.asignatura,
        curso: cursoResuelto,
      }

      const estudiantesDetectados = normalizarEstudiantesDetectados(data.estudiantesDetectados)
      const existentes = listaFinal.curso ? await cargarEstudiantes(listaFinal.curso) : []
      const reconciliado = reconciliarEvaluacionConPerfil(evaluacionFinal, estudiantesDetectados, existentes)

      setZipPreview({
        fileName: file.name,
        cursoDetectado: listaImportada.curso || "",
        lista: listaFinal,
        evaluacion: reconciliado.evaluacion,
        estudiantesDetectados,
        estudiantesNuevos: reconciliado.estudiantesNuevos,
        estudiantesExistentes: reconciliado.estudiantesExistentes,
      })
      if (listaFinal.curso) setCurso(listaFinal.curso)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar ZIP")
    } finally {
      setImportandoZip(false)
      if (zipInputRef.current) zipInputRef.current.value = ""
    }
  }

  const guardarImportacionZip = async () => {
    if (!zipPreview) return
    setGuardandoZip(true)
    setError("")
    try {
      await guardarListaCotejo(zipPreview.lista)
      await guardarEvaluacionLista(zipPreview.evaluacion)

      if (zipPreview.estudiantesNuevos.length > 0 && zipPreview.lista.curso) {
        const existentes = await cargarEstudiantes(zipPreview.lista.curso)
        const existentesNombres = new Set(existentes.map(est => normalizeName(est.nombre)))
        const nuevos = zipPreview.estudiantesNuevos.filter(
          estudiante => !existentesNombres.has(normalizeName(estudiante.nombre))
        )
        if (nuevos.length > 0) {
          await guardarEstudiantes(zipPreview.lista.curso, [...existentes, ...nuevos])
        }
      }

      setZipPreview(null)
      setListas(prev => {
        const withoutDuplicated = prev.filter(item => item.id !== zipPreview.lista.id)
        return [zipPreview.lista, ...withoutDuplicated]
      })
      router.push(
        buildUrl(
          "/evaluaciones",
          withAsignatura({ tab: "listas", view: "resultados", listaId: zipPreview.lista.id }, asignatura)
        )
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar importacion")
    } finally {
      setGuardandoZip(false)
    }
  }

  const cursosDestino = cursos.length > 0
    ? cursos
    : [curso || duplicarLista?.curso || ""].filter(Boolean)

  return (
    <div className="space-y-5">
      <Dialog open={!!duplicarLista} onOpenChange={open => { if (!open) cerrarDuplicar() }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duplicar lista de cotejo</DialogTitle>
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
              onChange={event => setDuplicarCurso(event.target.value)}
              className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:ring-1 focus:ring-primary/30"
            >
              {cursosDestino.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={cerrarDuplicar}
              disabled={duplicando}
              className="rounded-[10px] border border-border px-4 py-2 text-[13px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
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

      <div className="flex flex-col gap-3 rounded-[14px] border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-pink-light text-primary">
            <CheckSquare className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-[18px] font-extrabold text-foreground">Listas de cotejo</h2>
            <p className="text-[12px] text-muted-foreground">Indicadores observables con registro Si/No por estudiante.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={curso}
            onChange={event => setCurso(event.target.value)}
            className="h-9 rounded-[10px] border border-border bg-background px-3 text-[12px] font-medium outline-none"
          >
            {cursos.length === 0 && <option value="">Sin cursos</option>}
            {cursos.map(item => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => zipInputRef.current?.click()}
            disabled={importandoZip}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 text-[12px] font-bold transition-colors hover:bg-muted/60 disabled:opacity-50"
          >
            {importandoZip ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileArchive className="h-3.5 w-3.5" />}
            {importandoZip ? "Importando..." : "Importar ZIP"}
          </button>
          <button
            type="button"
            onClick={() => irA("import")}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-border bg-background px-3 text-[12px] font-bold transition-colors hover:bg-muted/60"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar Word
          </button>
          <button
            type="button"
            onClick={() => irA("crear")}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-primary px-3 text-[12px] font-bold text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" />
            Nueva lista
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          <AlertCircle className="h-4 w-4" />
          {error}
          <button
            type="button"
            onClick={() => setError("")}
            className="ml-auto text-red-400 transition-colors hover:text-red-600"
          >
            X
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
                {zipPreview.lista.nombre || zipPreview.fileName}
              </h2>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {zipPreview.lista.curso || "Curso sin detectar"} · {zipPreview.evaluacion.grupos.length} grupos · {zipPreview.estudiantesDetectados.length} estudiantes
              </p>
              {zipPreview.cursoDetectado && zipPreview.cursoDetectado !== zipPreview.lista.curso && (
                <p className="mt-1 text-[11px] text-amber-600">
                  Detectado como {zipPreview.cursoDetectado}; se guardara en {zipPreview.lista.curso}.
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setZipPreview(null)}
                disabled={guardandoZip}
                className="flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
                Cancelar
              </button>
              <button
                type="button"
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
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Lista</p>
              <p className="mt-1 text-[13px] font-bold text-foreground">{zipPreview.lista.secciones.length} secciones</p>
              <p className="text-[11px] text-muted-foreground">{zipPreview.lista.puntajeMaximo} pts max.</p>
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

      {loading ? (
        <div className="flex min-h-[240px] items-center justify-center rounded-[14px] border border-dashed border-border bg-card text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando listas...
        </div>
      ) : listas.length === 0 ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center rounded-[14px] border border-dashed border-border bg-card px-4 text-center">
          <CheckSquare className="h-9 w-9 text-muted-foreground/60" />
          <h3 className="mt-3 text-[15px] font-bold text-foreground">No hay listas de cotejo para este curso</h3>
          <p className="mt-1 max-w-md text-[12px] text-muted-foreground">
            Crea una nueva o importa un Word con indicadores y columnas Si/No.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => irA("import")}
              className="inline-flex items-center gap-1.5 rounded-[10px] border border-border px-3 py-2 text-[12px] font-bold hover:bg-muted/60"
            >
              <Upload className="h-3.5 w-3.5" />
              Importar Word
            </button>
            <button
              type="button"
              onClick={() => irA("crear")}
              className="inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-2 text-[12px] font-bold text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva lista
            </button>
          </div>
        </div>
      ) : (
        <>
          {duplicando && (
            <div className="flex items-center gap-2 rounded-[12px] border border-border bg-card px-4 py-3 text-[12px] text-muted-foreground">
              <Copy className="h-4 w-4" />
              Duplicando lista...
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {listas.map(lista => (
              <ListaCotejoCard
                key={lista.id}
                lista={lista}
                asignatura={asignatura}
                onEliminar={id => setListas(prev => prev.filter(item => item.id !== id))}
                onDuplicar={abrirDuplicar}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
