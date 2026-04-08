"use client"

import { useState, useEffect } from "react"
import { getUnidades, getUnidadCompleta, getOADeUnidad } from "@/lib/curriculo"
import type { Unidad, ObjetivoAprendizaje } from "@/lib/curriculo"

// ─── Hook: lista de unidades ──────────────────────────────────────────────────
export function useUnidades(asignatura: string, nivel: string) {
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    if (!asignatura || !nivel) return
    setLoading(true)
    getUnidades(asignatura, nivel)
      .then(setUnidades)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [asignatura, nivel])

  return { unidades, loading, error }
}

// ─── Hook: unidad completa con OA, actividades y evaluaciones ────────────────
export function useUnidadCompleta(
  asignatura: string,
  nivel: string,
  unidadId: string
) {
  const [unidad, setUnidad]   = useState<Unidad | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!asignatura || !nivel || !unidadId) return
    setLoading(true)
    getUnidadCompleta(asignatura, nivel, unidadId)
      .then(setUnidad)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [asignatura, nivel, unidadId])

  return { unidad, loading, error }
}

// ─── Hook: solo OA de una unidad ─────────────────────────────────────────────
export function useOADeUnidad(
  asignatura: string,
  nivel: string,
  unidadId: string
) {
  const [oas, setOas]         = useState<ObjetivoAprendizaje[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    if (!asignatura || !nivel || !unidadId) return
    setLoading(true)
    getOADeUnidad(asignatura, nivel, unidadId)
      .then(setOas)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [asignatura, nivel, unidadId])

  return { oas, loading, error }
}
