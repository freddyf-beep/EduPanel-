"use client"

import { useSearchParams } from "next/navigation"
import { GuiasHub } from "./guias-hub"
import { GuiaEditor } from "./guia-editor"

export function GuiasShell() {
  const searchParams = useSearchParams()
  const view = searchParams.get("view")
  const guiaId = searchParams.get("guiaId") || ""
  const cursoInicial = searchParams.get("curso") || undefined
  const unidadIdInicial = searchParams.get("unidadId") || undefined
  const unidadNombreInicial = searchParams.get("unidadNombre") || undefined

  if (view === "editor") {
    return (
      <GuiaEditor
        guiaId={guiaId || undefined}
        cursoInicial={cursoInicial}
        unidadIdInicial={unidadIdInicial}
        unidadNombreInicial={unidadNombreInicial}
      />
    )
  }

  return <GuiasHub />
}
