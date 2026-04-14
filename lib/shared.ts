export const DEFAULT_ASIGNATURA = "Música"
export const ASIGNATURA = DEFAULT_ASIGNATURA
export const SUBJECT_STORAGE_KEY = "edupanel.asignatura"

export const SUBJECT_FALLBACK_OPTIONS = [
  DEFAULT_ASIGNATURA,
  "Educación Física",
  "Lenguaje",
  "Corporalidad y Movimiento",
]

export const UNIT_COLORS = [
  "#F59E0B",
  "#3B82F6",
  "#EF4444",
  "#22C55E",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
]

export function sanitizeAsignatura(value?: string | null): string {
  const trimmed = value?.trim()
  return trimmed ? trimmed : DEFAULT_ASIGNATURA
}

export function normalizeKeyPart(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

export function withAsignatura<T extends Record<string, string | null | undefined>>(
  params: T,
  asignatura: string
): Record<string, string> {
  const merged: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...params, asignatura })) {
    if (typeof value === "string" && value.length > 0) {
      merged[key] = value
    }
  }
  return merged
}

// Mapping curso -> nivel curricular en Firestore
// Cuando tengamos más datos curriculares se puede expandir
export function getCurriculoNivel(curso: string): string {
  const map: Record<string, string> = {
    "1° A": "1ro Básico",
    "2° A": "1ro Básico",
    "2° B": "1ro Básico",
    "3°": "1ro Básico",
    "4°": "1ro Básico",
    "Taller 1er Ciclo": "1ro Básico",
    "Taller 2do Ciclo": "1ro Básico",
  }
  return map[curso] ?? "1ro Básico"
}

export function buildUrl(base: string, params: Record<string, string | null | undefined>): string {
  const cleanEntries = Object.entries(params).filter(([, value]) => typeof value === "string" && value.length > 0)
  const q = new URLSearchParams(cleanEntries as [string, string][]).toString()
  return q ? `${base}?${q}` : base
}

export function unidadIdFromIndex(index: number): string {
  return `unidad_${index + 1}`
}
