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

export type TipoHorario =
  | "clase"           // bloque académico de un curso (requiere resumen=curso)
  | "taller"          // taller académico
  | "consejo"         // consejo de profesores
  | "orientacion"     // hora de orientación / jefatura
  | "almuerzo"        // bloque libre - almuerzo
  | "planificacion"   // bloque libre - tiempo de planificación del docente
  | "recreo"          // bloque libre - recreo
  | "libre"           // bloque libre genérico

export interface ClaseHorario {
  uid: string
  resumen: string
  dia: "Lunes" | "Martes" | "Miércoles" | "Jueves" | "Viernes"
  horaInicio: string
  horaFin: string
  color: string
  tipo: TipoHorario
  hasta?: string
}

export interface HorarioGuardado {
  clases: ClaseHorario[]
  updatedAt?: any
}

/** Tipos que NO representan una clase de un curso (no requieren carga académica). */
const TIPOS_LIBRES: TipoHorario[] = ["almuerzo", "planificacion", "recreo", "libre"]

export function esTipoLibre(tipo: TipoHorario): boolean {
  return TIPOS_LIBRES.includes(tipo)
}

export function agruparHorarioPorCurso(clases: ClaseHorario[]): Map<string, ClaseHorario[]> {
  const ordenDias: Record<string, number> = { Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5 }
  const grupos = new Map<string, ClaseHorario[]>()
  clases.forEach(clase => {
    // Bloques libres (almuerzo, planificación, etc.) no se agrupan como curso.
    if (esTipoLibre(clase.tipo)) return
    const key = clase.resumen.trim()
    if (!key) return
    grupos.set(key, [...(grupos.get(key) || []), clase])
  })
  grupos.forEach((items, key) => {
    grupos.set(key, [...items].sort((a, b) => (ordenDias[a.dia] ?? 99) - (ordenDias[b.dia] ?? 99) || a.horaInicio.localeCompare(b.horaInicio)))
  })
  return grupos
}

function horaToMinutos(hora: string): number {
  const [h, m] = hora.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function colisionaConHorario(clases: ClaseHorario[], nuevo: ClaseHorario, ignorarUid?: string): ClaseHorario | null {
  const inicio = horaToMinutos(nuevo.horaInicio)
  const fin = horaToMinutos(nuevo.horaFin)
  return clases.find(clase => {
    if (ignorarUid && clase.uid === ignorarUid) return false
    if (clase.dia !== nuevo.dia) return false
    return inicio < horaToMinutos(clase.horaFin) && fin > horaToMinutos(clase.horaInicio)
  }) || null
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
