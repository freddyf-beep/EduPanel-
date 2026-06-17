import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser, getAdminApp } from "@/lib/auth/verify-token"
import { getFirestore } from "firebase-admin/firestore"
import { deleteCurriculumDoc } from "@/lib/admin/curriculum-writer"

export const dynamic = "force-dynamic"

// ── GET: detalle de una asignatura con sus unidades ─────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { docId } = await params
    if (!docId) return NextResponse.json({ error: "Falta docId" }, { status: 400 })

    const app = await getAdminApp()
    const db = getFirestore(app)

    const docRef = db.collection("curriculo").doc(docId)
    const docSnap = await docRef.get()
    if (!docSnap.exists) {
      return NextResponse.json({ error: "No existe" }, { status: 404 })
    }

    const unidadesSnap = await docRef.collection("unidades").orderBy("numero_unidad").get()
    const unidades = await Promise.all(
      unidadesSnap.docs.map(async (uDoc) => {
        const uData = uDoc.data()
        const [oaSnap, actSnap, evSnap] = await Promise.all([
          uDoc.ref.collection("objetivos_aprendizaje").count().get(),
          uDoc.ref.collection("actividades_sugeridas").count().get(),
          uDoc.ref.collection("ejemplos_evaluacion").count().get(),
        ])
        return {
          id: uDoc.id,
          numero_unidad: uData.numero_unidad,
          nombre_unidad: uData.nombre_unidad,
          proposito: uData.proposito || "",
          conocimientos: uData.conocimientos || [],
          habilidades: uData.habilidades || [],
          actitudes: uData.actitudes || [],
          oas: oaSnap.data().count,
          actividades: actSnap.data().count,
          evaluaciones: evSnap.data().count,
        }
      })
    )

    return NextResponse.json({
      id: docSnap.id,
      ...docSnap.data(),
      unidades,
    })
  } catch (err: any) {
    console.error("[admin/curriculum GET detail]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}

// ── DELETE: elimina una asignatura completa con sus subcolecciones ──────────
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { docId } = await params
    if (!docId) return NextResponse.json({ error: "Falta docId" }, { status: 400 })

    const app = await getAdminApp()
    const db = getFirestore(app)
    await deleteCurriculumDoc(db, docId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[admin/curriculum DELETE]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
