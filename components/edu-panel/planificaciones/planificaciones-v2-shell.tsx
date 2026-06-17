"use client"

import { useSearchParams } from "next/navigation"
import { PlanificacionesV2Detail } from "./planificaciones-v2-detail"
import { PlanificacionesList } from "./planificaciones-list"

export function PlanificacionesV2Shell() {
  const searchParams = useSearchParams()
  const cursoParam      = searchParams.get("curso")
  const asignaturaParam = searchParams.get("asignatura") ?? "default"

  if (!cursoParam) {
    return <PlanificacionesList key={asignaturaParam} />
  }

  return <PlanificacionesV2Detail key={`${asignaturaParam}__${cursoParam}`} curso={cursoParam} />
}
