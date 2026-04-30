import { NextRequest, NextResponse } from "next/server"
import { Packer } from "docx"
import { generarPlanificacionDocx, type ExportData } from "@/lib/export/planificacion-docx"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

export async function POST(req: NextRequest) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  try {
    const data: ExportData = await req.json()

    if (!data.asignatura || !data.nivel || !Array.isArray(data.unidades)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }

    const doc    = generarPlanificacionDocx(data)
    const buffer = await Packer.toBuffer(doc)

    const filename = `Planificacion_${data.asignatura}_${data.nivel}_${new Date().getFullYear()}.docx`
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "")

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.byteLength),
      },
    })
  } catch (err) {
    console.error("[export-planificacion]", err)
    return NextResponse.json({ error: "Error al generar el documento" }, { status: 500 })
  }
}
