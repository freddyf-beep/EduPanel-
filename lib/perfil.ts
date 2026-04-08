import { db, auth } from "@/lib/firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

export interface PerfilUsuario {
  tipoProfesor: string
  especialidad: string
  estudios: string
  biografia: string
  updatedAt?: any
}

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

export async function cargarPerfil(): Promise<PerfilUsuario | null> {
  const snap = await getDoc(doc(db, "users", getUid(), "perfil_info", "main"))
  if (!snap.exists()) return null
  return snap.data() as PerfilUsuario
}

export async function guardarPerfil(perfil: Omit<PerfilUsuario, "updatedAt">): Promise<void> {
  await setDoc(doc(db, "users", getUid(), "perfil_info", "main"), {
    ...perfil,
    updatedAt: serverTimestamp()
  })
}
