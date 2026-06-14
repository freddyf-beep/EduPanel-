// ═══════════════════════════════════════════════════════════════════════════
// edu-doc — Helpers compartidos para documentos educativos evaluativos
// ─────────────────────────────────────────────────────────────────────────
// Usado por `lib/pruebas.ts` y `lib/guias.ts` (y reutilizable por futuras
// plantillas de evaluación). Centraliza:
//
//   • Acceso Firestore tipado al espacio `users/{uid}/...`.
//   • Normalización de metadatos curriculares y listas de strings.
//   • `stripUndefined` recursivo (Firestore rechaza `undefined`).
//   • Resolución curricular: matching de `unidadNombre` contra el banco
//     curricular y carga de OAs desde la unidad.
//   • Re-exports de tipos y fábricas de `lib/evaluaciones-tipos`.
// ═══════════════════════════════════════════════════════════════════════════

import { db, auth } from "@/lib/firebase"
import { doc, collection } from "firebase/firestore"
import {
  getUnidadCompleta,
  getUnidades,
  initOAs,
  mergeOAs,
  cargarVerUnidad,
} from "@/lib/curriculo"
import { getCurriculoNivel, normalizeKeyPart } from "@/lib/shared"
import type { OAEditado } from "@/lib/curriculo"
import type {
  BloqueContenido,
  MetadatosCurricularesEval,
} from "@/lib/evaluaciones-tipos"
import { metadatosCurricularesVaciosEval } from "@/lib/evaluaciones-tipos"

export { metadatosCurricularesVaciosEval }
export type { BloqueContenido, MetadatosCurricularesEval, OAEditado }

// ─── Helpers Firestore ──────────────────────────────────────────────────────

export function getCurrentUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

export function userDoc(col: string, id: string) {
  return doc(db, "users", getCurrentUid(), col, id)
}

export function userCol(col: string) {
  return collection(db, "users", getCurrentUid(), col)
}

// ─── Normalización ──────────────────────────────────────────────────────────

export function sortByOrder<T extends { orden?: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aOrden = typeof a.orden === "number" ? a.orden : Number.MAX_SAFE_INTEGER
    const bOrden = typeof b.orden === "number" ? b.orden : Number.MAX_SAFE_INTEGER
    return aOrden - bOrden
  })
}

export function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

export function normalizeMetadatos(
  v?: MetadatosCurricularesEval,
): MetadatosCurricularesEval {
  return {
    objetivos: normalizeStringList(v?.objetivos),
    indicadores: normalizeStringList(v?.indicadores),
    objetivosTransversales: normalizeStringList(v?.objetivosTransversales),
  }
}

/** Elimina `undefined` recursivamente para que Firestore no rechace el payload. */
export function stripUndefined(value: any): any {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (
    value !== null &&
    typeof value === "object" &&
    (value as any)._methodName === undefined &&
    typeof (value as any).toDate !== "function" &&
    !(value?.constructor?.name?.includes("Timestamp"))
  ) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = stripUndefined(v)
    }
    return out
  }
  return value
}

// ─── Resolución curricular (común a cualquier documento evaluativo) ────────

function normalizeCompareText(value: string): string {
  return normalizeKeyPart(value).replace(/^unidad_/, "")
}

function extraerNumeroUnidad(value?: string): number | null {
  if (!value) return null
  const match = value.match(/unidad\s*(\d+)/i)
  if (!match) return null
  const numero = Number.parseInt(match[1], 10)
  return Number.isFinite(numero) ? numero : null
}

function mergeUnique(target: string[], values: string[]) {
  values.forEach(value => {
    const limpio = value.trim()
    if (limpio && !target.includes(limpio)) target.push(limpio)
  })
}

export interface ResolucionCurricular {
  metadatosCurriculares: MetadatosCurricularesEval
  unidadId?: string
  unidadNombre?: string
  resolvedFromDatabase: boolean
}

export interface ResolverMetadatosInput {
  asignatura: string
  curso: string
  unidadNombre?: string
  metadatosCurriculares?: MetadatosCurricularesEval
}

/**
 * Resuelve los metadatos curriculares a partir del `unidadNombre` declarado en
 * el documento. Si no hay match en el banco curricular, devuelve el fallback
 * (los metadatos ya presentes en el documento) con `resolvedFromDatabase=false`.
 */
export async function resolverMetadatosCurriculares(
  input: ResolverMetadatosInput,
): Promise<ResolucionCurricular> {
  const fallback = normalizeMetadatos(input.metadatosCurriculares)
  const nivel = await getCurriculoNivel(input.curso)
  const unidades = await getUnidades(input.asignatura, nivel)
  if (!unidades.length) {
    return { metadatosCurriculares: fallback, resolvedFromDatabase: false }
  }

  const unidadNumero = extraerNumeroUnidad(input.unidadNombre)
  const unidadNombreComp = input.unidadNombre
    ? normalizeCompareText(input.unidadNombre)
    : ""

  const match = unidades.find(unidad => {
    if (unidadNumero !== null && unidad.numero_unidad === unidadNumero) return true
    const nombreComp = normalizeCompareText(unidad.nombre_unidad || "")
    return (
      !!unidadNombreComp &&
      (nombreComp === unidadNombreComp ||
        nombreComp.includes(unidadNombreComp) ||
        unidadNombreComp.includes(nombreComp))
    )
  })

  if (!match) {
    return { metadatosCurriculares: fallback, resolvedFromDatabase: false }
  }

  const completa = await getUnidadCompleta(input.asignatura, nivel, match.id)
  if (!completa) {
    return { metadatosCurriculares: fallback, resolvedFromDatabase: false }
  }

  const objetivos: string[] = []
  const indicadores: string[] = []
  const objetivosTransversales: string[] = []

  ;(completa.objetivos_aprendizaje || []).forEach(oa => {
    const descripcion = oa.descripcion?.trim()
    const isOAT = String(oa.tipo || "").toUpperCase() === "OAT"

    if (descripcion) {
      const texto = `${isOAT ? "OAA" : "OA"} ${oa.numero}: ${descripcion}`
      if (isOAT) objetivosTransversales.push(texto)
      else objetivos.push(texto)
    }

    if (!isOAT) {
      mergeUnique(
        indicadores,
        (oa.indicadores || []).map(i => i.trim()).filter(Boolean),
      )
    }
  })

  return {
    metadatosCurriculares: {
      objetivos: objetivos.length ? objetivos : fallback.objetivos,
      indicadores: indicadores.length ? indicadores : fallback.indicadores,
      objetivosTransversales: objetivosTransversales.length
        ? objetivosTransversales
        : fallback.objetivosTransversales,
    },
    unidadId: completa.id,
    unidadNombre: completa.nombre_unidad || input.unidadNombre,
    resolvedFromDatabase: true,
  }
}

/**
 * Carga OAs para una unidad combinando: banco curricular base + override del
 * usuario en `ver_unidad` + overrides locales del documento. Si la unidad no
 * existe, devuelve `oasExistentes` (o `[]`).
 */
export async function cargarOAsParaDocumento(
  asignatura: string,
  curso: string,
  unidadId: string,
  oasExistentes?: OAEditado[],
): Promise<OAEditado[]> {
  const nivel = await getCurriculoNivel(curso)
  const unidad = await getUnidadCompleta(asignatura, nivel, unidadId)
  if (!unidad) return oasExistentes ?? []

  const base = initOAs(unidad, asignatura)
  let verUnidadOas: OAEditado[] = []
  try {
    const guardada = await cargarVerUnidad(asignatura, curso, unidadId)
    verUnidadOas = guardada?.oas ?? []
  } catch {
    // Sin override guardado: continuamos con el base.
  }

  const merged = mergeOAs(base, verUnidadOas)
  if (oasExistentes && oasExistentes.length > 0) {
    return mergeOAs(merged, oasExistentes)
  }
  return merged
}
