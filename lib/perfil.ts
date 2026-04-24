import { db, auth } from "@/lib/firebase"
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore"

export interface PerfilUsuario {
  tipoProfesor: string
  especialidad: string
  estudios: string
  biografia: string
  updatedAt?: any
}

export interface InfoColegio {
  nombre: string          // Ej: "Escuela Andrew Jackson"
  logoBase64?: string     // Imagen en base64 (data:image/jpeg;base64,...)
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

export async function cargarInfoColegio(): Promise<InfoColegio | null> {
  const snap = await getDoc(doc(db, "users", getUid(), "perfil_info", "colegio"))
  if (!snap.exists()) return null
  return snap.data() as InfoColegio
}

export async function guardarInfoColegio(info: Omit<InfoColegio, "updatedAt">): Promise<void> {
  await setDoc(doc(db, "users", getUid(), "perfil_info", "colegio"), {
    ...info,
    updatedAt: serverTimestamp()
  })
}
