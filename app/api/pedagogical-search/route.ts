import { GoogleGenAI } from "@google/genai"
import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import {
  buildPedagogicalBrief,
  type PedagogicalExternalSource,
} from "@/lib/ai/pedagogical-engine"
import { cleanText, type LessonRequestBody } from "@/lib/ai/copilot"

export const dynamic = "force-dynamic"

const RATE_LIMIT_PER_HOUR = 12
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(uid: string): { ok: boolean; retryAfter?: number } {
  const now = Date.now()
  const bucket = rateBuckets.get(uid)
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(uid, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return { ok: true }
  }
  if (bucket.count >= RATE_LIMIT_PER_HOUR) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) }
  }
  bucket.count++
  return { ok: true }
}

function parseJson(text: string): Record<string, any> {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim()
  return JSON.parse(cleaned)
}

function extractSources(response: any): PedagogicalExternalSource[] {
  const metadata = response?.candidates?.[0]?.groundingMetadata || response?.candidates?.[0]?.grounding_metadata
  const chunks = metadata?.groundingChunks || metadata?.grounding_chunks || []
  if (!Array.isArray(chunks)) return []
  const seen = new Set<string>()
  return chunks
    .map((chunk: any) => {
      const web = chunk?.web || {}
      const uri = cleanText(web.uri)
      if (!uri || seen.has(uri)) return null
      seen.add(uri)
      return {
        title: cleanText(web.title) || uri,
        uri,
      } satisfies PedagogicalExternalSource
    })
    .filter(Boolean)
    .slice(0, 6) as PedagogicalExternalSource[]
}

function buildSearchPrompt(query: string, body: LessonRequestBody) {
  const brief = buildPedagogicalBrief(body)
  const oas = (body.oas || [])
    .slice(0, 4)
    .map((oa) => `- OA ${oa.numero || ""}: ${cleanText(oa.descripcion)}`)
    .join("\n")

  return `Busca estrategias pedagogicas y didacticas especificas para enriquecer una clase chilena.

Solicitud del docente:
${query}

Contexto:
- Asignatura: ${body.asignatura || "No especificada"}
- Curso: ${body.curso || "No especificado"}
- Nivel curricular: ${body.nivelCurricular || body.curso || "No especificado"}
- Foco: ${body.focoPedagogico || "DUA"}
- Tono: ${body.tono || "ludico"}
- Resumen anonimo del curso: ${body.studentSummary ? `${body.studentSummary.total} estudiantes, ${body.studentSummary.pieCount} PIE/NEE, senales: ${body.studentSummary.supportSignals.join("; ") || "sin senales"}` : "sin datos"}

OA:
${oas || "No hay OA seleccionados."}

Brief actual:
${brief.textoEditable}

Instrucciones:
- Prioriza fuentes institucionales, universitarias o pedagogicas confiables.
- No inventes citas.
- No incluyas nombres de estudiantes ni datos personales.
- Devuelve solo JSON con recomendaciones breves y aplicables.

JSON:
{
  "resumen": "Sintesis breve de lo encontrado",
  "recomendaciones": ["..."],
  "consultasUsadas": ["..."]
}`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response

  const rl = checkRateLimit(authCheck.auth.uid)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas busquedas externas. Intenta de nuevo mas tarde." },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    )
  }

  try {
    const body = await req.json().catch(() => null) as { query?: string; lessonRequestBody?: LessonRequestBody } | null
    const query = cleanText(body?.query)
    const lessonRequestBody = body?.lessonRequestBody
    if (!query || !lessonRequestBody) {
      return NextResponse.json({ error: "Faltan query y lessonRequestBody." }, { status: 400 })
    }

    const apiKey = cleanText(process.env.GEMINI_API_KEY)
    if (!apiKey) {
      return NextResponse.json({ error: "Falta GEMINI_API_KEY para busqueda externa." }, { status: 500 })
    }

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: cleanText(process.env.GEMINI_FAST_MODEL) || "gemini-2.5-flash",
      contents: buildSearchPrompt(query, lessonRequestBody),
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        temperature: 0.3,
      } as any,
    })

    const parsed = parseJson(response.text || "{}")
    return NextResponse.json({
      resumen: cleanText(parsed.resumen),
      recomendaciones: Array.isArray(parsed.recomendaciones)
        ? parsed.recomendaciones.map(cleanText).filter(Boolean).slice(0, 6)
        : [],
      consultasUsadas: Array.isArray(parsed.consultasUsadas)
        ? parsed.consultasUsadas.map(cleanText).filter(Boolean).slice(0, 4)
        : [],
      fuentes: extractSources(response),
    })
  } catch (error) {
    console.error("[pedagogical-search]", error)
    const message = error instanceof Error ? error.message : "Error interno"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
