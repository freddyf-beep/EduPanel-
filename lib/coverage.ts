// ═══════════════════════════════════════════════════════════════════════════
// Cobertura curricular (puro)
// ─────────────────────────────────────────────────────────────────────────
// Módulo puro que calcula, dada una unidad y los conjuntos de pruebas y guías
// asociadas, el estado de cobertura de cada Objetivo de Aprendizaje (OA).
//
// No depende de Firestore ni de React: recibe sus entradas como parámetros
// y devuelve los resultados. Esto facilita testearlo aisladamente y reusarlo
// desde la UI o desde tareas en background.
// ═══════════════════════════════════════════════════════════════════════════

import type { UnidadPlan, OAEditado } from "@/lib/curriculo"
import type { PruebaTemplate } from "@/lib/pruebas"
import type { GuiaTemplate } from "@/lib/guias"

// ─── Tipos públicos ─────────────────────────────────────────────────────────

/** Estado de cobertura de un OA dentro de una unidad. */
export type EstadoCobertura = "cubierto" | "parcial" | "no-cubierto"

/** Resultado de cobertura para un OA específico. */
export interface CoberturaItem {
  /** Código normalizado del OA (ej.: "OA1", "OA12"). */
  oaCode: string
  /** Descripción del OA (texto legible). */
  oaTexto: string
  /** Estado de cobertura calculado. */
  estado: EstadoCobertura
  /** Cantidad de pruebas que abordan este OA. */
  conteoP: number
  /** Cantidad de guías que abordan este OA. */
  conteoG: number
  /** Pruebas que abordan este OA (referencias completas). */
  pruebas: PruebaTemplate[]
  /** Guías que abordan este OA (referencias completas). */
  guias: GuiaTemplate[]
}

// ─── Helpers internos ───────────────────────────────────────────────────────

/**
 * Normaliza un código OA quitando espacios y pasando a mayúsculas.
 * Ej.: "OA 1" → "OA1", "oa  12" → "OA12".
 */
function normalizarCodigoOA(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase()
}

/**
 * Extrae todos los códigos OA únicos presentes en un arreglo de strings.
 * Reconoce el patrón "OA N" (con espacios opcionales) sin distinguir mayúsculas.
 *
 * Ejemplo: `extraerOACodes(["OA 1: descripción", "Relacionado con OA 3"])` → `["OA1", "OA3"]`.
 */
export function extraerOACodes(textos: string[]): string[] {
  const set = new Set<string>()
  for (const t of textos) {
    if (typeof t !== "string") continue
    // \b para evitar capturar "OAA" (objetivos transversales actitudinales)
    const matches = t.match(/\bOA\s*\d+/gi)
    if (!matches) continue
    for (const m of matches) {
      set.add(normalizarCodigoOA(m))
    }
  }
  return Array.from(set)
}

/**
 * Devuelve el listado de OAs de una unidad, soportando varias convenciones:
 * `unidad.oas`, `unidad.objetivos` o `unidad.objetivos_aprendizaje`.
 * Devuelve `[]` si no hay OAs reconocibles.
 */
function obtenerOAsDeUnidad(unidad: UnidadPlan | null | undefined): OAEditado[] {
  if (!unidad) return []
  const u = unidad as unknown as Record<string, unknown>
  const candidatos = [u.oas, u.objetivos, u.objetivos_aprendizaje]
  for (const c of candidatos) {
    if (Array.isArray(c) && c.length > 0) {
      return c as OAEditado[]
    }
  }
  return []
}

/**
 * Deriva un código OA normalizado a partir de un OAEditado.
 * Prioriza `id` (ej.: "OA1"); si está vacío, intenta `numero` ("OA{n}");
 * en caso contrario, retorna cadena vacía.
 */
function codigoDesdeOA(oa: OAEditado): string {
  if (oa?.id && typeof oa.id === "string") {
    const c = normalizarCodigoOA(oa.id)
    if (/^OA\d+$/.test(c)) return c
  }
  if (typeof oa?.numero === "number" && Number.isFinite(oa.numero)) {
    return `OA${oa.numero}`
  }
  return ""
}

// ─── API pública ────────────────────────────────────────────────────────────

/**
 * Calcula la cobertura curricular de una unidad a partir de sus pruebas y guías.
 *
 * Para cada OA de la unidad determina:
 *  - cuántas pruebas y guías lo abordan (basándose en
 *    `metadatosCurriculares.objetivos[]` y el patrón "OA N").
 *  - el estado: `"cubierto"` si al menos una prueba lo aborda,
 *    `"parcial"` si solo lo abordan guías y `"no-cubierto"` si nada lo aborda.
 *
 * El resultado preserva el orden de los OAs de la unidad.
 * Función pura: no realiza I/O ni mutaciones.
 */
export function computarCobertura(
  unidad: UnidadPlan | null | undefined,
  pruebas: PruebaTemplate[],
  guias: GuiaTemplate[]
): CoberturaItem[] {
  const oas = obtenerOAsDeUnidad(unidad)
  if (oas.length === 0) return []

  // Pre-cómputo: para cada prueba/guía, set de códigos OA que aborda.
  const pruebasConCodigos: Array<{ ref: PruebaTemplate; codigos: Set<string> }> =
    (pruebas || []).map(p => ({
      ref: p,
      codigos: new Set(extraerOACodes(p?.metadatosCurriculares?.objetivos ?? [])),
    }))

  const guiasConCodigos: Array<{ ref: GuiaTemplate; codigos: Set<string> }> =
    (guias || []).map(g => ({
      ref: g,
      codigos: new Set(extraerOACodes(g?.metadatosCurriculares?.objetivos ?? [])),
    }))

  return oas.map<CoberturaItem>(oa => {
    const oaCode = codigoDesdeOA(oa)
    const oaTexto = oa?.descripcion?.trim() ?? ""

    const pruebasMatch = oaCode
      ? pruebasConCodigos.filter(x => x.codigos.has(oaCode)).map(x => x.ref)
      : []
    const guiasMatch = oaCode
      ? guiasConCodigos.filter(x => x.codigos.has(oaCode)).map(x => x.ref)
      : []

    const conteoP = pruebasMatch.length
    const conteoG = guiasMatch.length

    let estado: EstadoCobertura
    if (conteoP >= 1) estado = "cubierto"
    else if (conteoG >= 1) estado = "parcial"
    else estado = "no-cubierto"

    return {
      oaCode,
      oaTexto,
      estado,
      conteoP,
      conteoG,
      pruebas: pruebasMatch,
      guias: guiasMatch,
    }
  })
}

/**
 * Calcula el porcentaje de OAs en estado "cubierto" sobre el total de OAs.
 *
 * - Devuelve `0` si no hay OAs en la unidad.
 * - El valor se redondea a 1 decimal (ej.: `33.3`, `66.7`, `100`).
 *
 * Función pura.
 */
export function porcentajeCobertura(items: CoberturaItem[]): number {
  if (!items || items.length === 0) return 0
  const cubiertos = items.filter(i => i.estado === "cubierto").length
  return Math.round((cubiertos / items.length) * 1000) / 10
}
