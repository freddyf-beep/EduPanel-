import { getAdminApp } from "@/lib/auth/verify-token"

const COST_PER_TOKEN = 1.5 / 1_000_000

export async function checkAiQuota(uid: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const app = await getAdminApp()
    const { getFirestore } = await import("firebase-admin/firestore")
    const db = getFirestore(app)
    const docRef = db.collection("ai_usage_stats").doc(uid)
    const snap = await docRef.get()
    if (!snap.exists) return { ok: true }

    const d = snap.data() || {}
    const cost = d.cost ?? (((d.tokens_input ?? 0) + (d.tokens_output ?? 0) + (d.tokens ?? 0)) * COST_PER_TOKEN)
    const limit = d.limit ?? 5.0

    if (cost >= limit) {
      return {
        ok: false,
        error: `Has excedido tu límite de presupuesto mensual de IA ($${limit.toFixed(2)} USD). Consumo actual: $${cost.toFixed(4)} USD. Solicita un incremento al administrador.`
      }
    }

    return { ok: true }
  } catch (err: any) {
    console.warn("[checkAiQuota] failed:", err.message)
    return { ok: true } // Non-blocking
  }
}

export async function recordAiUsage(uid: string, inputTokens: number, outputTokens: number): Promise<void> {
  try {
    const app = await getAdminApp()
    const { getFirestore, FieldValue } = await import("firebase-admin/firestore")
    const db = getFirestore(app)
    const docRef = db.collection("ai_usage_stats").doc(uid)

    const tokens = inputTokens + outputTokens
    const cost = tokens * COST_PER_TOKEN

    await docRef.set({
      tokens_input: FieldValue.increment(inputTokens),
      tokens_output: FieldValue.increment(outputTokens),
      tokens: FieldValue.increment(tokens),
      prompts: FieldValue.increment(1),
      cost: FieldValue.increment(cost),
      last_used: FieldValue.serverTimestamp()
    }, { merge: true })
  } catch (err: any) {
    console.error("[recordAiUsage] failed to record usage:", err.message)
  }
}
