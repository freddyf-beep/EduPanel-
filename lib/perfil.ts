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
  // ── Encabezado opcional para exportaciones (planificación tabla, pruebas, guías) ──
  encabezadoHabilitado?: boolean    // si está activo, los exports lo aplican
  encabezadoTextoIzq?: string       // texto multi-línea (separar con \n)
  encabezadoTextoDer?: string       // texto multi-línea
  logoDerBase64?: string            // logo del lado derecho (opcional)
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

// ─── Preferencias del usuario (asignaturas habilitadas, etc.) ───────────────

export interface PreferenciasUsuario {
  /**
   * Asignaturas que el docente quiere ver en el switcher de asignatura.
   * Si es undefined o []: mostrar todas las disponibles (compatibilidad
   * hacia atrás con usuarios sin configuración).
   */
  asignaturasHabilitadas?: string[]
  /**
   * Estilo del banner del perfil v2. Puede ser un nombre de preset
   * (rosa, oceano, atardecer, esmeralda, indigo, grafito) o un valor
   * CSS literal de "background" (gradient, color, etc.).
   */
  bannerStyle?: string
  /**
   * Bandera para saber si el usuario completó el Onboarding V2.
   */
  onboardingCompletado?: boolean
  updatedAt?: any
}

export async function cargarPreferencias(): Promise<PreferenciasUsuario | null> {
  const snap = await getDoc(doc(db, "users", getUid(), "perfil_info", "preferencias"))
  if (!snap.exists()) return null
  return snap.data() as PreferenciasUsuario
}

export async function guardarPreferencias(pref: Omit<PreferenciasUsuario, "updatedAt">): Promise<void> {
  await setDoc(doc(db, "users", getUid(), "perfil_info", "preferencias"), {
    ...pref,
    updatedAt: serverTimestamp()
  }, { merge: true })
}
