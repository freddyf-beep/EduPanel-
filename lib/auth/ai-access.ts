import { forbidden, getAdminApp, type AllowedAuth } from "@/lib/auth/verify-token"

export const AI_ACCESS_COLLECTION = "ai_access"

export async function hasIntegratedAiAccess(auth: Pick<AllowedAuth, "uid" | "isAdmin">): Promise<boolean> {
  if (auth.isAdmin) return true

  try {
    const app = await getAdminApp()
    const { getFirestore } = await import("firebase-admin/firestore")
    const snap = await getFirestore(app).collection(AI_ACCESS_COLLECTION).doc(auth.uid).get()
    return snap.exists && snap.data()?.enabled === true
  } catch (error) {
    console.warn("[ai-access] failed:", (error as Error).message)
    return false
  }
}

export async function requireIntegratedAiAccess(auth: AllowedAuth): Promise<Response | null> {
  const allowed = await hasIntegratedAiAccess(auth)
  if (allowed) return null

  return forbidden("Las herramientas de IA estan bloqueadas para este usuario. Solicita acceso al administrador.")
}
