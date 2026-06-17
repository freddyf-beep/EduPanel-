/*
=============================================================================
🤖 ENDPOINT DE IMPERSONACIÓN PARA DESARROLLO/QA 🤖
=============================================================================
Este endpoint permite generar un custom token de Firebase Auth para
cualquier UID. Solo está activo en desarrollo o local.
=============================================================================
*/

import { NextRequest, NextResponse } from "next/server"
import { getAdminApp } from "@/lib/auth/verify-token"
import { getAuth } from "firebase-admin/auth"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  // Solo permitir este endpoint en entorno local o de desarrollo
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_ALLOWLIST_BYPASS !== "true") {
    return NextResponse.json(
      { error: "No autorizado en producción" },
      { status: 403 }
    )
  }

  try {
    const body = await req.json()
    const { uid } = body

    if (!uid) {
      return NextResponse.json({ error: "Falta el UID" }, { status: 400 })
    }

    const app = await getAdminApp()
    const authAdmin = getAuth(app)
    const token = await authAdmin.createCustomToken(uid, { impersonation: true })

    return NextResponse.json({ success: true, token })
  } catch (err: any) {
    console.error("[api/auth/impersonate POST]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
