import { NextRequest, NextResponse } from "next/server"
import { getAdminApp, isAdminEmail, verifyIdToken } from "@/lib/auth/verify-token"
import { getFirestore } from "firebase-admin/firestore"

export async function GET(req: NextRequest) {
  const auth = await verifyIdToken(req)
  if (!auth?.email) {
    return NextResponse.json({ allowed: false }, { status: 401 })
  }

  const email = auth.email.toLowerCase().trim()
  if (auth.emailVerified && isAdminEmail(email)) {
    return NextResponse.json({ allowed: true, isAdmin: true })
  }

  try {
    const app = await getAdminApp()
    const db = getFirestore(app)
    const snap = await db.collection("allowlist").doc(email).get()
    return NextResponse.json({ allowed: snap.exists, isAdmin: false })
  } catch (error) {
    console.error("[check-allowlist]", error)
    return NextResponse.json({ allowed: false }, { status: 500 })
  }
}
