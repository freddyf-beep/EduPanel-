import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser, getAdminApp } from "@/lib/auth/verify-token"
import { getAuth } from "firebase-admin/auth"
import { getFirestore, FieldValue } from "firebase-admin/firestore"
import { summarizeAiUsageData } from "@/lib/server/ai-usage"

export const dynamic = "force-dynamic"

// ── GET: detalle completo de un usuario ─────────────────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { uid } = await params
    if (!uid) return NextResponse.json({ error: "Falta UID" }, { status: 400 })

    const app = await getAdminApp()
    const authAdmin = getAuth(app)
    const db = getFirestore(app)

    const userRecord = await authAdmin.getUser(uid)

    const userRef = db.collection("users").doc(uid)
    const [perfilMain, perfilColegio, perfilPref, horario] = await Promise.all([
      userRef.collection("perfil_info").doc("main").get(),
      userRef.collection("perfil_info").doc("colegio").get(),
      userRef.collection("perfil_info").doc("preferencias").get(),
      userRef.collection("configuracion").doc("horario").get(),
    ])

    // Conteos de colecciones principales
    const coleccionesAContar = [
      "planificaciones",
      "planificaciones_curso",
      "ver_unidad",
      "cronograma_unidad",
      "cronogramas",
      "actividades_clase",
      "libro_clases",
      "calificaciones",
      "observaciones_360",
      "anotaciones",
    ] as const

    const conteos: Record<string, number> = {}
    await Promise.all(
      coleccionesAContar.map(async (nombre) => {
        try {
          const snap = await userRef.collection(nombre).count().get()
          conteos[nombre] = snap.data().count
        } catch {
          conteos[nombre] = 0
        }
      })
    )

    // Estadísticas de uso de IA
    const aiStatsDoc = await db.collection("ai_usage_stats").doc(uid).get()
    const aiAccessDoc = await db.collection("ai_access").doc(uid).get()
    let aiStats: Record<string, any> | null = null
    if (aiStatsDoc.exists) {
      const summary = summarizeAiUsageData(aiStatsDoc.data() as Record<string, any>)
      aiStats = {
        tokens_input: summary.tokens_input,
        tokens_output: summary.tokens_output,
        tokens: summary.tokens,
        prompts: summary.prompts,
        cost: summary.cost,
        limit: summary.limit,
        last_used: summary.last_used,
        month: summary.month,
        total_cost: summary.total_cost,
        total_tokens: summary.total_tokens,
      }
    }

    // Allowlist (verificar si esta invitado)
    let allowlistEntry: any = null
    if (userRecord.email) {
      const allowSnap = await db.collection("allowlist").doc(userRecord.email.toLowerCase().trim()).get()
      if (allowSnap.exists) allowlistEntry = allowSnap.data()
    }

    return NextResponse.json({
      auth: {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        displayName: userRecord.displayName,
        photoURL: userRecord.photoURL,
        creationTime: userRecord.metadata.creationTime,
        lastSignInTime: userRecord.metadata.lastSignInTime,
        disabled: userRecord.disabled,
        providerData: userRecord.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
          displayName: p.displayName,
        })),
        customClaims: userRecord.customClaims || {},
      },
      perfil: {
        main: perfilMain.exists ? perfilMain.data() : null,
        colegio: perfilColegio.exists ? perfilColegio.data() : null,
        preferencias: perfilPref.exists ? perfilPref.data() : null,
      },
      horario: horario.exists ? horario.data() : null,
      conteos,
      allowlist: allowlistEntry,
      aiAccess: aiAccessDoc.exists ? aiAccessDoc.data() : null,
      ai: aiStats,
    })
  } catch (err: any) {
    console.error("[admin/usuarios/[uid] GET]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const authUser = authCheck.auth

    if (!authUser.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const resolvedParams = await params
    const { uid } = resolvedParams
    if (!uid) {
      return NextResponse.json({ error: "Falta UID del usuario" }, { status: 400 })
    }

    const app = await getAdminApp()
    const authAdmin = getAuth(app)
    const db = getFirestore(app)

    // 1. Eliminar datos en Firestore (recursive delete de subcolecciones)
    const userDocRef = db.collection("users").doc(uid)
    await db.recursiveDelete(userDocRef)

    // 2. Eliminar de Firebase Auth
    await authAdmin.deleteUser(uid)

    return NextResponse.json({ success: true, message: "Usuario y datos eliminados correctamente" })
  } catch (err: any) {
    console.error("Error al eliminar usuario:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ uid: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const authUser = authCheck.auth

    if (!authUser.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const resolvedParams = await params
    const { uid } = resolvedParams
    const body = await req.json()
    const { action, colegio, disabled } = body

    const app = await getAdminApp()
    const authAdmin = getAuth(app)
    const db = getFirestore(app)

    if (action === "updateAuth") {
      // Activar/Desactivar cuenta en Auth
      await authAdmin.updateUser(uid, { disabled })
      return NextResponse.json({ success: true })
    }

    if (action === "assignColegio") {
      // Asignar colegio en el perfil_info del usuario (v2)
      // Tambien escribe en la ruta v1 por compatibilidad
      const userRef = db.collection("users").doc(uid)
      await Promise.all([
        userRef.collection("perfil_info").doc("colegio").set(
          { nombre: colegio || "" },
          { merge: true },
        ),
        userRef.collection("perfil").doc("datos").set(
          { colegio: colegio || "" },
          { merge: true },
        ),
      ])
      return NextResponse.json({ success: true })
    }

    if (action === "addToAllowlist") {
      const userRecord = await authAdmin.getUser(uid)
      const email = userRecord.email?.toLowerCase().trim()
      if (!email) return NextResponse.json({ error: "Usuario sin email" }, { status: 400 })
      await db.collection("allowlist").doc(email).set(
        {
          uid,
          email,
          invitedAt: FieldValue.serverTimestamp(),
          invitedBy: authUser.email,
          source: "admin_manual",
        },
        { merge: true },
      )
      return NextResponse.json({ success: true })
    }

    if (action === "removeFromAllowlist") {
      const userRecord = await authAdmin.getUser(uid)
      const email = userRecord.email?.toLowerCase().trim()
      if (!email) return NextResponse.json({ error: "Usuario sin email" }, { status: 400 })
      await db.collection("allowlist").doc(email).delete()
      return NextResponse.json({ success: true })
    }

    if (action === "toggleAdmin") {
      // Asigna o remueve un custom claim admin
      const makeAdmin = body.makeAdmin === true
      const current = (await authAdmin.getUser(uid)).customClaims || {}
      await authAdmin.setCustomUserClaims(uid, {
        ...current,
        admin: makeAdmin ? true : undefined,
      })
      return NextResponse.json({ success: true, admin: makeAdmin })
    }

    if (action === "resetData") {
      // Borra planificaciones pero mantiene auth + perfil base
      const userRef = db.collection("users").doc(uid)
      const colectionsToClear = [
        "planificaciones",
        "planificaciones_curso",
        "ver_unidad",
        "cronograma_unidad",
        "cronogramas",
        "actividades_clase",
        "anotaciones",
        "libro_clases",
        "calificaciones",
        "observaciones_360",
      ]
      let eliminados = 0
      for (const colName of colectionsToClear) {
        const snap = await userRef.collection(colName).get()
        for (const d of snap.docs) {
          await d.ref.delete()
          eliminados++
        }
      }
      return NextResponse.json({ success: true, eliminados })
    }

    if (action === "updateAiLimit") {
      const { limit } = body as { limit: number }
      if (typeof limit !== "number" || limit < 0) {
        return NextResponse.json({ error: "Límite inválido" }, { status: 400 })
      }
      await db.collection("ai_usage_stats").doc(uid).set(
        { limit },
        { merge: true }
      )
      return NextResponse.json({ success: true, limit })
    }

    if (action === "toggleAiAccess") {
      const enabled = body.enabled === true
      await db.collection("ai_access").doc(uid).set(
        {
          uid,
          enabled,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: authUser.email,
        },
        { merge: true }
      )
      return NextResponse.json({ success: true, enabled })
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 })
  } catch (err: any) {
    console.error("[admin/usuarios PATCH]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
