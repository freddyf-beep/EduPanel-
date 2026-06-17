import { NextResponse } from "next/server"
import { getAdminApp } from "@/lib/auth/verify-token"
import { generarPreguntas, type FabricaParams } from "@/lib/server/fabrica-preguntas-core"

// Tarea programada (Vercel Cron): procesa la cola `fabrica_jobs` y genera
// preguntas de noche, guardándolas en users/{uid}/itemBank.
//
// Encolar un trabajo = crear un doc en la colección `fabrica_jobs`:
//   { uid, asignatura, curso, oa, tema, cantidad, tipoItems: [...], status: "pending" }
//
// Protegido por CRON_SECRET: Vercel envía Authorization: Bearer $CRON_SECRET.
// Si CRON_SECRET no está seteado, devuelve 401 (la tarea queda inactiva).
// Programación en vercel.json (crons).

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_JOBS_PER_RUN = 10

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get("authorization") || ""
  return header === `Bearer ${secret}`
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 })
  }

  const app = await getAdminApp()
  const { getFirestore, FieldValue } = await import("firebase-admin/firestore")
  const fdb = getFirestore(app)

  const pending = await fdb
    .collection("fabrica_jobs")
    .where("status", "==", "pending")
    .limit(MAX_JOBS_PER_RUN)
    .get()

  let processed = 0
  let failed = 0

  for (const jobDoc of pending.docs) {
    const job = jobDoc.data() as Partial<FabricaParams> & { uid?: string }
    try {
      if (!job.uid || !job.asignatura || !job.curso || !job.oa || !job.tema) {
        throw new Error("Job incompleto (faltan uid/asignatura/curso/oa/tema).")
      }
      const params: FabricaParams = {
        asignatura: job.asignatura,
        curso: job.curso,
        oa: job.oa,
        tema: job.tema,
        cantidad: typeof job.cantidad === "number" ? job.cantidad : 5,
        tipoItems: Array.isArray(job.tipoItems) && job.tipoItems.length ? job.tipoItems : ["seleccion_multiple"],
      }

      const preguntas = await generarPreguntas(params)

      const batch = fdb.batch()
      const itemBank = fdb.collection("users").doc(job.uid).collection("itemBank")
      for (const q of preguntas) {
        const ref = itemBank.doc()
        ;(q as Record<string, unknown>).id = ref.id
        batch.set(ref, {
          payload: q,
          metadata: {
            asignatura: params.asignatura,
            curso: params.curso,
            oas: [params.oa],
            origen: "fabrica-nocturna",
            autor: job.uid,
            timestamp: FieldValue.serverTimestamp(),
          },
          createdAt: FieldValue.serverTimestamp(),
        })
      }
      batch.update(jobDoc.ref, {
        status: "done",
        preguntasGeneradas: preguntas.length,
        processedAt: FieldValue.serverTimestamp(),
      })
      await batch.commit()
      processed++
    } catch (error) {
      failed++
      await jobDoc.ref
        .update({
          status: "error",
          error: String((error as Error).message).slice(0, 300),
          processedAt: FieldValue.serverTimestamp(),
        })
        .catch(() => {})
    }
  }

  return NextResponse.json({ scanned: pending.size, processed, failed })
}
