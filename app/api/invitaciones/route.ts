import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { getAdminApp } from "@/lib/auth/verify-token"
import { getFirestore, FieldValue } from "firebase-admin/firestore"

export async function GET(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const auth = authCheck.auth
    // Validación hardcodeada para admin (podríamos usar el de auth rules)
    if (!auth.isAdmin) {
      // Nota: Si has cambiado tu email real en las rules, ponlo aquí también.
      // Aquí dejaremos una validación general. Lo ideal es compartir la lógica de isAdmin.
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const app = await getAdminApp()
    const db = getFirestore(app)
    
    const snapshot = await db.collection("invitaciones").orderBy("creadoEn", "desc").get()
    const invitaciones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))

    return NextResponse.json({ invitaciones })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const auth = authCheck.auth
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await req.json()
    const { codigo, maxUsos } = body

    if (!codigo) {
      return NextResponse.json({ error: "Falta código" }, { status: 400 })
    }

    const app = await getAdminApp()
    const db = getFirestore(app)

    const inviteRef = db.collection("invitaciones").doc(codigo.toUpperCase())
    const doc = await inviteRef.get()
    
    if (doc.exists) {
      return NextResponse.json({ error: "El código ya existe" }, { status: 400 })
    }

    await inviteRef.set({
      creadoPor: auth.email,
      creadoEn: FieldValue.serverTimestamp(),
      maxUsos: Number(maxUsos) || 1,
      usos: 0
    })

    return NextResponse.json({ success: true, codigo: codigo.toUpperCase() })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const auth = authCheck.auth
    if (!auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }
    const url = new URL(req.url)
    const codigo = url.searchParams.get("codigo")
    if (!codigo) return NextResponse.json({ error: "Falta código" }, { status: 400 })

    const app = await getAdminApp()
    const db = getFirestore(app)
    await db.collection("invitaciones").doc(codigo.toUpperCase()).delete()

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
