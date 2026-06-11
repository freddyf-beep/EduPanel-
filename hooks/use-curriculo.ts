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
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (!asignatura || !nivel) {
        if (!cancelled) {
          setUnidades([])
          setError(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        const data = await getUnidades(asignatura, nivel)
        if (!cancelled) setUnidades(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando unidades")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
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
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (!asignatura || !nivel || !unidadId) {
        if (!cancelled) {
          setUnidad(null)
          setError(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        const data = await getUnidadCompleta(asignatura, nivel, unidadId)
        if (!cancelled) setUnidad(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando unidad")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
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
    let cancelled = false
    void Promise.resolve().then(async () => {
      if (!asignatura || !nivel || !unidadId) {
        if (!cancelled) {
          setOas([])
          setError(null)
          setLoading(false)
        }
        return
      }

      setLoading(true)
      setError(null)
      try {
        const data = await getOADeUnidad(asignatura, nivel, unidadId)
        if (!cancelled) setOas(data)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error cargando objetivos")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [asignatura, nivel, unidadId])

  return { oas, loading, error }
}
