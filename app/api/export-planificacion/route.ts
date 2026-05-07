import { NextRequest, NextResponse } from "next/server"
import { Packer } from "docx"
import { generarPlanificacionDocx, type ExportData } from "@/lib/export/planificacion-docx"
import { generarPlanificacionTablaDocx, type ExportDataTabla } from "@/lib/export/planificacion-tabla"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

type ExportPayload = (ExportData | ExportDataTabla) & {
  formato?: "detallado" | "tabla"
}

export async function POST(req: NextRequest) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  try {
    const payload: ExportPayload = await req.json()

    if (!payload.asignatura || !payload.nivel || !Array.isArray(payload.unidades)) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 })
    }

    const formato = payload.formato ?? "detallado"
    const year    = new Date().getFullYear()
    let filename: string

    const doc =
      formato === "tabla"
        ? generarPlanificacionTablaDocx(payload as ExportDataTabla)
        : generarPlanificacionDocx(payload as ExportData)

    if (formato === "tabla") {
      const s = (payload as ExportDataTabla).semestre
      const sufijo = s === 1 ? "_S1" : s === 2 ? "_S2" : ""
      filename = `PlanAnual_${payload.asignatura}${sufijo}_${year}.docx`
    } else {
      filename = `Planificacion_${payload.asignatura}_${payload.nivel}_${year}.docx`
    }

    filename = filename.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "")

    const buffer = await Packer.toBuffer(doc)

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
