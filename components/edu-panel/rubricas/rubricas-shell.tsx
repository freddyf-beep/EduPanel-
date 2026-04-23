"use client"

import { useSearchParams } from "next/navigation"
import { RubricasHub } from "./rubricas-hub"
import { RubricaImport } from "./rubrica-import"
import { EvaluacionView } from "./evaluacion-view"
import { ResultadosView } from "./resultados-view"

export function RubricasShell() {
  const searchParams = useSearchParams()
  const view = searchParams.get("view")
  const rubricaId = searchParams.get("rubricaId") ?? ""

  if (view === "import") return <RubricaImport />
  if (view === "crear") return <RubricaImport mode="blank" />
  if (view === "evaluacion" && rubricaId) return <EvaluacionView rubricaId={rubricaId} />
  if (view === "resultados" && rubricaId) return <ResultadosView rubricaId={rubricaId} />

  return <RubricasHub />
}
