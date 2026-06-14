import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { requireIntegratedAiAccess } from "@/lib/auth/ai-access"
import { getFeatureFlags } from "@/lib/feature-flags"
import { GoogleGenAI } from "@google/genai"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" })

const RATE_LIMIT_PER_HOUR = 20
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

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const aiAccessResponse = await requireIntegratedAiAccess(authCheck.auth)
    if (aiAccessResponse) return aiAccessResponse
    const authUser = authCheck.auth

    // Rate Limiting
    const rl = checkRateLimit(authUser.uid)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intente de nuevo en ${rl.retryAfter} segundos.` },
        { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
      )
    }

    // Comprobar feature flag
    const flags = await getFeatureFlags()
    if (!flags["recomendador-semantico"]?.active) {
      return NextResponse.json(
        { error: "Función Premium inactiva. Habilítela en el panel de administración." },
        { status: 403 }
      )
    }

    const { query, curso, asignatura } = await req.json()

    if (!query) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: query." }, { status: 400 })
    }

    const prompt = `
      Eres un recomendador semántico curricular de IA para docentes. Tu objetivo es mapear una solicitud de un profesor con los Objetivos de Aprendizaje (OA) ministeriales correctos y proponer recursos, actividades o evaluaciones idóneas.

      Solicitud del docente: "${query}"
      Asignatura: ${asignatura || "No especificada"}
      Curso: ${curso || "No especificado"}

      Genera una respuesta en formato JSON (sin bloques markdown ni explicaciones externas) que contenga:
      1. Los OAs sugeridos (código y descripción resumida).
      2. Una justificación pedagógica de la recomendación.
      3. 3 recursos o actividades didácticas concretas para implementar esta recomendación.

      Estructura del JSON:
      {
        "justificacion": "[Breve justificación de por qué estas recomendaciones responden a la consulta]",
        "oasSugeridos": [
          { "id": "OA 1", "resumen": "[Resumen del objetivo]", "explicacionMapeo": "[Por qué calza]" }
        ],
        "propuestasRecursos": [
          { "nombre": "[Nombre del recurso/actividad]", "tipo": "[Actividad / Instrumento / Lectura]", "descripcion": "[Detalle de la propuesta]" }
        ]
      }
    `

    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "recomendador-semantico", inputText: prompt })
    if (!budget.ok) return budget.response

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3
      }
    })

    const text = response.text?.trim() || "{}"
    await recordAiUsage({
      uid: authUser.uid,
      feature: "recomendador-semantico",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: text,
      usageMetadata: (response as any)?.usageMetadata,
    })
    const resultJson = JSON.parse(text)

    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("Error en Recomendador Semántico API:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor." }, { status: 500 })
  }
}
