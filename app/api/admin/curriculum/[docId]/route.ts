import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser, getAdminApp } from "@/lib/auth/verify-token"
import { getFirestore } from "firebase-admin/firestore"
import { deleteCurriculumDoc } from "@/lib/admin/curriculum-writer"

export const dynamic = "force-dynamic"

interface FuenteOficialSanitizada {
  id: string
  label: string
  url: string
  tipo: string
  principal: boolean
  nota?: string
}

function sortByNumeroThenId<T extends { id: string; numero?: unknown; orden?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aNum = Number(a.numero ?? a.orden)
    const bNum = Number(b.numero ?? b.orden)
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum
    if (Number.isFinite(aNum) && !Number.isFinite(bNum)) return -1
    if (!Number.isFinite(aNum) && Number.isFinite(bNum)) return 1
    return a.id.localeCompare(b.id, "es", { numeric: true })
  })
}

function normalizeSourceId(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

function sanitizeFuentesOficiales(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, 20)
    .map((item, index): FuenteOficialSanitizada | null => {
      if (!item || typeof item !== "object") return null
      const raw = item as Record<string, unknown>
      const url = typeof raw.url === "string" ? raw.url.trim() : ""
      if (!isHttpUrl(url)) return null
      const label =
        typeof raw.label === "string" && raw.label.trim()
          ? raw.label.trim().slice(0, 180)
          : `Fuente oficial ${index + 1}`
      const tipo = typeof raw.tipo === "string" && raw.tipo.trim() ? raw.tipo.trim().slice(0, 40) : "programa"
      const nota = typeof raw.nota === "string" && raw.nota.trim() ? raw.nota.trim().slice(0, 500) : ""
      const idBase = typeof raw.id === "string" && raw.id.trim() ? raw.id : label
      return {
        id: normalizeSourceId(idBase) || `fuente_${index + 1}`,
        label,
        url,
        tipo,
        principal: raw.principal === true,
        ...(nota ? { nota } : {}),
      }
    })
    .filter((source): source is FuenteOficialSanitizada => source !== null)
    .map((source, index, sources) => ({
      ...source,
      principal: index === 0 ? true : source.principal === true && !sources.slice(0, index).some((s) => s.principal),
    }))
}

// ── GET: detalle de una asignatura con sus unidades ─────────────────────────
export async function GET(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { docId } = await params
    if (!docId) return NextResponse.json({ error: "Falta docId" }, { status: 400 })

    const app = await getAdminApp()
    const db = getFirestore(app)

    const docRef = db.collection("curriculo").doc(docId)
    const docSnap = await docRef.get()
    if (!docSnap.exists) {
      return NextResponse.json({ error: "No existe" }, { status: 404 })
    }

    const unidadesSnap = await docRef.collection("unidades").orderBy("numero_unidad").get()
    const unidades = await Promise.all(
      unidadesSnap.docs.map(async (uDoc) => {
        const uData = uDoc.data()
        const [oaSnap, actSnap, evSnap] = await Promise.all([
          uDoc.ref.collection("objetivos_aprendizaje").get(),
          uDoc.ref.collection("actividades_sugeridas").get(),
          uDoc.ref.collection("ejemplos_evaluacion").get(),
        ])
        const objetivos_aprendizaje = sortByNumeroThenId(
          oaSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
        )
        const actividades_sugeridas = sortByNumeroThenId(
          actSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
        )
        const ejemplos_evaluacion = sortByNumeroThenId(
          evSnap.docs.map((d) => ({ ...d.data(), id: d.id })),
        )
        return {
          id: uDoc.id,
          numero_unidad: uData.numero_unidad,
          nombre_unidad: uData.nombre_unidad,
          proposito: uData.proposito || "",
          conocimientos: uData.conocimientos || [],
          habilidades: uData.habilidades || [],
          actitudes: uData.actitudes || [],
          objetivos_aprendizaje,
          actividades_sugeridas,
          ejemplos_evaluacion,
          oas: objetivos_aprendizaje.length,
          actividades: actividades_sugeridas.length,
          evaluaciones: ejemplos_evaluacion.length,
        }
      })
    )

    return NextResponse.json({
      id: docSnap.id,
      ...docSnap.data(),
      unidades,
    })
  } catch (err: any) {
    console.error("[admin/curriculum GET detail]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}

// ── DELETE: elimina una asignatura completa con sus subcolecciones ──────────
// PATCH: actualiza metadata editable del documento de curriculum.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { docId } = await params
    if (!docId) return NextResponse.json({ error: "Falta docId" }, { status: 400 })

    const body = await req.json()
    const app = await getAdminApp()
    const db = getFirestore(app)
    const docRef = db.collection("curriculo").doc(docId)
    const docSnap = await docRef.get()
    if (!docSnap.exists) {
      return NextResponse.json({ error: "No existe" }, { status: 404 })
    }

    const fuentesOficiales = sanitizeFuentesOficiales(body?.fuentesOficiales)
    const principal = fuentesOficiales.find((source) => source?.principal) || fuentesOficiales[0]

    await docRef.set(
      {
        fuentesOficiales,
        fuenteOficialUrl: principal?.url || "",
        sourceUrl: principal?.url || "",
        programaUrl: principal?.url || "",
        actualizadoFuentesEn: new Date(),
      },
      { merge: true },
    )

    return NextResponse.json({
      success: true,
      fuentesOficiales,
      fuenteOficialUrl: principal?.url || "",
    })
  } catch (err: any) {
    console.error("[admin/curriculum PATCH detail]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    if (!authCheck.auth.isAdmin) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 })
    }

    const { docId } = await params
    if (!docId) return NextResponse.json({ error: "Falta docId" }, { status: 400 })

    const app = await getAdminApp()
    const db = getFirestore(app)
    await deleteCurriculumDoc(db, docId)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error("[admin/curriculum DELETE]", err)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
