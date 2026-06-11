/*
=============================================================================
🤖 AVISO PARA AGENTES IA Y SCRIPTS DE DESPLIEGUE 🤖
=============================================================================
ESTE ARCHIVO ES ESTRICTAMENTE PARA USO LOCAL (edupanel_local).
POR FAVOR, EXCLÚYELO DE CUALQUIER SINCRONIZACIÓN CON EL REPOSITORIO PÚBLICO
O VERCEL. NO SUBIR A GITHUB.
=============================================================================
*/

import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser, getAdminApp } from "@/lib/auth/verify-token"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"
import { summarizeAiUsageData } from "@/lib/server/ai-usage"

export const dynamic = "force-dynamic"


// ── GET: métricas globales + por usuario ─────────────────────────────────────
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

    // 1. Leer todos los documentos de ai_usage_stats
    const statsSnap = await db.collection("ai_usage_stats").get()

    if (statsSnap.empty) {
      return NextResponse.json({
        global: { tokens: 0, prompts: 0, cost: 0, docentes_activos: 0 },
        por_docente: [],
        tendencia: [],
      })
    }

    // 2. Enriquecer con datos de autenticación (nombres)
    const uids = statsSnap.docs.map((d) => d.id)
    const userRecords = await authAdmin.getUsers(uids.map((uid) => ({ uid })))
    const userMap = new Map(userRecords.users.map((u) => [u.uid, u]))

    const por_docente = statsSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, any>
      const summary = summarizeAiUsageData(data)
      const user = userMap.get(doc.id)

      return {
        uid: doc.id,
        name: user?.displayName || user?.email || "Usuario desconocido",
        email: user?.email || "",
        photoURL: user?.photoURL || "",
        prompts: summary.prompts,
        tokens_input: summary.tokens_input,
        tokens_output: summary.tokens_output,
        tokens: summary.tokens,
        cost: summary.cost,
        limit: summary.limit,
        last_used: summary.last_used,
        month: summary.month,
        total_cost: summary.total_cost,
        total_tokens: summary.total_tokens,
        status: summary.cost >= summary.limit ? "exceeded" : summary.cost >= summary.limit * 0.8 ? "warning" : "active",
      }
    })

    // 3. Métricas globales
    const global = {
      tokens: por_docente.reduce((s, u) => s + u.tokens, 0),
      prompts: por_docente.reduce((s, u) => s + u.prompts, 0),
      cost: por_docente.reduce((s, u) => s + u.cost, 0),
      docentes_activos: por_docente.filter((u) => u.prompts > 0).length,
    }

    // 4. Tendencia: agrupar datos diarios de todos los usuarios
    const tendenciaMap = new Map<string, { tokens: number; cost: number }>()
    for (const doc of statsSnap.docs) {
      const data = doc.data() as { daily?: Record<string, { tokens: number; cost: number }> }
      const daily = data.daily || {}
      for (const [date, vals] of Object.entries(daily)) {
        const prev = tendenciaMap.get(date) || { tokens: 0, cost: 0 }
        tendenciaMap.set(date, {
          tokens: prev.tokens + (vals.tokens ?? 0),
          cost: prev.cost + (vals.cost ?? 0),
        })
      }
    }

    const tendencia = Array.from(tendenciaMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-30)
      .map(([date, vals]) => ({ date, ...vals }))

    return NextResponse.json({
      global,
      por_docente: por_docente.sort((a, b) => b.cost - a.cost),
      tendencia,
      month: por_docente[0]?.month ?? null,
    })
  } catch (err: any) {
    console.error("[admin/consumo-ia GET]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}

// ── PATCH: actualizar límite mensual de un usuario ────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const app = await getAdminApp()
    const db = getFirestore(app)

    const body = await req.json()
    const { uid, limit } = body as { uid?: string; limit?: number }

    if (!uid || typeof limit !== "number" || limit < 0) {
      return NextResponse.json({ error: "Faltan campos: uid y limit (número)" }, { status: 400 })
    }

    await db.collection("ai_usage_stats").doc(uid).set(
      { limit },
      { merge: true }
    )

    return NextResponse.json({ success: true, uid, limit })
  } catch (err: any) {
    console.error("[admin/consumo-ia PATCH]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
