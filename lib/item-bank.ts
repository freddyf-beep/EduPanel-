// ═══════════════════════════════════════════════════════════════════════════
// Banco de ítems unificado (pruebas + guías)
// ─────────────────────────────────────────────────────────────────────────
// Repositorio común que permite guardar y reutilizar ítems originados tanto
// de pruebas como de guías. Sigue el mismo patrón de persistencia que
// `lib/pruebas.ts` y `lib/guias.ts` (subcolección por usuario), pero NO los
// modifica: solamente expone CRUD propio en `users/{uid}/itemBank`.
//
// Persistencia: `users/{uid}/itemBank/{autoId}`
// ═══════════════════════════════════════════════════════════════════════════

import { db, auth } from "@/lib/firebase"
import {
  collection, doc, getDocs, getDoc, addDoc, deleteDoc,
  query, where, orderBy, limit, serverTimestamp, Timestamp,
} from "firebase/firestore"
import type { ItemPrueba } from "@/lib/pruebas"
import type { ActividadGuia } from "@/lib/guias"

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

// ─── Tipos ────────────────────────────────────────────────────────────────

export type OrigenItemBank = "prueba" | "guia"

/** Metadatos curriculares del ítem dentro del banco. */
export interface ItemBankMetadata {
  asignatura: string
  curso: string
  oas: string[]
  origen: OrigenItemBank
  autor: string
  /** Timestamp del lado servidor (se asigna al guardar). */
  timestamp?: Timestamp | null
}

/** Entrada del banco: payload original (ítem de prueba o actividad de guía) + metadata. */
export interface ItemBankEntry {
  id: string
  payload: ItemPrueba | ActividadGuia
  metadata: ItemBankMetadata
  createdAt?: Timestamp | null
}

/**
 * Filtros para `cargarItemsDelBanco`.
 * - `asignatura` y `curso` se aplican en Firestore (server-side).
 * - `tipo`, `oa` y `busqueda` se aplican en cliente.
 */
export interface ItemBankFilter {
  tipo?: string
  asignatura?: string
  curso?: string
  /** Código de un OA específico; coincide si `metadata.oas` lo incluye o si `payload.oaVinculado` lo iguala. */
  oa?: string
  /** Substring case-insensitive sobre el enunciado del ítem. */
  busqueda?: string
}

// ─── Utilidades internas ──────────────────────────────────────────────────

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

function getEnunciado(payload: ItemPrueba | ActividadGuia): string {
  const e = (payload as { enunciado?: unknown })?.enunciado
  return typeof e === "string" ? e : ""
}

function getTipo(payload: ItemPrueba | ActividadGuia): string {
  const t = (payload as { tipo?: unknown })?.tipo
  return typeof t === "string" ? t : ""
}

function getOaVinculado(payload: ItemPrueba | ActividadGuia): string | undefined {
  const oa = (payload as { oaVinculado?: unknown })?.oaVinculado
  return typeof oa === "string" ? oa : undefined
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

/**
 * Guarda un ítem (de prueba o guía) en el banco unificado del usuario.
 *
 * Crea un documento en `users/{uid}/itemBank` con un ID autogenerado y
 * retorna dicho ID. El campo `createdAt` y `metadata.timestamp` se setean
 * con `serverTimestamp()` para mantener orden cronológico consistente.
 *
 * @param payload Ítem original (`ItemPrueba` o `ActividadGuia`).
 * @param metadata Datos curriculares y de origen.
 * @returns ID del nuevo documento creado.
 */
export async function guardarItemAlBanco(
  payload: ItemPrueba | ActividadGuia,
  metadata: ItemBankMetadata,
): Promise<string> {
  const data = stripUndefined({
    payload,
    metadata: {
      ...metadata,
      oas: Array.isArray(metadata.oas) ? metadata.oas.filter(Boolean) : [],
      timestamp: serverTimestamp(),
    },
    createdAt: serverTimestamp(),
  })
  const ref = await addDoc(userCol("itemBank"), data)
  return ref.id
}

/**
 * Carga los ítems del banco aplicando filtros opcionales.
 *
 * Filtros server-side (Firestore): `asignatura`, `curso`.
 * Filtros client-side: `tipo` (sobre `payload.tipo`), `oa` (incluido en
 * `metadata.oas` o igual a `payload.oaVinculado`) y `busqueda` (substring
 * case-insensitive sobre `payload.enunciado`).
 *
 * Ordena por `createdAt desc` y limita a 200 resultados por defecto.
 *
 * @param filtros Filtros opcionales para acotar la búsqueda.
 * @returns Lista de entradas del banco que cumplen los filtros.
 */
export async function cargarItemsDelBanco(
  filtros?: ItemBankFilter,
): Promise<ItemBankEntry[]> {
  const col = userCol("itemBank")
  const constraints: ReturnType<typeof where>[] = []
  if (filtros?.asignatura) {
    constraints.push(where("metadata.asignatura", "==", filtros.asignatura))
  }
  if (filtros?.curso) {
    constraints.push(where("metadata.curso", "==", filtros.curso))
  }

  const q = query(
    col,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(200),
  )
  const snap = await getDocs(q)

  const entries: ItemBankEntry[] = snap.docs.map(d => {
    const raw = d.data() as Partial<ItemBankEntry>
    return {
      id: d.id,
      payload: raw.payload as ItemPrueba | ActividadGuia,
      metadata: (raw.metadata ?? {
        asignatura: "",
        curso: "",
        oas: [],
        origen: "prueba",
        autor: "",
      }) as ItemBankMetadata,
      createdAt: (raw.createdAt as Timestamp | null) ?? null,
    }
  })

  // Filtros cliente
  const tipo = filtros?.tipo?.trim()
  const oa = filtros?.oa?.trim()
  const busqueda = filtros?.busqueda?.trim().toLowerCase()

  return entries.filter(entry => {
    if (!entry.payload) return false
    if (tipo && getTipo(entry.payload) !== tipo) return false
    if (oa) {
      const enMetadata = Array.isArray(entry.metadata?.oas) && entry.metadata.oas.includes(oa)
      const enPayload = getOaVinculado(entry.payload) === oa
      if (!enMetadata && !enPayload) return false
    }
    if (busqueda) {
      const enunciado = getEnunciado(entry.payload).toLowerCase()
      if (!enunciado.includes(busqueda)) return false
    }
    return true
  })
}

/**
 * Carga una entrada puntual del banco por su ID.
 *
 * @param id ID del documento en `users/{uid}/itemBank`.
 * @returns La entrada correspondiente o `null` si no existe.
 */
export async function cargarItemDelBanco(id: string): Promise<ItemBankEntry | null> {
  const snap = await getDoc(userDoc("itemBank", id))
  if (!snap.exists()) return null
  const raw = snap.data() as Partial<ItemBankEntry>
  return {
    id: snap.id,
    payload: raw.payload as ItemPrueba | ActividadGuia,
    metadata: (raw.metadata ?? {
      asignatura: "",
      curso: "",
      oas: [],
      origen: "prueba",
      autor: "",
    }) as ItemBankMetadata,
    createdAt: (raw.createdAt as Timestamp | null) ?? null,
  }
}

/**
 * Elimina permanentemente un ítem del banco del usuario.
 *
 * @param id ID del documento a eliminar.
 */
export async function eliminarItemDelBanco(id: string): Promise<void> {
  await deleteDoc(userDoc("itemBank", id))
}
