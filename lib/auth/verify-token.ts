/**
 * Verificación de Firebase ID Token en API routes.
 *
 * Uso en una route handler:
 *
 *   import { verifyIdToken } from "@/lib/auth/verify-token"
 *   export async function POST(req: Request) {
 *     const auth = await verifyIdToken(req)
 *     if (!auth) return new Response("Unauthorized", { status: 401 })
 *     // ... auth.uid, auth.email disponibles
 *   }
 *
 * Requisitos de despliegue (Vercel env vars):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY   (con \n escapados, se reemplazan abajo)
 *
 * Para obtenerlas: Firebase console → Configuración del proyecto →
 * Cuentas de servicio → Generar nueva clave privada (JSON).
 *
 * Instalar: npm install firebase-admin
 */

import type { App } from "firebase-admin/app"

let cachedApp: App | null = null
const DEFAULT_ADMIN_EMAIL = "freddyfiguea@gmail.com"

function normalizeEmail(email: string | null | undefined): string {
  return (email ?? "").toLowerCase().trim()
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const key = normalizeEmail(email)
  if (!key) return false

  const configured = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL)
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean)

  return configured.includes(key)
}

export async function getAdminApp(): Promise<App> {
  if (cachedApp) return cachedApp

  const { getApps, initializeApp, cert } = await import("firebase-admin/app")

  const existing = getApps()
  if (existing.length > 0) {
    cachedApp = existing[0]
    return cachedApp
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
  const privateKeyRaw = process.env.FIREBASE_ADMIN_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      "Firebase Admin credentials not configured. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY in Vercel env vars."
    )
  }

  // Vercel guarda la clave con \n literales; restauramos saltos reales
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n")

  cachedApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })

  return cachedApp
}

export interface VerifiedAuth {
  uid: string
  email: string | null
  emailVerified: boolean
}

export interface AllowedAuth extends VerifiedAuth {
  email: string
  isAdmin: boolean
}

export type VerifyAllowedUserResult =
  | { ok: true; auth: AllowedAuth }
  | { ok: false; response: Response }

/**
 * Verifica el header Authorization: Bearer <ID_TOKEN> contra Firebase Auth.
 * Retorna null si falta token, está vencido, o cualquier otro error.
 * NUNCA tira excepción — el caller decide qué responder.
 */
export async function verifyIdToken(req: Request): Promise<VerifiedAuth | null> {
  try {
    const header = req.headers.get("authorization") || req.headers.get("Authorization")
    if (!header || !header.startsWith("Bearer ")) return null

    const token = header.slice("Bearer ".length).trim()
    if (!token) return null

    const app = await getAdminApp()
    const { getAuth } = await import("firebase-admin/auth")
    const decoded = await getAuth(app).verifyIdToken(token)

    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      emailVerified: decoded.email_verified ?? false,
    }
  } catch (err) {
    console.warn("[verifyIdToken] failed:", (err as Error).message)
    return null
  }
}

async function isEmailAllowedServer(email: string): Promise<boolean> {
  const key = normalizeEmail(email)
  if (!key) return false
  if (process.env.NEXT_PUBLIC_ALLOWLIST_BYPASS === "true" && process.env.NODE_ENV !== "production") {
    return true
  }
  if (isAdminEmail(key)) return true

  try {
    const app = await getAdminApp()
    const { getFirestore } = await import("firebase-admin/firestore")
    const snap = await getFirestore(app).collection("allowlist").doc(key).get()
    return snap.exists
  } catch (err) {
    console.warn("[allowlist server] failed:", (err as Error).message)
    return false
  }
}

/**
 * Valida token y allowlist server-side para proteger cuotas y endpoints.
 */
export async function verifyAllowedUser(req: Request): Promise<VerifyAllowedUserResult> {
  const auth = await verifyIdToken(req)
  if (!auth) return { ok: false, response: unauthorized("No autorizado") }

  const email = normalizeEmail(auth.email)
  if (!email) {
    return { ok: false, response: forbidden("Tu cuenta no tiene email verificable.") }
  }

  const isAdmin = auth.emailVerified && isAdminEmail(email)
  const allowed = isAdmin || await isEmailAllowedServer(email)
  if (!allowed) {
    return { ok: false, response: forbidden("Acceso solo por invitacion.") }
  }

  return {
    ok: true,
    auth: {
      ...auth,
      email,
      isAdmin,
    },
  }
}

/**
 * Helper para devolver 401 estandarizado.
 */
export function unauthorized(message = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Helper para devolver 403 estandarizado.
 */
export function forbidden(message = "Forbidden"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  })
}
