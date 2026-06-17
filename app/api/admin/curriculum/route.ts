import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser, getAdminApp } from "@/lib/auth/verify-token"
import { getFirestore } from "firebase-admin/firestore"
import {
  normalizeCurriculumJson,
  writeCurriculumToFirestore,
} from "@/lib/admin/curriculum-writer"
import { normalizeKeyPart } from "@/lib/shared"

export const dynamic = "force-dynamic"

function buildDocId(asignatura: string, nivel: string): string {
  return (normalizeKeyPart(asignatura) + "_" + normalizeKeyPart(nivel)).replace(/^_+|_+$/g, "")
}

// ── GET: listar todas las asignaturas cargadas ──────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const app = await getAdminApp()
    const db = getFirestore(app)

    const snap = await db.collection("curriculo").get()
    const items = await Promise.all(
      snap.docs.map(async (d) => {
        const data = d.data() || {}
        const unidadesCount = await db
          .collection("curriculo")
          .doc(d.id)
          .collection("unidades")
          .count()
          .get()
        return {
          id: d.id,
          asignatura: typeof data.asignatura === "string" ? data.asignatura : null,
          nivel: typeof data.nivel === "string" ? data.nivel : null,
          esParvularia: !!data.esParvularia,
          actualizadoEn: data.actualizadoEn?.toMillis?.() ?? null,
          unidades: unidadesCount.data().count,
        }
      })
    )

    return NextResponse.json({ items: items.sort((a, b) => a.id.localeCompare(b.id)) })
  } catch (err: any) {
    console.error("[admin/curriculum GET]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}

// ── POST: subir / actualizar un JSON de curriculum ──────────────────────────
// Body JSON: { asignatura, nivel, data, forceParvularia?, dryRun?, docId? }
// - asignatura + nivel se usan para calcular docId, o se puede pasar docId directo
// - data: el contenido del JSON (parseado)
// - dryRun: true devuelve normalizacion sin escribir
export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const body = await req.json()
    const { asignatura, nivel, data, forceParvularia, dryRun, docId: docIdOverride } = body

    if (!asignatura || typeof asignatura !== "string") {
      return NextResponse.json({ error: "Falta 'asignatura'" }, { status: 400 })
    }
    if (!nivel || typeof nivel !== "string") {
      return NextResponse.json({ error: "Falta 'nivel'" }, { status: 400 })
    }
    if (!data || typeof data !== "object") {
      return NextResponse.json({ error: "Falta 'data' (JSON parseado)" }, { status: 400 })
    }

    const docId = typeof docIdOverride === "string" && docIdOverride.trim()
      ? docIdOverride.trim()
      : buildDocId(asignatura, nivel)

    if (dryRun) {
      const preview = normalizeCurriculumJson(data, !!forceParvularia)
      return NextResponse.json({
        dryRun: true,
        docId,
        preview: {
          isParvularia: preview.isParvularia,
          totalUnidades: preview.totalUnidades,
          unidades: preview.unidades.map((u: any) => ({
            numero: u.unidad?.numero_unidad ?? null,
            nombre: u.unidad?.nombre_unidad ?? null,
            oas: (u.unidad?.objetivos_aprendizaje || []).length,
            actividades: (u.unidad?.actividades_sugeridas || []).length,
            evaluaciones: (u.unidad?.ejemplos_evaluacion || u.unidad?.evaluaciones || []).length,
          })),
        },
      })
    }

    const app = await getAdminApp()
    const db = getFirestore(app)
    const result = await writeCurriculumToFirestore(
      db,
      docId,
      asignatura,
      nivel,
      data,
      !!forceParvularia,
    )

    return NextResponse.json({ success: true, result })
  } catch (err: any) {
    console.error("[admin/curriculum POST]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
