// ═══════════════════════════════════════════════════════════════════════════
// Snapshots de versiones (pruebas y guías)
// ─────────────────────────────────────────────────────────────────────────
// Cada snapshot es una copia inmutable del JSON completo de una PruebaTemplate
// o GuiaTemplate, almacenado bajo:
//
//   users/{uid}/{pruebas|guias}/{docId}/snapshots/{snapId}
//
// Política de retención (cap rolling): se conservan los últimos
// `SNAPSHOT_CAP` (20) snapshots por documento. Al crear uno nuevo, los más
// antiguos por encima del cap son eliminados automáticamente en batch.
//
// No modifica el modelo de pruebas ni guías; vive en su propia subcolección.
// ═══════════════════════════════════════════════════════════════════════════

import { db, auth } from "@/lib/firebase"
import {
  collection,
  doc,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from "firebase/firestore"
import type { PruebaTemplate } from "@/lib/pruebas"
import type { GuiaTemplate } from "@/lib/guias"

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Obtiene el uid del usuario autenticado o lanza un error en español. */
function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

/**
 * Limpia recursivamente las propiedades `undefined` de un objeto antes de
 * persistirlo en Firestore (Firestore rechaza `undefined`). Preserva
 * `Timestamp` y sentinels (`serverTimestamp()`).
 */
function stripUndefined(value: any): any {
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

// ─── Tipos públicos ─────────────────────────────────────────────────────────

/** Tipo de documento al que pertenece el snapshot. */
export type TipoDocumento = "pruebas" | "guias"

/** Snapshot inmutable de un documento (prueba o guía). */
export interface Snapshot<T = PruebaTemplate | GuiaTemplate> {
  /** ID generado por Firestore (addDoc). */
  id: string
  /** Identificador del autor del snapshot (uid o nombre legible). */
  autor: string
  /** Timestamp del servidor. Puede ser `null` mientras Firestore lo resuelve. */
  timestamp: Timestamp | null
  /** Copia completa del JSON del documento al momento del guardado. */
  payload: T
}

/** Cantidad máxima de snapshots conservados por documento. */
export const SNAPSHOT_CAP = 20

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Crea un snapshot inmutable del documento (`payload`) en la subcolección
 * `users/{uid}/{tipo}/{docId}/snapshots`.
 *
 * Tras agregarlo, aplica la política de cap rolling: si la cantidad total de
 * snapshots supera `SNAPSHOT_CAP`, elimina los más antiguos en un único batch.
 *
 * @param tipo  Tipo del documento padre (`"pruebas"` o `"guias"`).
 * @param docId ID del documento padre.
 * @param payload JSON completo de la prueba o guía a versionar.
 * @param autor Identificador del autor (uid o nombre).
 * @returns ID del snapshot recién creado.
 */
export async function crearSnapshot(
  tipo: TipoDocumento,
  docId: string,
  payload: PruebaTemplate | GuiaTemplate,
  autor: string,
): Promise<string> {
  const uid = getUid()
  const snapsCol = collection(db, "users", uid, tipo, docId, "snapshots")

  const ref = await addDoc(
    snapsCol,
    stripUndefined({
      autor,
      timestamp: serverTimestamp(),
      payload,
    }),
  )

  // Cap rolling: si superamos el límite, eliminar los más antiguos en batch.
  try {
    const all = await getDocs(query(snapsCol, orderBy("timestamp", "desc")))
    if (all.size > SNAPSHOT_CAP) {
      const sobrantes = all.docs.slice(SNAPSHOT_CAP)
      const batch = writeBatch(db)
      for (const d of sobrantes) batch.delete(d.ref)
      await batch.commit()
    }
  } catch {
    // El recorte es best-effort: si falla no debe invalidar el snapshot recién
    // creado. El próximo guardado volverá a intentar la limpieza.
  }

  return ref.id
}

/**
 * Carga los snapshots de un documento ordenados por `timestamp` descendente
 * (los más recientes primero), limitados a `SNAPSHOT_CAP`.
 *
 * @param tipo  Tipo del documento padre.
 * @param docId ID del documento padre.
 */
export async function cargarSnapshots(
  tipo: TipoDocumento,
  docId: string,
): Promise<Snapshot[]> {
  const uid = getUid()
  const snapsCol = collection(db, "users", uid, tipo, docId, "snapshots")
  const snap = await getDocs(
    query(snapsCol, orderBy("timestamp", "desc"), limit(SNAPSHOT_CAP)),
  )
  return snap.docs.map((d) => {
    const data = d.data() as {
      autor?: string
      timestamp?: Timestamp | null
      payload?: PruebaTemplate | GuiaTemplate
    }
    return {
      id: d.id,
      autor: data.autor ?? "",
      timestamp: data.timestamp ?? null,
      payload: data.payload as PruebaTemplate | GuiaTemplate,
    }
  })
}

/**
 * Elimina un snapshot puntual de la subcolección.
 *
 * @param tipo   Tipo del documento padre.
 * @param docId  ID del documento padre.
 * @param snapId ID del snapshot a eliminar.
 */
export async function eliminarSnapshot(
  tipo: TipoDocumento,
  docId: string,
  snapId: string,
): Promise<void> {
  const uid = getUid()
  await deleteDoc(doc(db, "users", uid, tipo, docId, "snapshots", snapId))
}
