import { db, auth } from "@/lib/firebase"
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

export function userDoc(col: string, id: string) {
  return doc(db, "users", getUid(), col, id)
}

export interface ClaseHorario {
  uid: string
  resumen: string
  dia: "Lunes" | "Martes" | "Miércoles" | "Jueves" | "Viernes"
  horaInicio: string
  horaFin: string
  color: string
  tipo: "clase" | "taller" | "consejo" | "orientacion"
  hasta?: string
}

export interface HorarioGuardado {
  clases: ClaseHorario[]
  updatedAt?: any
}

// ─── Horario Dinámico del Profesor ───

export async function guardarHorarioSemanal(clases: ClaseHorario[]): Promise<void> {
  await setDoc(userDoc("configuracion", "horario"), {
    clases,
    updatedAt: serverTimestamp()
  })
}

export async function cargarHorarioSemanal(): Promise<ClaseHorario[]> {
  const snap = await getDoc(userDoc("configuracion", "horario"))
  if (!snap.exists()) return []
  return (snap.data() as HorarioGuardado).clases || []
}

export function getDiaActual(): string {
  const d = new Date().getDay()
  const map: Record<number, string> = { 1:"Lunes", 2:"Martes", 3:"Miércoles", 4:"Jueves", 5:"Viernes" }
  return map[d] || "Lunes"
}

// ─── Estado de Clases Completadas Diarias ───
export async function guardarEstadoClases(estado: Record<string, boolean>, fecha: string): Promise<void> {
  await setDoc(userDoc("horario_estado", fecha), {
    estado,
    updatedAt: serverTimestamp()
  })
}

export async function cargarEstadoClases(fecha: string): Promise<Record<string, boolean>> {
  const snap = await getDoc(userDoc("horario_estado", fecha))
  if (!snap.exists()) return {}
  return (snap.data() as any).estado || {}
}
