// ═══════════════════════════════════════════════════════════════════════════
// Tipos compartidos entre Pruebas y Guías
// ─────────────────────────────────────────────────────────────────────────
// Los bloques de contenido (texto, imagen, tabla, separador) son reutilizables
// tanto en el cuerpo de una guía como en el encabezado de una prueba o como
// estímulo de lectura antes de un grupo de preguntas.
// ═══════════════════════════════════════════════════════════════════════════

import type { OAEditado } from "@/lib/curriculo"

// ─── Bloques de contenido genéricos ─────────────────────────────────────────

export interface BloqueTextoData {
  /** HTML simple (bold, italic, underline, listas). Usamos un editor liviano. */
  html: string
  /** Estilo opcional para énfasis */
  estilo?: "normal" | "destacado" | "instrucciones" | "lectura"
}

export interface BloqueImagenData {
  url: string
  storagePath?: string
  alt?: string
  caption?: string
  /** Ancho relativo: "small" 30%, "medium" 60%, "large" 100% */
  ancho?: "small" | "medium" | "large"
  alineacion?: "izq" | "centro" | "der"
}

export interface BloqueTablaData {
  /** Cabeceras (primera fila) */
  cabeceras: string[]
  /** Filas con celdas */
  filas: string[][]
  /** Si true, la primera columna también funciona como cabecera */
  primeraColumnaCabecera?: boolean
}

export interface BloqueSeparadorData {
  estilo?: "linea" | "espacio" | "saltoPagina"
}

export type BloqueContenido =
  | { id: string; tipo: "texto"; data: BloqueTextoData }
  | { id: string; tipo: "imagen"; data: BloqueImagenData }
  | { id: string; tipo: "tabla"; data: BloqueTablaData }
  | { id: string; tipo: "separador"; data: BloqueSeparadorData }

// ─── Metadatos curriculares (reutilizado de rúbricas) ───────────────────────

export interface MetadatosCurricularesEval {
  objetivos: string[]            // OA + descripción
  indicadores: string[]
  objetivosTransversales: string[]
}

export function metadatosCurricularesVaciosEval(): MetadatosCurricularesEval {
  return { objetivos: [], indicadores: [], objetivosTransversales: [] }
}

// ─── Re-export tipo OA ──────────────────────────────────────────────────────

export function metadatosDesdeOAsEval(oas: OAEditado[] | undefined): MetadatosCurricularesEval {
  const objetivos: string[] = []
  const indicadores: string[] = []
  const objetivosTransversales: string[] = []

  ;(oas || []).forEach((oa) => {
    if (!oa.seleccionado) return
    const numero = typeof oa.numero === "number" ? ` ${oa.numero}` : ""
    const label = oa.tipo === "oat" ? `OAA${numero}` : `OA${numero}`
    const texto = `${label}: ${oa.descripcion}`.trim()
    if (oa.tipo === "oat") {
      objetivosTransversales.push(texto)
    } else {
      objetivos.push(texto)
    }
    ;(oa.indicadores || [])
      .filter((indicador) => indicador.seleccionado)
      .forEach((indicador) => indicadores.push(`${label}: ${indicador.texto}`))
  })

  return { objetivos, indicadores, objetivosTransversales }
}

export function stripUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value !== null && typeof value === "object" &&
      (value as any)._methodName === undefined &&
      typeof (value as any).toDate !== "function" &&
      !(value?.constructor?.name?.includes("Timestamp"))) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out
  }
  return value
}

export type { OAEditado }
