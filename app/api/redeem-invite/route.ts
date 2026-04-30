import { NextRequest, NextResponse } from "next/server"
import { verifyIdToken, getAdminApp } from "@/lib/auth/verify-token"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

class RedeemInviteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyIdToken(req)
    if (!auth?.email) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const body = await req.json()
    const { code } = body
    if (!code || typeof code !== "string") {
      return NextResponse.json({ error: "Codigo invalido" }, { status: 400 })
    }

    const upperCode = code.trim().toUpperCase()
    const email = auth.email.toLowerCase().trim()
    if (!upperCode || !email) {
      return NextResponse.json({ error: "Codigo invalido" }, { status: 400 })
    }

    const app = await getAdminApp()
    const db = getFirestore(app)
    const inviteRef = db.collection("invitaciones").doc(upperCode)
    const allowlistRef = db.collection("allowlist").doc(email)

    const result = await db.runTransaction(async (transaction) => {
      const inviteSnap = await transaction.get(inviteRef)
      if (!inviteSnap.exists) {
        throw new RedeemInviteError("Codigo de invitacion no valido", 404)
      }

      const allowlistSnap = await transaction.get(allowlistRef)
      const inviteData = inviteSnap.data() || {}
      const maxUsos = Number(inviteData.maxUsos) || 1
      const usos = Number(inviteData.usos) || 0
      const usedBy = Array.isArray(inviteData.usedBy) ? inviteData.usedBy : []
      const alreadyUsedByUid = usedBy.includes(auth.uid)
      const alreadyAllowed = allowlistSnap.exists
      const allowlistData = allowlistSnap.data() || {}
      const alreadyAllowedWithThisCode = allowlistData.codigoUsado === upperCode

      if (alreadyAllowedWithThisCode || alreadyUsedByUid) {
        transaction.set(allowlistRef, {
          invitedAt: allowlistData.invitedAt || FieldValue.serverTimestamp(),
          invitedBy: inviteData.creadoPor || "admin",
          codigoUsado: upperCode,
          uid: auth.uid,
          email,
        }, { merge: true })
        return { alreadyAllowed: true }
      }

      if (alreadyAllowed) {
        return { alreadyAllowed: true }
      }

      if (usos >= maxUsos) {
        throw new RedeemInviteError("Este codigo ya alcanzo su limite de usos", 400)
      }

      transaction.set(allowlistRef, {
        invitedAt: FieldValue.serverTimestamp(),
        invitedBy: inviteData.creadoPor || "admin",
        codigoUsado: upperCode,
        uid: auth.uid,
        email,
      }, { merge: true })

      transaction.update(inviteRef, {
        usos: FieldValue.increment(1),
        usedBy: FieldValue.arrayUnion(auth.uid),
        usedEmails: FieldValue.arrayUnion(email),
        actualizadoEn: FieldValue.serverTimestamp(),
      })

      return { alreadyAllowed: false }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    console.error("[redeem-invite]", err)
    if (err instanceof RedeemInviteError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
