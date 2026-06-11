"use client"

import { TermometroUnidad } from "@/components/edu-panel/ver-unidad/termometro-unidad"
import type { OAEditado } from "@/lib/curriculo"

interface TermometroV3Props {
  asignatura: string
  curso: string
  unidadId: string
  oas: OAEditado[]
}

export function TermometroV3(props: TermometroV3Props) {
  return <TermometroUnidad {...props} />
}
