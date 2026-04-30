/**
 * Allowlist de invitados a la alfa cerrada.
 *
 * Modelo Firestore:
 *   allowlist/{email lowercased}
 *     { invitedAt: timestamp, invitedBy?: string, nombre?: string }
 *
 * Las reglas de Firestore permiten lectura para cualquier autenticado
 * (necesario para que el cliente verifique su propio email tras login)
 * y escritura solo al admin.
 *
 * Uso:
 *   const allowed = await isEmailAllowed(user.email)
 *   if (!allowed) { await signOut(auth); toast(...) }
 */

import { doc, getDoc } from "firebase/firestore"
import { db } from "./firebase"

/**
 * Bypass para desarrollo local: si está activo, todos los emails entran.
 * Lo controlamos con una env var pública para poder probar la app sin
 * tener que sembrar el allowlist primero.
 */
const BYPASS = process.env.NEXT_PUBLIC_ALLOWLIST_BYPASS === "true"

export async function isEmailAllowed(email: string | null | undefined): Promise<boolean> {
  if (BYPASS) return true
  if (!email) return false

  const key = email.toLowerCase().trim()
  if (key === "freddyfiguea@gmail.com") return true // Bypass admin
  if (!key) return false

  try {
    const ref = doc(db, "allowlist", key)
    const snap = await getDoc(ref)
    return snap.exists()
  } catch (err) {
    // Si falla la lectura (red, permisos), ser conservador y denegar
    console.warn("[allowlist] error consultando", err)
    return false
  }
}
