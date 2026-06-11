import { NextRequest, NextResponse } from "next/server"
import { verifyIdToken, getAdminApp } from "@/lib/auth/verify-token"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

class RedeemTestInviteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyIdToken(req)
    if (!auth?.uid) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const upperCode = cleanText(body?.code).toUpperCase()
    const testerName = cleanText(body?.testerName) || "Tester EduPanel"
    const email = cleanText(auth.email).toLowerCase()

    if (!upperCode) {
      return NextResponse.json({ error: "Codigo invalido" }, { status: 400 })
    }

    const app = await getAdminApp()
    const db = getFirestore(app)
    const inviteRef = db.collection("invitaciones").doc(upperCode)
    const uidAllowlistRef = db.collection("allowlist_uids").doc(auth.uid)

    const result = await db.runTransaction(async (transaction) => {
      const [inviteSnap, uidAllowlistSnap] = await Promise.all([
        transaction.get(inviteRef),
        transaction.get(uidAllowlistRef),
      ])

      if (!inviteSnap.exists) {
        throw new RedeemTestInviteError("Codigo de invitacion no valido", 404)
      }

      const inviteData = inviteSnap.data() || {}
      const allowlistData = uidAllowlistSnap.data() || {}
      const maxUsos = Number(inviteData.maxUsos) || 1
      const usos = Number(inviteData.usos) || 0
      const usedBy = Array.isArray(inviteData.usedBy) ? inviteData.usedBy : []
      const alreadyUsedByUid = usedBy.includes(auth.uid)
      const alreadyAllowedWithThisCode = allowlistData.codigoUsado === upperCode

      if (alreadyAllowedWithThisCode || alreadyUsedByUid || uidAllowlistSnap.exists) {
        transaction.set(uidAllowlistRef, {
          uid: auth.uid,
          email: email || null,
          displayName: testerName,
          invitedAt: allowlistData.invitedAt || FieldValue.serverTimestamp(),
          invitedBy: inviteData.creadoPor || "admin",
          codigoUsado: allowlistData.codigoUsado || upperCode,
          source: "test_invite",
          role: "tester",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true })
        return { alreadyAllowed: true }
      }

      if (usos >= maxUsos) {
        throw new RedeemTestInviteError("Este codigo ya alcanzo su limite de usos", 400)
      }

      transaction.set(uidAllowlistRef, {
        uid: auth.uid,
        email: email || null,
        displayName: testerName,
        invitedAt: FieldValue.serverTimestamp(),
        invitedBy: inviteData.creadoPor || "admin",
        codigoUsado: upperCode,
        source: "test_invite",
        role: "tester",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })

      const updatePayload = {
        usos: FieldValue.increment(1),
        usedBy: FieldValue.arrayUnion(auth.uid),
        usedAnonymousUids: FieldValue.arrayUnion(auth.uid),
        actualizadoEn: FieldValue.serverTimestamp(),
        ...(email ? { usedEmails: FieldValue.arrayUnion(email) } : {}),
      }

      transaction.update(inviteRef, updatePayload)

      return { alreadyAllowed: false }
    })

    return NextResponse.json({ success: true, uid: auth.uid, ...result })
  } catch (err: any) {
    console.error("[redeem-test-invite]", err)
    if (err instanceof RedeemTestInviteError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
