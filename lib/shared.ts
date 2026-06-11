import { cargarNivelMapping, resolveNivel } from "./nivel-mapping"

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

export function buildCursoId(curso: string): string {
  return normalizeKeyPart(curso)
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

export async function getCurriculoNivel(curso: string): Promise<string> {
  const mapping = await cargarNivelMapping()
  return resolveNivel(curso, mapping) ?? "1ro Básico"
}

export function buildUrl(base: string, params: Record<string, string | null | undefined>): string {
  const cleanEntries = Object.entries(params).filter(([, value]) => typeof value === "string" && value.length > 0)
  const q = new URLSearchParams(cleanEntries as [string, string][]).toString()
  return q ? `${base}?${q}` : base
}

export function unidadIdFromIndex(index: number): string {
  return `unidad_${index + 1}`
}

export type LinkifyFragment =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string }

const URL_REGEX = /(https?:\/\/[^\s)<>"']+)/g

export function linkifyText(text: string): LinkifyFragment[] {
  if (!text) return []
  const fragments: LinkifyFragment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  URL_REGEX.lastIndex = 0
  while ((match = URL_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      fragments.push({ type: "text", value: text.slice(lastIndex, match.index) })
    }
    const raw = match[0]
    const trimmed = raw.replace(/[.,;:!?]+$/, "")
    fragments.push({ type: "link", href: trimmed, label: trimmed })
    if (trimmed.length < raw.length) {
      fragments.push({ type: "text", value: raw.slice(trimmed.length) })
    }
    lastIndex = match.index + raw.length
  }
  if (lastIndex < text.length) {
    fragments.push({ type: "text", value: text.slice(lastIndex) })
  }
  return fragments
}
