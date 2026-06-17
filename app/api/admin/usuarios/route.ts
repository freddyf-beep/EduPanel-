import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser, getAdminApp, isAdminEmail } from "@/lib/auth/verify-token"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const authUser = authCheck.auth

    if (!authUser.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const app = await getAdminApp()
    const authAdmin = getAuth(app)
    const db = getFirestore(app)

    // Lista de usuarios (limite 1000 para MVP)
    const listUsersResult = await authAdmin.listUsers(1000)

    // Cargar allowlist en una sola query y cruzar por email
    const allowSnap = await db.collection("allowlist").get()
    const allowByEmail = new Map<string, any>()
    allowSnap.docs.forEach((d) => allowByEmail.set(d.id, d.data()))

    const aiAccessSnap = await db.collection("ai_access").get()
    const aiAccessByUid = new Map<string, any>()
    aiAccessSnap.docs.forEach((d) => aiAccessByUid.set(d.id, d.data()))

    const usuarios = listUsersResult.users.map((u) => {
      const email = (u.email || "").toLowerCase().trim()
      const claims = (u.customClaims || {}) as Record<string, any>
      const admin = !!claims.admin || isAdminEmail(email)
      const explicitAiAccess = aiAccessByUid.get(u.uid)?.enabled === true
      return {
        uid: u.uid,
        email: u.email,
        displayName: u.displayName,
        photoURL: u.photoURL,
        creationTime: u.metadata.creationTime,
        lastSignInTime: u.metadata.lastSignInTime,
        disabled: u.disabled,
        emailVerified: u.emailVerified,
        isAdmin: admin,
        inAllowlist: allowByEmail.has(email),
        allowlistSource: allowByEmail.get(email)?.source || null,
        aiEnabled: admin || explicitAiAccess,
        aiAccessManual: explicitAiAccess,
        aiAccessSource: admin ? "admin" : explicitAiAccess ? "manual" : null,
      }
    })

    return NextResponse.json({ usuarios, total: usuarios.length })
  } catch (err: any) {
    console.error("[admin/usuarios GET]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
