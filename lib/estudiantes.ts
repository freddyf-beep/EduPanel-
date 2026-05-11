import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "./firebase"
import { getAuth } from "firebase/auth"
import { buildCursoId } from "./shared"

export interface Estudiante {
  id: string
  nombre: string
  orden?: number
  pie?: boolean
  pieDiagnostico?: string
  pieEspecialista?: string
  pieNotas?: string
}

function legacyCursoId(curso: string): string {
  return curso.toLowerCase().replace(/[^a-z0-9]/g, "_")
}

function parseOrden(value: unknown): number | null {
  const raw = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
  if (!Number.isFinite(raw)) return null
  const normalized = Math.trunc(raw)
  return normalized >= 1 ? normalized : null
}

export function compareEstudiantes(
  a: Pick<Estudiante, "orden" | "nombre">,
  b: Pick<Estudiante, "orden" | "nombre">
): number {
  const ordenA = parseOrden(a.orden)
  const ordenB = parseOrden(b.orden)

  if (ordenA !== null && ordenB !== null && ordenA !== ordenB) {
    return ordenA - ordenB
  }
  if (ordenA !== null && ordenB === null) return -1
  if (ordenA === null && ordenB !== null) return 1

  return a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
}

export function normalizeEstudiantes(alumnos: Estudiante[]): Estudiante[] {
  return alumnos
    .map((alumno, index) => ({
      ...alumno,
      orden: parseOrden(alumno.orden) ?? index + 1,
    }))
    .sort(compareEstudiantes)
}

export async function cargarEstudiantes(curso: string): Promise<Estudiante[]> {
  const auth = getAuth()
  const user = auth.currentUser
  if (!user) throw new Error("No autenticado")

  const basePath = `users/${user.uid}/estudiantes`
  const cursoId = buildCursoId(curso)
  
  try {
    let snap = await getDoc(doc(db, basePath, cursoId))
    if (!snap.exists()) {
      const legacyId = legacyCursoId(curso)
      if (legacyId !== cursoId) {
        snap = await getDoc(doc(db, basePath, legacyId))
      }
    }
    if (snap.exists()) {
      return normalizeEstudiantes((snap.data().alumnos || []) as Estudiante[])
    }
  } catch (error) {
    console.error("Error cargando estudiantes para curso", curso, error)
  }
  return []
}

export async function guardarEstudiantes(curso: string, alumnos: Estudiante[]): Promise<void> {
  const auth = getAuth()
  const user = auth.currentUser
  if (!user) throw new Error("No autenticado")

  const cursoId = buildCursoId(curso)
  const ref = doc(db, `users/${user.uid}/estudiantes`, cursoId)

  await setDoc(ref, { alumnos: normalizeEstudiantes(alumnos) })
}

// ─────────────────────────────────────────────────────────────────────────────
//   Importación de estudiantes desde JSON (acepta formato Gemini, arrays, etc.)
// ─────────────────────────────────────────────────────────────────────────────

export type ImportEstudianteData = {
  nombre: string
  orden?: number
  matchKeys: string[]
}

function toCleanString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""
}

function joinNameParts(parts: unknown[]): string {
  return parts.map(toCleanString).filter(Boolean).join(" ").trim()
}

function buildStudentMatchKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim()
}

function getImportedStudentNames(item: unknown): string[] {
  if (typeof item === "string") {
    const direct = toCleanString(item)
    return direct ? [direct] : []
  }
  if (!item || typeof item !== "object") return []
  const row = item as Record<string, unknown>
  const directName = [
    row.nombre, row.name, row.estudiante, row.student, row.alumno,
    row.fullName, row.full_name,
  ].map(toCleanString).find(Boolean)
  if (directName) return [directName]

  const nombres = joinNameParts([row.nombre1, row.nombre2, row.nombres, row.firstName, row.first_name])
  const apellidos = joinNameParts([row.apellido1, row.apellido2, row.apellidos, row.lastName, row.last_name])
  const candidates = [
    nombres && apellidos ? `${nombres} ${apellidos}` : "",
    nombres && apellidos ? `${apellidos}, ${nombres}` : "",
    nombres && apellidos ? `${apellidos} ${nombres}` : "",
    nombres || apellidos,
  ]
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const cleaned = toCleanString(candidate)
    if (!cleaned) return false
    const key = buildStudentMatchKey(cleaned)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function getStoredStudentMatchKeys(nombre: string): string[] {
  const cleaned = toCleanString(nombre)
  if (!cleaned) return []
  const candidates = [cleaned]
  const parts = cleaned.split(",").map((part) => toCleanString(part)).filter(Boolean)
  if (parts.length === 2) {
    candidates.push(`${parts[1]} ${parts[0]}`)
    candidates.push(`${parts[0]} ${parts[1]}`)
  }
  const seen = new Set<string>()
  return candidates.map(buildStudentMatchKey).filter((key) => {
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function parseImportedStudentOrder(item: unknown): number | undefined {
  if (!item || typeof item !== "object") return undefined
  const row = item as Record<string, unknown>
  const raw = [row.numero, row.orden, row.order, row.index, row.n]
    .find((value) => value !== undefined && value !== null && value !== "")
  if (raw === undefined) return undefined
  const parsed = typeof raw === "number" ? raw : Number(raw)
  if (!Number.isFinite(parsed)) return undefined
  const normalized = Math.trunc(parsed)
  return normalized >= 1 ? normalized : undefined
}

export function extractImportedStudents(payload: unknown): ImportEstudianteData[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? ["estudiantes", "alumnos", "students", "data", "items"]
          .map((key) => (payload as Record<string, unknown>)[key])
          .find(Array.isArray) || []
      : []
  if (!Array.isArray(source)) return []

  const seen = new Set<string>()
  const estudiantes: ImportEstudianteData[] = []
  for (const item of source) {
    const nombres = getImportedStudentNames(item)
    if (nombres.length === 0) continue
    const matchKeys = nombres.map(buildStudentMatchKey)
    if (matchKeys.some((key) => seen.has(key))) continue
    matchKeys.forEach((key) => seen.add(key))
    estudiantes.push({
      nombre: nombres[0],
      orden: parseImportedStudentOrder(item),
      matchKeys,
    })
  }
  return estudiantes
}

export function getNextStudentOrder(estudiantes: Estudiante[]): number {
  const max = estudiantes.reduce((currentMax, estudiante) => {
    const orden = typeof estudiante.orden === "number" && Number.isFinite(estudiante.orden)
      ? estudiante.orden
      : 0
    return Math.max(currentMax, orden)
  }, 0)
  return max + 1
}

export type ImportResultado = {
  agregados: number
  actualizados: number
  resultado: Estudiante[]
}

/**
 * Mezcla estudiantes importados con los existentes:
 * - Si un nombre ya existe (por matchKeys), actualiza nombre y orden si cambió.
 * - Si es nuevo, lo agrega con orden auto-incrementado.
 */
export function mergeImportedStudents(
  existentes: Estudiante[],
  importados: ImportEstudianteData[]
): ImportResultado {
  const existingByKey = new Map<string, Estudiante>()
  for (const estudiante of existentes) {
    for (const key of getStoredStudentMatchKeys(estudiante.nombre)) {
      existingByKey.set(key, estudiante)
    }
  }
  const next = [...existentes]
  const baseTs = Date.now()
  let nextOrder = getNextStudentOrder(existentes)
  let agregados = 0
  let actualizados = 0

  for (const importado of importados) {
    const existing = importado.matchKeys
      .map((key) => existingByKey.get(key))
      .find((s): s is Estudiante => Boolean(s))

    if (existing) {
      const needsName = existing.nombre !== importado.nombre
      const needsOrder = importado.orden !== undefined && importado.orden !== existing.orden
      if (needsName || needsOrder) {
        const idx = next.findIndex((s) => s.id === existing.id)
        if (idx !== -1) {
          const updated = {
            ...existing,
            nombre: importado.nombre,
            orden: importado.orden ?? existing.orden,
          }
          next[idx] = updated
          for (const key of [...importado.matchKeys, ...getStoredStudentMatchKeys(updated.nombre)]) {
            existingByKey.set(key, updated)
          }
          actualizados += 1
        }
      }
      continue
    }

    const nuevo: Estudiante = {
      id: `est_${baseTs}_${agregados}`,
      nombre: importado.nombre,
      orden: importado.orden ?? nextOrder,
    }
    next.push(nuevo)
    for (const key of [...importado.matchKeys, ...getStoredStudentMatchKeys(nuevo.nombre)]) {
      existingByKey.set(key, nuevo)
    }
    agregados += 1
    if (importado.orden === undefined) {
      nextOrder += 1
    } else {
      nextOrder = Math.max(nextOrder, importado.orden + 1)
    }
  }

  return { agregados, actualizados, resultado: next }
}
