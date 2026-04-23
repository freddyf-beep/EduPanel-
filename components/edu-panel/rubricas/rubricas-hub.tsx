"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Upload, LayoutList, FileArchive, Loader2, AlertCircle } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import {
  cargarRubricas,
  guardarRubrica,
  guardarEvaluacion,
  resolverMetadatosCurricularesRubrica,
  type RubricaTemplate,
} from "@/lib/rubricas"
import { guardarEstudiantes, cargarEstudiantes } from "@/lib/estudiantes"
import { RubricaCard } from "./rubrica-card"

export function RubricasHub() {
  const router = useRouter()
  const { asignatura } = useActiveSubject()
  const [cursos, setCursos] = useState<string[]>([])
  const [curso, setCurso] = useState("")
  const [rubricas, setRubricas] = useState<RubricaTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [importandoZip, setImportandoZip] = useState(false)
  const [errorImport, setErrorImport] = useState("")
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

  const handleImportarZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportandoZip(true)
    setErrorImport("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/import-rubrica", { method: "POST", body: formData })
      if (!res.ok) throw new Error(await res.text())

      const data = await res.json()
      const resolucionCurricular = await resolverMetadatosCurricularesRubrica(data.rubrica)
      const rubricaFinal: RubricaTemplate = {
        ...data.rubrica,
        unidadId: resolucionCurricular.unidadId ?? data.rubrica.unidadId,
        unidadNombre: resolucionCurricular.unidadNombre ?? data.rubrica.unidadNombre,
        metadatosCurriculares: resolucionCurricular.metadatosCurriculares,
      }

      await guardarRubrica(rubricaFinal)
      await guardarEvaluacion(data.evaluacion)

      if (data.estudiantesDetectados?.length > 0 && rubricaFinal.curso) {
        const existentes = await cargarEstudiantes(rubricaFinal.curso)
        const existentesIds = new Set(existentes.map((estudiante: { id: string }) => estudiante.id))
        const nuevos = data.estudiantesDetectados.filter(
          (estudiante: { id: string }) => !existentesIds.has(estudiante.id)
        )

        if (nuevos.length > 0) {
          await guardarEstudiantes(rubricaFinal.curso, [...existentes, ...nuevos])
        }
      }

      router.push(
        buildUrl(
          "/rubricas",
          withAsignatura({ view: "resultados", rubricaId: rubricaFinal.id }, asignatura)
        )
      )
    } catch (err) {
      setErrorImport(err instanceof Error ? err.message : "Error al importar ZIP")
    } finally {
      setImportandoZip(false)
      if (zipInputRef.current) zipInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-6">
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
            />
          ))}
        </div>
      )}
    </div>
  )
}
