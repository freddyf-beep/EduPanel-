"use client"

import { useSearchParams } from "next/navigation"
import { PlanificacionesV2Detail } from "./planificaciones-v2-detail"
import { PlanificacionesV3Shell } from "./planificaciones-v3-shell"

export function PlanificacionesV2Shell() {
  const searchParams = useSearchParams()
  const cursoParam   = searchParams.get("curso")

  if (!cursoParam) {
    return <PlanificacionesV3Shell />
  }

  return <PlanificacionesV2Detail curso={cursoParam} />
}
