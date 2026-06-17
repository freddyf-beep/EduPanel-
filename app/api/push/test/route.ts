import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { sendPushToUser } from "@/lib/server/push"

/**
 * Envía una notificación push de prueba a los dispositivos del usuario que llama.
 * Útil para verificar la configuración de FCM (VAPID + token registrado).
 */
export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response

  try {
    const result = await sendPushToUser(authCheck.auth.uid, {
      title: "EduPanel — Notificación de prueba",
      body: "Si ves esto, las notificaciones push están funcionando. 🎉",
      data: { url: "/" },
    })
    if (result.noTokens) {
      return NextResponse.json(
        { error: "No tienes dispositivos registrados. Activa las notificaciones primero." },
        { status: 400 },
      )
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[push/test]", error)
    return NextResponse.json({ error: "No se pudo enviar la notificación." }, { status: 500 })
  }
}
