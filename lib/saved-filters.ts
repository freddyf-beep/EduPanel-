// ═══════════════════════════════════════════════════════════════════════════
// Filtros guardados (Hub Pruebas / Hub Guías)
// ─────────────────────────────────────────────────────────────────────────
// Permite a la docente persistir combinaciones de filtros que usa con
// frecuencia (curso, unidad, tipo y búsqueda) por tab y reutilizarlas con un
// click. Sigue el mismo patrón de persistencia que `lib/pruebas.ts` y
// `lib/guias.ts` (subcolección por usuario), sin tocar esos archivos.
//
// Persistencia: `users/{uid}/savedFilters/{autoId}`
// ═══════════════════════════════════════════════════════════════════════════

import { db, auth } from "@/lib/firebase"
import {
  collection, doc, getDocs, addDoc, deleteDoc,
  query, where, orderBy, serverTimestamp, Timestamp,
} from "firebase/firestore"

// ─── Helpers Firestore (replican el patrón de pruebas.ts/guias.ts) ─────────

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

function userDoc(col: string, id: string) {
  return doc(db, "users", getUid(), col, id)
}

function userCol(col: string) {
  return collection(db, "users", getUid(), col)
}

/** Elimina recursivamente claves con valor `undefined` (Firestore no las acepta). */
function stripUndefined(value: any): any {
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

// ─── Tipos ────────────────────────────────────────────────────────────────

/** Tab al que aplica un filtro guardado. */
export type FiltroTab = "pruebas" | "guias"

/**
 * Combinación de filtros que la docente decide persistir para reutilizar.
 *
 * - `nombre` se valida con un máximo de 60 caracteres al guardar.
 * - `tab` discrimina entre Hub_Pruebas y Hub_Guias para que cada hub muestre
 *   solo los filtros pertinentes.
 * - Los demás campos son opcionales: un filtro puede aplicar solamente a
 *   `curso` y `unidadId`, sin restringir tipo ni búsqueda.
 */
export interface FiltroGuardado {
  id: string
  nombre: string
  tab: FiltroTab
  curso?: string
  unidadId?: string
  tipo?: string
  busqueda?: string
  createdAt?: Timestamp | null
}

/** Longitud máxima permitida para el nombre del filtro guardado. */
export const MAX_NOMBRE_FILTRO = 60

// ─── CRUD ─────────────────────────────────────────────────────────────────

/**
 * Persiste un nuevo filtro guardado en `users/{uid}/savedFilters`.
 *
 * Valida que `nombre` no exceda {@link MAX_NOMBRE_FILTRO} caracteres y no esté
 * vacío. Asigna `createdAt` con `serverTimestamp()` para preservar el orden
 * cronológico al listar.
 *
 * @param filtro Filtro a guardar (sin `id` ni `createdAt`, los asigna Firestore).
 * @returns ID del nuevo documento creado.
 * @throws Error con mensaje en español si la validación de nombre falla.
 */
export async function guardarFiltro(
  filtro: Omit<FiltroGuardado, "id" | "createdAt">,
): Promise<string> {
  const nombre = (filtro.nombre ?? "").trim()
  if (!nombre) {
    throw new Error("El nombre del filtro no puede estar vacío.")
  }
  if (nombre.length > MAX_NOMBRE_FILTRO) {
    throw new Error(
      `El nombre del filtro no puede superar los ${MAX_NOMBRE_FILTRO} caracteres.`,
    )
  }
  if (filtro.tab !== "pruebas" && filtro.tab !== "guias") {
    throw new Error('El campo "tab" debe ser "pruebas" o "guias".')
  }

  const data = stripUndefined({
    nombre,
    tab: filtro.tab,
    curso: filtro.curso,
    unidadId: filtro.unidadId,
    tipo: filtro.tipo,
    busqueda: filtro.busqueda,
    createdAt: serverTimestamp(),
  })
  const ref = await addDoc(userCol("savedFilters"), data)
  return ref.id
}

/**
 * Carga todos los filtros guardados del usuario, ordenados por fecha
 * descendente (los más recientes primero).
 *
 * @returns Lista completa de filtros guardados.
 */
export async function cargarFiltros(): Promise<FiltroGuardado[]> {
  const snap = await getDocs(
    query(userCol("savedFilters"), orderBy("createdAt", "desc")),
  )
  return snap.docs.map(d => mapDoc(d.id, d.data()))
}

/**
 * Carga los filtros guardados que aplican a un tab específico (Pruebas o
 * Guías), ordenados por fecha descendente.
 *
 * @param tab Tab del hub que pide la lista (`"pruebas"` o `"guias"`).
 * @returns Lista de filtros guardados pertenecientes a ese tab.
 */
export async function cargarFiltrosPorTab(tab: FiltroTab): Promise<FiltroGuardado[]> {
  const snap = await getDocs(
    query(
      userCol("savedFilters"),
      where("tab", "==", tab),
      orderBy("createdAt", "desc"),
    ),
  )
  return snap.docs.map(d => mapDoc(d.id, d.data()))
}

/**
 * Elimina un filtro guardado por su ID.
 *
 * @param id Identificador del documento en `users/{uid}/savedFilters`.
 */
export async function eliminarFiltro(id: string): Promise<void> {
  await deleteDoc(userDoc("savedFilters", id))
}

// ─── Utilidades internas ──────────────────────────────────────────────────

function mapDoc(id: string, raw: any): FiltroGuardado {
  const tab = raw?.tab === "guias" ? "guias" : "pruebas"
  return {
    id,
    nombre: typeof raw?.nombre === "string" ? raw.nombre : "",
    tab,
    curso: typeof raw?.curso === "string" ? raw.curso : undefined,
    unidadId: typeof raw?.unidadId === "string" ? raw.unidadId : undefined,
    tipo: typeof raw?.tipo === "string" ? raw.tipo : undefined,
    busqueda: typeof raw?.busqueda === "string" ? raw.busqueda : undefined,
    createdAt: (raw?.createdAt as Timestamp | null) ?? null,
  }
}
