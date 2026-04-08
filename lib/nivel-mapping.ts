import { db, auth } from "@/lib/firebase"
import { doc, getDoc, setDoc, getDocs, collection } from "firebase/firestore"

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

// All possible curriculum levels (reference only)
export const NIVELES_CURRICULARES = [
  "1ro Básico",
  "2do Básico",
  "3ro Básico",
  "4to Básico",
  "5to Básico",
  "6to Básico",
  "7mo Básico",
  "8vo Básico",
  "1ro Medio",
  "2do Medio",
  "3ro Medio",
  "4to Medio",
]

// Mapping: { "4° A": "4to Básico", "1° A": "1ro Básico", ... }
export type NivelMapping = Record<string, string>

export async function cargarNivelMapping(): Promise<NivelMapping> {
  const uid = getUid()
  const ref = doc(db, "users", uid, "configuracion", "nivel_mapping")
  const snap = await getDoc(ref)
  if (!snap.exists()) return {}
  return (snap.data()?.mapping ?? {}) as NivelMapping
}

export async function guardarNivelMapping(mapping: NivelMapping): Promise<void> {
  const uid = getUid()
  const ref = doc(db, "users", uid, "configuracion", "nivel_mapping")
  await setDoc(ref, { mapping })
}

/**
 * Returns the curriculum level for a course, or null if not configured.
 * Previously returned "1ro Básico" by default — now returns null to avoid
 * showing wrong data when the user hasn't set up the mapping yet.
 */
export function resolveNivel(curso: string, mapping: NivelMapping): string | null {
  return mapping[curso] ?? null
}

/**
 * Reads the public `curriculo` collection in Firestore and returns
 * the list of curriculum levels that actually have uploaded data.
 * DocId format: "musica_4to_basico" → label "4to Básico"
 */
export async function getNivelesDisponibles(asignatura: string): Promise<string[]> {
  const snap = await getDocs(collection(db, "curriculo"))
  const prefix = asignatura
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "") + "_"

  const niveles: string[] = []
  snap.docs.forEach(d => {
    const id = d.id // e.g. "musica_4to_basico"
    if (!id.startsWith(prefix)) return
    const nivelRaw = id.slice(prefix.length) // "4to_basico"
    // Match against NIVELES_CURRICULARES by normalizing
    const match = NIVELES_CURRICULARES.find(n =>
      n.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^a-z0-9_]/g, "") === nivelRaw
    )
    if (match) niveles.push(match)
  })
  return niveles.sort((a, b) => NIVELES_CURRICULARES.indexOf(a) - NIVELES_CURRICULARES.indexOf(b))
}

