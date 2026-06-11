"use client"

import { useSearchParams } from "next/navigation"
import { PlanificacionesV2Detail } from "./planificaciones-v2-detail"
import { PlanificacionesList } from "./planificaciones-list"

export function PlanificacionesV2Shell() {
  const searchParams = useSearchParams()
  const cursoParam   = searchParams.get("curso")

  if (!cursoParam) {
    return <PlanificacionesList />
  }

  return <PlanificacionesV2Detail curso={cursoParam} />
}
