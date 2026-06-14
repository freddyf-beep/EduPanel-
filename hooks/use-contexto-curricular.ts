"use client"

import { useEffect, useState, useCallback } from "react"
import {
  cargarVerUnidad,
  cargarCronogramaUnidad,
  type OAEditado,
  type VerUnidadGuardada,
  type CronogramaUnidadData,
  type ActividadClase,
} from "@/lib/curriculo"
import { getCurriculoNivel } from "@/lib/shared"
import type { ContextoCurricular, ClaseVinculada, ActividadClaseResumen } from "@/lib/ai/evaluaciones-copilot"

interface UseContextoCurricularParams {
  asignatura: string
  curso: string
  unidadId?: string
  unidadNombre?: string
}

interface UseContextoCurricularResult {
  contexto: ContextoCurricular
  verUnidad: VerUnidadGuardada | null
  cronograma: CronogramaUnidadData | null
  cargando: boolean
  error: string | null
  refrescar: () => void
  setOasSeleccionados: (oas: OAEditado[]) => void
}

export function useContextoCurricular({
  asignatura,
  curso,
  unidadId,
  unidadNombre,
}: UseContextoCurricularParams): UseContextoCurricularResult {
  const [verUnidad, setVerUnidad] = useState<VerUnidadGuardada | null>(null)
  const [cronograma, setCronograma] = useState<CronogramaUnidadData | null>(null)
  const [oasOverride, setOasOverride] = useState<OAEditado[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [nivelCurricular, setNivelCurricular] = useState("1ro Básico")

  const refrescar = useCallback(() => setTick((t: number) => t + 1), [])

  useEffect(() => {
    if (!asignatura || !curso || !unidadId) return
    let cancelled = false

    void Promise.resolve().then(() => {
      if (cancelled) return
      setCargando(true)
      setError(null)

      Promise.all([
        cargarVerUnidad(asignatura, curso, unidadId)
          .then(data => { if (!cancelled) setVerUnidad(data) })
          .catch(() => { if (!cancelled) setVerUnidad(null) }),
        cargarCronogramaUnidad(asignatura, curso, unidadId)
          .then(data => { if (!cancelled) setCronograma(data) })
          .catch(() => { if (!cancelled) setCronograma(null) }),
        getCurriculoNivel(curso)
          .then(nivel => { if (!cancelled) setNivelCurricular(nivel) })
          .catch(() => { if (!cancelled) setNivelCurricular("1ro Básico") }),
      ])
        .catch((e: Error) => { if (!cancelled) setError(e?.message || "Error cargando contexto") })
        .finally(() => { if (!cancelled) setCargando(false) })
    })

    return () => { cancelled = true }
  }, [asignatura, curso, unidadId, tick])

  const oasEfectivos = oasOverride ?? (verUnidad?.oas || [])
  const habilidades = (verUnidad?.habilidades || [])
    .filter((h: { seleccionado: boolean }) => h.seleccionado)
    .map((h: { texto: string }) => h.texto)
  const conocimientos = (verUnidad?.conocimientos || [])
    .filter((c: { seleccionado: boolean }) => c.seleccionado)
    .map((c: { texto: string }) => c.texto)
  const actitudes = (verUnidad?.actitudes || [])
    .filter((a: { seleccionado: boolean }) => a.seleccionado)
    .map((a: { texto: string }) => a.texto)

  const clasesVinculadas: ClaseVinculada[] = (cronograma?.clases || []).map((c: { numero: number; fecha: string; oaIds: string[] }) => ({
    numero: c.numero,
    fecha: c.fecha,
    oaIds: c.oaIds || [],
  }))

  const contexto: ContextoCurricular = {
    asignatura,
    curso,
    nivelCurricular,
    unidadId,
    unidadNombre,
    oas: oasEfectivos,
    habilidades,
    conocimientos,
    actitudes,
    contextoDocente: verUnidad?.contextoDocente,
    objetivoDocente: verUnidad?.objetivoDocente,
    clasesVinculadas: clasesVinculadas.length > 0 ? clasesVinculadas : undefined,
  }

  return {
    contexto,
    verUnidad,
    cronograma,
    cargando,
    error,
    refrescar,
    setOasSeleccionados: setOasOverride,
  }
}
