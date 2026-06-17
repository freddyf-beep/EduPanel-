import { db, auth } from "@/lib/firebase"
import { doc, getDoc, setDoc, getDocs, collection } from "firebase/firestore"

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

// All possible curriculum levels (reference only)
export const NIVELES_CURRICULARES = [
  "Párvulos",
  "Sala Cuna",
  "Nivel Medio",
  "Nivel Transición",
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
export type NivelAsignaturaMapping = Record<string, Record<string, string>>

const ASIGNATURA_MAPPING_PROP = "__asignaturaMapping"

function splitLegacyCompoundKey(key: string): { curso: string; asignatura: string } | null {
  const [curso, asignatura, ...rest] = key.split("|")
  if (rest.length > 0) return null
  const cleanCurso = curso?.trim()
  const cleanAsignatura = asignatura?.trim()
  return cleanCurso && cleanAsignatura ? { curso: cleanCurso, asignatura: cleanAsignatura } : null
}

function cleanNivelMapping(mapping: NivelMapping): NivelMapping {
  const clean: NivelMapping = {}
  for (const [key, value] of Object.entries(mapping || {})) {
    if (!key || key.includes("|") || key === ASIGNATURA_MAPPING_PROP) continue
    if (value) clean[key] = value
  }
  return clean
}

function mergeAsignaturaMapping(mapping: NivelMapping, stored?: NivelAsignaturaMapping): NivelAsignaturaMapping {
  const next: NivelAsignaturaMapping = {}
  for (const [curso, asignaturas] of Object.entries(stored || {})) {
    next[curso] = { ...(asignaturas || {}) }
  }
  for (const [key, value] of Object.entries(mapping || {})) {
    const legacy = splitLegacyCompoundKey(key)
    if (!legacy || !value) continue
    if (!next[legacy.curso]) next[legacy.curso] = {}
    next[legacy.curso][legacy.asignatura] = value
  }
  return next
}

function attachAsignaturaMapping(mapping: NivelMapping, asignaturaMapping: NivelAsignaturaMapping): NivelMapping {
  Object.defineProperty(mapping, ASIGNATURA_MAPPING_PROP, {
    value: asignaturaMapping,
    enumerable: false,
    configurable: true,
  })
  return mapping
}

export function getNivelAsignaturaMapping(mapping: NivelMapping): NivelAsignaturaMapping {
  return ((mapping as any)[ASIGNATURA_MAPPING_PROP] ?? {}) as NivelAsignaturaMapping
}

export function setNivelAsignaturaLocal(
  mapping: NivelMapping,
  curso: string,
  asignatura: string,
  nivel: string
): NivelMapping {
  const clean = cleanNivelMapping(mapping)
  const asignaturaMapping = mergeAsignaturaMapping(mapping, getNivelAsignaturaMapping(mapping))
  const cursoKey = curso.trim()
  const asignaturaKey = asignatura.trim()
  if (!cursoKey || !asignaturaKey) return attachAsignaturaMapping(clean, asignaturaMapping)
  if (!asignaturaMapping[cursoKey]) asignaturaMapping[cursoKey] = {}
  if (nivel) asignaturaMapping[cursoKey][asignaturaKey] = nivel
  else delete asignaturaMapping[cursoKey][asignaturaKey]
  if (Object.keys(asignaturaMapping[cursoKey]).length === 0) delete asignaturaMapping[cursoKey]
  return attachAsignaturaMapping(clean, asignaturaMapping)
}

export function setNivelCursoLocal(mapping: NivelMapping, curso: string, nivel: string): NivelMapping {
  const clean = cleanNivelMapping(mapping)
  const cursoKey = curso.trim()
  if (cursoKey) {
    if (nivel) clean[cursoKey] = nivel
    else delete clean[cursoKey]
  }
  return attachAsignaturaMapping(clean, mergeAsignaturaMapping(mapping, getNivelAsignaturaMapping(mapping)))
}

export function removeCursoNivelLocal(mapping: NivelMapping, curso: string): NivelMapping {
  const clean = cleanNivelMapping(mapping)
  const asignaturaMapping = mergeAsignaturaMapping(mapping, getNivelAsignaturaMapping(mapping))
  delete clean[curso]
  delete asignaturaMapping[curso]
  return attachAsignaturaMapping(clean, asignaturaMapping)
}

export function renameCursoNivelLocal(mapping: NivelMapping, oldCurso: string, newCurso: string): NivelMapping {
  const clean = cleanNivelMapping(mapping)
  const asignaturaMapping = mergeAsignaturaMapping(mapping, getNivelAsignaturaMapping(mapping))
  const oldKey = oldCurso.trim()
  const newKey = newCurso.trim()
  if (!oldKey || !newKey || oldKey === newKey) return attachAsignaturaMapping(clean, asignaturaMapping)
  if (clean[oldKey]) {
    clean[newKey] = clean[oldKey]
    delete clean[oldKey]
  }
  if (asignaturaMapping[oldKey]) {
    asignaturaMapping[newKey] = { ...asignaturaMapping[oldKey] }
    delete asignaturaMapping[oldKey]
  }
  return attachAsignaturaMapping(clean, asignaturaMapping)
}

// Tipo curricular del curso. Default "oficial" para retrocompatibilidad.
// - "oficial": curso ligado al currículum Mineduc (requiere nivel + OAs)
// - "taller": taller / actividad sin currículum oficial (no requiere nivel)
// - "libre": uso personal del docente, sin asociación curricular
export type TipoCurricular = "oficial" | "taller" | "libre"
export type CursoTipoMap = Record<string, TipoCurricular>

export const NIVELES_PARVULARIA = ["Sala Cuna", "Nivel Medio", "Nivel Transición"] as const

export function isNivelParvularia(nivel?: string | null): boolean {
  return !!nivel && NIVELES_PARVULARIA.includes(nivel as (typeof NIVELES_PARVULARIA)[number])
}

export async function cargarNivelMapping(): Promise<NivelMapping> {
  const uid = getUid()
  const ref = doc(db, "users", uid, "configuracion", "nivel_mapping")
  const snap = await getDoc(ref)
  if (!snap.exists()) return {}
  const data = snap.data() || {}
  const mapping = (data.mapping ?? {}) as NivelMapping
  const asignaturaMapping = mergeAsignaturaMapping(mapping, data.asignaturaMapping as NivelAsignaturaMapping | undefined)
  return attachAsignaturaMapping(cleanNivelMapping(mapping), asignaturaMapping)
}

export async function guardarNivelMapping(mapping: NivelMapping): Promise<void> {
  const uid = getUid()
  const ref = doc(db, "users", uid, "configuracion", "nivel_mapping")
  // Preserva otros campos (cursoTipos) si existen
  const existing = await getDoc(ref)
  const data = existing.exists() ? existing.data() : {}
  await setDoc(ref, {
    ...data,
    mapping: cleanNivelMapping(mapping),
    asignaturaMapping: getNivelAsignaturaMapping(mapping),
  })
}

export async function cargarCursoTipos(): Promise<CursoTipoMap> {
  const uid = getUid()
  const ref = doc(db, "users", uid, "configuracion", "nivel_mapping")
  const snap = await getDoc(ref)
  if (!snap.exists()) return {}
  return (snap.data()?.cursoTipos ?? {}) as CursoTipoMap
}

export async function guardarCursoTipos(cursoTipos: CursoTipoMap): Promise<void> {
  const uid = getUid()
  const ref = doc(db, "users", uid, "configuracion", "nivel_mapping")
  const existing = await getDoc(ref)
  const data = existing.exists() ? existing.data() : {}
  await setDoc(ref, { ...data, cursoTipos })
}

/**
 * Devuelve el tipo curricular del curso. Default "oficial" si no está configurado.
 */
export function resolveTipoCurricular(curso: string, tipos: CursoTipoMap): TipoCurricular {
  return tipos[curso] ?? "oficial"
}

/**
 * Returns the curriculum level for a course (and optionally a subject).
 * Uses asignaturaMapping first, then falls back to the course default.
 * Previously returned "1ro Básico" by default — now returns null to avoid
 * showing wrong data when the user hasn't set up the mapping yet.
 */
export function resolveNivel(curso: string, mapping: NivelMapping, asignatura?: string): string | null {
  if (asignatura) {
    const asignaturaMapping = getNivelAsignaturaMapping(mapping)
    if (asignaturaMapping[curso]?.[asignatura]) return asignaturaMapping[curso][asignatura]
  }
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

