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
