import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "./firebase"
import { getAuth } from "firebase/auth"

export interface Estudiante {
  id: string
  nombre: string
}

export async function cargarEstudiantes(curso: string): Promise<Estudiante[]> {
  const auth = getAuth()
  const user = auth.currentUser
  if (!user) throw new Error("No autenticado")

  const cursoId = curso.toLowerCase().replace(/[^a-z0-9]/g, "_")
  const ref = doc(db, `users/${user.uid}/estudiantes`, cursoId)
  
  try {
    const snap = await getDoc(ref)
    if (snap.exists()) {
      return (snap.data().alumnos || []) as Estudiante[]
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

  const cursoId = curso.toLowerCase().replace(/[^a-z0-9]/g, "_")
  const ref = doc(db, `users/${user.uid}/estudiantes`, cursoId)
  
  await setDoc(ref, { alumnos })
}
