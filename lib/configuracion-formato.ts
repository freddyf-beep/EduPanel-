import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase"
import type { CampoPlanificacionDestino } from "@/lib/import/parse-planificacion"

export interface ReglaMapeoPlanificacion {
  patronSeccion: string
  estiloDocx?: string
  campoDestino: CampoPlanificacionDestino
}

export interface MapeoFormatoPlanificacion {
  id: string
  nombre: string
  version: number
  reglas: ReglaMapeoPlanificacion[]
  updatedAt?: unknown
}

interface FormatoPlanificacionDoc {
  mapeos?: MapeoFormatoPlanificacion[]
  updatedAt?: unknown
}

function getUid(): string {
  const uid = auth?.currentUser?.uid
  if (!uid) throw new Error("Usuario no autenticado")
  return uid
}

function formatoDocRef() {
  return doc(db, "users", getUid(), "configuracion", "formato_planificacion")
}

export async function cargarMapeosFormatoPlanificacion(): Promise<MapeoFormatoPlanificacion[]> {
  const snap = await getDoc(formatoDocRef())
  if (!snap.exists()) return []
  return ((snap.data() as FormatoPlanificacionDoc).mapeos || []).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
}

export async function guardarMapeoFormatoPlanificacion(mapeo: Omit<MapeoFormatoPlanificacion, "id" | "version" | "updatedAt"> & { id?: string }): Promise<MapeoFormatoPlanificacion> {
  const actuales = await cargarMapeosFormatoPlanificacion()
  const id = mapeo.id || `fmt_${Date.now()}`
  const next: MapeoFormatoPlanificacion = {
    id,
    nombre: mapeo.nombre.trim() || "Formato sin nombre",
    version: 1,
    reglas: mapeo.reglas,
    updatedAt: Date.now(),
  }
  const mapeos = actuales.some(item => item.id === id)
    ? actuales.map(item => item.id === id ? next : item)
    : [...actuales, next]

  await setDoc(formatoDocRef(), { mapeos, updatedAt: serverTimestamp() })
  return next
}
