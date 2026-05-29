"use client"

import { useSearchParams } from "next/navigation"
import { PruebasHub } from "./pruebas-hub"
import { PruebaEditor } from "./prueba-editor"
import { PruebaResultados } from "./prueba-resultados"

export function PruebasShell() {
  const searchParams = useSearchParams()
  const view = searchParams.get("view")
  const pruebaId = searchParams.get("pruebaId") || ""
  const cursoInicial = searchParams.get("curso") || undefined
  const unidadIdInicial = searchParams.get("unidadId") || undefined
  const unidadNombreInicial = searchParams.get("unidadNombre") || undefined

  if (view === "editor") {
    return (
      <PruebaEditor
        pruebaId={pruebaId || undefined}
        cursoInicial={cursoInicial}
        unidadIdInicial={unidadIdInicial}
        unidadNombreInicial={unidadNombreInicial}
      />
    )
  }

  if (view === "resultados" && pruebaId) {
    return <PruebaResultados pruebaId={pruebaId} />
  }

  return <PruebasHub />
}
