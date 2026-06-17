// ═══════════════════════════════════════════════════════════════════════════
// Cloud Messaging (FCM) — lado servidor
// ─────────────────────────────────────────────────────────────────────────
// Envía notificaciones push a un usuario (a todos sus dispositivos registrados)
// usando firebase-admin. Los tokens viven en users/{uid}/push_tokens/{token}
// (los registra lib/push-client.ts). Limpia tokens inválidos automáticamente.
//
// Casos de uso en EduPanel: alertas de deserción (radar-desercion), atrasos de
// cobertura (predictor-cobertura), recordatorios. Reutiliza credenciales Admin.
// ═══════════════════════════════════════════════════════════════════════════

import { getAdminApp } from "@/lib/auth/verify-token"

export interface PushPayload {
  title: string
  body: string
  /** Datos extra (p. ej. { url: "/radar-desercion" }) para el click handler. */
  data?: Record<string, string>
}

export interface PushResult {
  sent: number
  failed: number
  /** True si el usuario no tiene tokens registrados. */
  noTokens: boolean
}

/** Envía una notificación a todos los dispositivos registrados de un usuario. */
export async function sendPushToUser(uid: string, payload: PushPayload): Promise<PushResult> {
  if (!uid) return { sent: 0, failed: 0, noTokens: true }

  const app = await getAdminApp()
  const { getFirestore } = await import("firebase-admin/firestore")
  const { getMessaging } = await import("firebase-admin/messaging")

  const db = getFirestore(app)
  const tokensSnap = await db.collection("users").doc(uid).collection("push_tokens").get()
  const tokens = tokensSnap.docs.map((d) => d.id)
  if (tokens.length === 0) return { sent: 0, failed: 0, noTokens: true }

  const res = await getMessaging(app).sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
    webpush: { fcmOptions: { link: payload.data?.url || "/" } },
  })

  // Limpiar tokens inválidos (desinstalados / expirados).
  const invalid: string[] = []
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = (r.error as { code?: string } | undefined)?.code || ""
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-argument") ||
        code.includes("invalid-registration-token")
      ) {
        invalid.push(tokens[i])
      }
    }
  })
  if (invalid.length) {
    await Promise.all(
      invalid.map((t) =>
        db.collection("users").doc(uid).collection("push_tokens").doc(t).delete().catch(() => {}),
      ),
    )
  }

  return { sent: res.successCount, failed: res.failureCount, noTokens: false }
}
