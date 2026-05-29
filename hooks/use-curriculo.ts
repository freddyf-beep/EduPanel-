"use client"

import { useState, useEffect } from "react"
import { getUnidades, getUnidadCompleta, getOADeUnidad } from "@/lib/curriculo"
import type { Unidad, ObjetivoAprendizaje } from "@/lib/curriculo"

// ─── Hook: lista de unidades ──────────────────────────────────────────────────
export function useUnidades(asignatura: string, nivel: string) {
  const [prevParams, setPrevParams] = useState({ asignatura, nivel })
  const [unidades, setUnidades] = useState<Unidad[]>([])
  const [loading, setLoading]   = useState(() => !!asignatura && !!nivel)
  const [error, setError]       = useState<string | null>(null)

  if (prevParams.asignatura !== asignatura || prevParams.nivel !== nivel) {
    setPrevParams({ asignatura, nivel })
    setLoading(!!asignatura && !!nivel)
    setError(null)
  }

  useEffect(() => {
    if (!asignatura || !nivel) return
    let active = true
    getUnidades(asignatura, nivel)
      .then(res => {
        if (active) {
          setUnidades(res)
          setLoading(false)
        }
      })
      .catch(e => {
        if (active) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => {
      active = false
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
  const [prevParams, setPrevParams] = useState({ asignatura, nivel, unidadId })
  const [unidad, setUnidad]   = useState<Unidad | null>(null)
  const [loading, setLoading] = useState(() => !!asignatura && !!nivel && !!unidadId)
  const [error, setError]     = useState<string | null>(null)

  if (prevParams.asignatura !== asignatura || prevParams.nivel !== nivel || prevParams.unidadId !== unidadId) {
    setPrevParams({ asignatura, nivel, unidadId })
    setLoading(!!asignatura && !!nivel && !!unidadId)
    setError(null)
  }

  useEffect(() => {
    if (!asignatura || !nivel || !unidadId) return
    let active = true
    getUnidadCompleta(asignatura, nivel, unidadId)
      .then(res => {
        if (active) {
          setUnidad(res)
          setLoading(false)
        }
      })
      .catch(e => {
        if (active) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => {
      active = false
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
  const [prevParams, setPrevParams] = useState({ asignatura, nivel, unidadId })
  const [oas, setOas]         = useState<ObjetivoAprendizaje[]>([])
  const [loading, setLoading] = useState(() => !!asignatura && !!nivel && !!unidadId)
  const [error, setError]     = useState<string | null>(null)

  if (prevParams.asignatura !== asignatura || prevParams.nivel !== nivel || prevParams.unidadId !== unidadId) {
    setPrevParams({ asignatura, nivel, unidadId })
    setLoading(!!asignatura && !!nivel && !!unidadId)
    setError(null)
  }

  useEffect(() => {
    if (!asignatura || !nivel || !unidadId) return
    let active = true
    getOADeUnidad(asignatura, nivel, unidadId)
      .then(res => {
        if (active) {
          setOas(res)
          setLoading(false)
        }
      })
      .catch(e => {
        if (active) {
          setError(e.message)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [asignatura, nivel, unidadId])

  return { oas, loading, error }
}
