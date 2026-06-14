import { NextRequest, NextResponse } from "next/server"
import { getAdminApp, isAdminEmail, verifyIdToken } from "@/lib/auth/verify-token"
import { getFirestore } from "firebase-admin/firestore"

export async function GET(req: NextRequest) {
  const auth = await verifyIdToken(req)
  if (!auth) {
    return NextResponse.json({ allowed: false }, { status: 401 })
  }

  const email = auth.email?.toLowerCase().trim() ?? ""
  if (email && auth.emailVerified && isAdminEmail(email)) {
    return NextResponse.json({ allowed: true, isAdmin: true })
  }

  try {
    const app = await getAdminApp()
    const db = getFirestore(app)
    const [emailSnap, uidSnap] = await Promise.all([
      email ? db.collection("allowlist").doc(email).get() : Promise.resolve(null),
      db.collection("allowlist_uids").doc(auth.uid).get(),
    ])
    return NextResponse.json({ allowed: Boolean(emailSnap?.exists || uidSnap.exists), isAdmin: false })
  } catch (error) {
    console.error("[check-allowlist]", error)
    return NextResponse.json({ allowed: false }, { status: 500 })
  }
}
