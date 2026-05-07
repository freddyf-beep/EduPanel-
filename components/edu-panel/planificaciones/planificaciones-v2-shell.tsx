"use client"

import { useSearchParams } from "next/navigation"
import { PlanificacionesV2Hub } from "./planificaciones-v2-hub"
import { PlanificacionesV2Detail } from "./planificaciones-v2-detail"

export function PlanificacionesV2Shell() {
  const searchParams = useSearchParams()
  const cursoParam   = searchParams.get("curso")

  // Hub v2 que navega correctamente a /planificaciones-v2
  if (!cursoParam) {
    return <PlanificacionesV2Hub />
  }

  return <PlanificacionesV2Detail curso={cursoParam} />
}
