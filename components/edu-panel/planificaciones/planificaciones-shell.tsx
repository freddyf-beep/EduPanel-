"use client"

import { useSearchParams } from "next/navigation"
import { PlanificacionesHub } from "./planificaciones-hub"
import { PlanificacionesDetail } from "./planificaciones-detail"

export function PlanificacionesShell() {
  const searchParams = useSearchParams()
  const cursoParam   = searchParams.get("curso")

  if (!cursoParam) {
    return <PlanificacionesHub />
  }

  return <PlanificacionesDetail curso={cursoParam} />
}
