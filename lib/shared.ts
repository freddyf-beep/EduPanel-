// ─── Constantes compartidas entre todas las páginas ───────────────────────────

export const ASIGNATURA = "Música"


export const UNIT_COLORS = [
  "#F59E0B",
  "#3B82F6",
  "#EF4444",
  "#22C55E",
  "#8B5CF6",
  "#EC4899",
  "#14B8A6",
]

// Mapeo curso → nivel curricular en Firestore
// Cuando tengamos más datos curriculares se puede expandir
export function getCurriculoNivel(curso: string): string {
  const map: Record<string, string> = {
    "1° A":               "1ro Básico",
    "2° A":               "1ro Básico",
    "2° B":               "1ro Básico",
    "3°":                 "1ro Básico",
    "4°":                 "1ro Básico",
    "Taller 1er Ciclo":   "1ro Básico",
    "Taller 2do Ciclo":   "1ro Básico",
  }
  return map[curso] ?? "1ro Básico"
}

// Construir URL con parámetros de curso y unidad
export function buildUrl(base: string, params: Record<string, string>): string {
  const q = new URLSearchParams(params).toString()
  return q ? `${base}?${q}` : base
}

// Mapeo unidad index (0-based) → id en Firestore
export function unidadIdFromIndex(index: number): string {
  return `unidad_${index + 1}`
}
