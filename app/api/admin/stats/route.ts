/*
=============================================================================
🤖 USO LOCAL (edupanel_local). EXCLUIR DE SINCRONIZACION PUBLICA/VERCEL.
=============================================================================
*/
import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser, getAdminApp } from "@/lib/auth/verify-token"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const app = await getAdminApp()
    const authAdmin = getAuth(app)
    const db = getFirestore(app)

    // Lista completa de usuarios (hasta 1000)
    const listRes = await authAdmin.listUsers(1000)
    const ahora = Date.now()
    const umbral30d = ahora - 30 * 24 * 60 * 60 * 1000
    const umbral7d = ahora - 7 * 24 * 60 * 60 * 1000

    let usuariosActivos30d = 0
    let usuariosActivos7d = 0
    let nuevos30d = 0
    let usuariosDisabled = 0
    const signupsPorDia = new Map<string, number>()

    listRes.users.forEach((u) => {
      const lastSignIn = u.metadata.lastSignInTime ? Date.parse(u.metadata.lastSignInTime) : 0
      const creation = u.metadata.creationTime ? Date.parse(u.metadata.creationTime) : 0
      if (lastSignIn >= umbral30d) usuariosActivos30d++
      if (lastSignIn >= umbral7d) usuariosActivos7d++
      if (creation >= umbral30d) {
        nuevos30d++
        const dia = new Date(creation).toISOString().slice(0, 10)
        signupsPorDia.set(dia, (signupsPorDia.get(dia) || 0) + 1)
      }
      if (u.disabled) usuariosDisabled++
    })

    // Allowlist + invitaciones en paralelo
    const [allowSnap, invSnap, curSnap] = await Promise.all([
      db.collection("allowlist").get(),
      db.collection("invitaciones").get(),
      db.collection("curriculo").get(),
    ])

    let invitActivas = 0
    let invitAgotadas = 0
    let invitUsosTotales = 0
    invSnap.docs.forEach((d) => {
      const data = d.data() || {}
      const max = Number(data.maxUsos) || 0
      const usos = Number(data.usos) || 0
      invitUsosTotales += usos
      if (usos >= max) invitAgotadas++
      else invitActivas++
    })

    // Currículum: contar unidades por asignatura/nivel
    const asignaturasDetalle: Array<{ id: string; asignatura?: string; unidades: number }> = []
    let totalUnidades = 0
    await Promise.all(
      curSnap.docs.map(async (d) => {
        const unidadesSnap = await db
          .collection("curriculo")
          .doc(d.id)
          .collection("unidades")
          .count()
          .get()
        const count = unidadesSnap.data().count
        totalUnidades += count
        const data = d.data() || {}
        asignaturasDetalle.push({
          id: d.id,
          asignatura: typeof data.asignatura === "string" ? data.asignatura : undefined,
          unidades: count,
        })
      })
    )

    // Serie de registros por dia (ordenada)
    const seriePorDia = Array.from(signupsPorDia.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dia, count]) => ({ dia, count }))

    return NextResponse.json({
      usuarios: {
        total: listRes.users.length,
        activos30d: usuariosActivos30d,
        activos7d: usuariosActivos7d,
        nuevos30d,
        suspendidos: usuariosDisabled,
        hayMas: !!listRes.pageToken,
      },
      allowlist: {
        total: allowSnap.size,
      },
      invitaciones: {
        total: invSnap.size,
        activas: invitActivas,
        agotadas: invitAgotadas,
        usosTotales: invitUsosTotales,
      },
      curriculum: {
        totalAsignaturas: curSnap.size,
        totalUnidades,
        asignaturas: asignaturasDetalle.sort((a, b) => a.id.localeCompare(b.id)),
      },
      seriePorDia,
      generadoEn: ahora,
    })
  } catch (err: any) {
    console.error("[admin/stats]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
