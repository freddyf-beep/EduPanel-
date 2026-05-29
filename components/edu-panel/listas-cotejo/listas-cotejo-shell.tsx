"use client"

import { useSearchParams } from "next/navigation"
import { ListaCotejoEditor } from "./lista-cotejo-editor"
import { ListaCotejoEvaluacionView } from "./lista-cotejo-evaluacion-view"
import { ListaCotejoResultadosView } from "./lista-cotejo-resultados-view"
import { ListasCotejoHub } from "./listas-cotejo-hub"

export function ListasCotejoShell() {
  const searchParams = useSearchParams()
  const view = searchParams.get("view")
  const listaId = searchParams.get("listaId") ?? ""

  if (view === "import") return <ListaCotejoEditor mode="import" />
  if (view === "crear") return <ListaCotejoEditor mode="blank" listaId={listaId} />
  if (view === "evaluacion" && listaId) return <ListaCotejoEvaluacionView listaId={listaId} />
  if (view === "resultados" && listaId) return <ListaCotejoResultadosView listaId={listaId} />

  return <ListasCotejoHub />
}
