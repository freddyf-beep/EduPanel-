import { NextResponse } from "next/server"
import { parsePlanificacionDocx } from "@/lib/import/parse-planificacion"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const allowed = await verifyAllowedUser(req)
  if (!allowed.ok) return allowed.response

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta archivo DOCX." }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith(".docx")) {
    return NextResponse.json({ error: "Solo se aceptan archivos .docx." }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const secciones = await parsePlanificacionDocx(buffer)
  return NextResponse.json({ secciones })
}
