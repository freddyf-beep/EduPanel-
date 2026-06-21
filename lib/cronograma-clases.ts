export interface ClaseCronogramaLike {
  numero: number
  fecha: string
  oaIds: string[]
  duplicadaDe?: number
  suspendida?: boolean
  motivoSuspension?: string
}

export function normalizarTotalClasesUnidad(total: number | null | undefined, fallback = 8): number {
  const raw = Number.isFinite(total) ? Number(total) : fallback
  return Math.min(60, Math.max(1, Math.round(raw || fallback || 1)))
}

export function crearClaseCronograma<T extends ClaseCronogramaLike = ClaseCronogramaLike>(numero: number): T {
  return {
    numero,
    fecha: "",
    oaIds: [],
  } as unknown as T
}

export function ajustarClasesCronograma<T extends ClaseCronogramaLike = ClaseCronogramaLike>(
  clases: T[] | null | undefined,
  totalClases: number | null | undefined,
): T[] {
  const safeTotal = normalizarTotalClasesUnidad(totalClases)
  const source = Array.isArray(clases) ? clases : []

  return Array.from({ length: safeTotal }, (_, index) => {
    const numero = index + 1
    const existing = source.find(clase => clase.numero === numero) || source[index]
    if (!existing) return crearClaseCronograma<T>(numero)
    return {
      ...existing,
      numero,
      fecha: existing.fecha || "",
      oaIds: Array.from(new Set(existing.oaIds || [])),
    }
  })
}

export function resolverTotalClasesUnidad(
  cronograma: { totalClases?: number; clases?: ClaseCronogramaLike[] } | null | undefined,
  verUnidad: { clases?: number } | null | undefined,
  fallback = 8,
): number {
  return normalizarTotalClasesUnidad(
    cronograma?.totalClases || cronograma?.clases?.length || verUnidad?.clases || fallback,
    fallback,
  )
}
