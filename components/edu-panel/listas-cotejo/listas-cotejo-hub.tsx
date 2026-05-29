"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { AlertCircle, CheckSquare, Copy, Loader2, Plus, Upload } from "lucide-react"
import { useActiveSubject } from "@/hooks/use-active-subject"
import { buildUrl, withAsignatura } from "@/lib/shared"
import { cargarHorarioSemanal } from "@/lib/horario"
import {
  buildListaCotejoId,
  cargarListasCotejo,
  guardarListaCotejo,
  type ListaCotejoTemplate,
} from "@/lib/listas-cotejo"
import { ListaCotejoCard } from "./lista-cotejo-card"

export function ListasCotejoHub() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { asignatura } = useActiveSubject()
  const [cursos, setCursos] = useState<string[]>([])
  const [curso, setCurso] = useState(searchParams.get("curso") ?? "")
  const [listas, setListas] = useState<ListaCotejoTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [duplicandoId, setDuplicandoId] = useState<string | null>(null)
  const [error, setError] = useState("")

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

  const handleDuplicar = async (lista: ListaCotejoTemplate) => {
    setDuplicandoId(lista.id)
    setError("")
    try {
      const copiaBase = JSON.parse(JSON.stringify(lista)) as ListaCotejoTemplate
      const copia: ListaCotejoTemplate = {
        ...copiaBase,
        id: buildListaCotejoId(copiaBase.asignatura, copiaBase.curso),
        nombre: copiaBase.nombre.endsWith("(copia)") ? copiaBase.nombre : `${copiaBase.nombre || "Lista de cotejo"} (copia)`,
        createdAt: undefined,
        updatedAt: undefined,
      }
      await guardarListaCotejo(copia)
      setListas(prev => [copia, ...prev])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al duplicar lista")
    } finally {
      setDuplicandoId(null)
    }
  }

  return (
    <div className="space-y-5">
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
          {duplicandoId && (
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
                onDuplicar={handleDuplicar}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
