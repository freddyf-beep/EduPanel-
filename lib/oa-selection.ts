export interface IndicadorSeleccion {
  id: string
  texto: string
  seleccionado: boolean
  esPropio?: boolean
}

export interface OASeleccion {
  id: string
  numero?: number
  tipo?: "oa" | "oat"
  descripcion: string
  seleccionado: boolean
  indicadores: IndicadorSeleccion[]
  esPropio?: boolean
  tags?: string[]
}

export interface ObjetivoAprendizajeSeleccion {
  tipo?: string
  numero: number
  descripcion: string
  indicadores?: string[]
}

export function normalizarTextoCurso(value: string | null | undefined): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/º/g, "°")
    .trim()
    .toLowerCase()
}

export function esPrimeroACuartoBasico(value: string | null | undefined): boolean {
  const text = normalizarTextoCurso(value)
  if (!text || text.includes("medio")) return false
  if (/\b(1|2|3|4)\s*(ro|do|ero|to)?\s*basico\b/.test(text)) return true
  if (/\b(primero|segundo|tercero|cuarto)\s*basico\b/.test(text)) return true
  return /^\s*[1-4]\s*(°|ro|do|ero|to)?\s*[a-z]\b/.test(text)
}

export function preservarSeleccionLegacyOa(curso: string, nivel?: string): boolean {
  return esPrimeroACuartoBasico(curso) || esPrimeroACuartoBasico(nivel)
}

export function buildOfficialOAIdSeleccion(numero: number): string {
  return `OA${numero}`
}

export function initOAsSeleccion(
  objetivos: ObjetivoAprendizajeSeleccion[] | undefined,
  asignatura: string,
  seleccionarPorDefecto: boolean,
): OASeleccion[] {
  return (objetivos || []).map((oa) => ({
    id: buildOfficialOAIdSeleccion(oa.numero),
    numero: oa.numero,
    tipo: String(oa.tipo || "").toUpperCase() === "OAT" ? "oat" : "oa",
    descripcion: oa.descripcion,
    seleccionado: seleccionarPorDefecto,
    indicadores: (oa.indicadores || []).map((ind, i) => ({
      id: `OA${oa.numero}_IND${i}`,
      texto: ind,
      seleccionado: seleccionarPorDefecto,
      esPropio: false,
    })),
    esPropio: false,
    tags: [asignatura],
  }))
}

export function esOAPropioReal(oa: Pick<OASeleccion, "id" | "esPropio">): boolean {
  return !!oa.esPropio && /^PROP_/i.test(oa.id)
}

export function mergeOAsSeleccion(
  base: OASeleccion[],
  saved: OASeleccion[] = [],
  options: { conservarHuerfanosComoPropios?: boolean } = {},
): OASeleccion[] {
  const conservarHuerfanosComoPropios = options.conservarHuerfanosComoPropios ?? true
  const baseIds = new Set(base.map((oa) => oa.id))
  const savedById = new Map(saved.map((oa) => [oa.id, oa]))

  const mergedBase = base.map((oa) => {
    const existing = savedById.get(oa.id)
    if (!existing) return oa
    return {
      ...oa,
      descripcion: existing.descripcion || oa.descripcion,
      seleccionado: existing.seleccionado,
      indicadores: oa.indicadores
        .map((ind) => existing.indicadores.find((x) => x.id === ind.id) || ind)
        .concat(existing.indicadores.filter((x) => x.esPropio)),
    }
  })

  const huerfanos = saved
    .filter((oa) => !baseIds.has(oa.id))
    .filter((oa) => conservarHuerfanosComoPropios || esOAPropioReal(oa))
    .map((oa) => ({
      ...oa,
      esPropio: true,
    }))

  const combined = [...mergedBase, ...huerfanos]
  const seen = new Set<string>()
  return combined.filter((oa) => {
    if (seen.has(oa.id)) return false
    seen.add(oa.id)
    return true
  })
}

export function sanitizeOaIds(ids: string[] | undefined, validIds: Set<string>): string[] {
  return Array.from(new Set(ids || [])).filter((id) => validIds.has(id))
}
