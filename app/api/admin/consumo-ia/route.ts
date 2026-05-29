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

export const dynamic = "force-dynamic"

// Tarifa Gemini 1.5 Pro: $3.50 por millón de tokens de entrada, $10.50 de salida.
// Usamos un promedio conservador de $1.50 por millón de tokens combinados.
export const COST_PER_TOKEN = 1.5 / 1_000_000

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
      const data = doc.data() as {
        tokens?: number
        tokens_input?: number
        tokens_output?: number
        prompts?: number
        cost?: number
        limit?: number
        last_used?: FirebaseFirestore.Timestamp
        daily?: Record<string, { tokens: number; cost: number }>
      }
      const user = userMap.get(doc.id)
      const tokens = (data.tokens_input ?? 0) + (data.tokens_output ?? 0) + (data.tokens ?? 0)
      const cost = data.cost ?? tokens * COST_PER_TOKEN
      const limit = data.limit ?? 5.0

      return {
        uid: doc.id,
        name: user?.displayName || user?.email || "Usuario desconocido",
        email: user?.email || "",
        photoURL: user?.photoURL || "",
        prompts: data.prompts ?? 0,
        tokens_input: data.tokens_input ?? 0,
        tokens_output: data.tokens_output ?? 0,
        tokens,
        cost,
        limit,
        last_used: data.last_used?.toDate().toISOString() ?? null,
        status: cost >= limit ? "exceeded" : cost >= limit * 0.8 ? "warning" : "active",
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
