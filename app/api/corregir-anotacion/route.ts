import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { getFeatureFlags } from "@/lib/feature-flags"

export const dynamic = "force-dynamic"

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

function cleanText(text: any): string {
  if (typeof text !== "string") return ""
  return text.trim()
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map((p: any) => cleanText(p?.text)).filter(Boolean).join("\n")
}

function buildPrompt(texto: string) {
  return `Eres una IA asesora legal y mediadora escolar de establecimientos educativos en Chile (experta en normativa de la Superintendencia de Educación).
Tu labor es auditar las anotaciones o bitácoras ingresadas por los docentes en el Libro de Clases y detectar lenguaje que sea agresivo, subjetivo, despectivo, difamatorio o legalmente riesgoso (ej: "es flojo", "miente", "ladrón", "maleducado", "violento"), sugiriendo una redacción profesional, descriptiva, basada en hechos objetivos y resguardando la responsabilidad civil y legal del colegio.

TEXTO EVALUADO:
"${texto}"

Por favor, realiza la auditoría y retorna una respuesta estrictamente en formato JSON con la siguiente estructura:
{
  "riesgoso": true o false,
  "analisis": "Explicación del riesgo normativo o legal (ej: uso de adjetivos descalificativos en vez de hechos objetivos). Dejar vacío si no es riesgoso.",
  "sugerencia": "Redacción alternativa profesional, descriptiva y segura basada en los hechos sugeridos. Dejar vacío si no es riesgoso."
}

Si el texto es completamente profesional y no infringe ninguna directriz (ej. describe un hecho objetivo con respeto), "riesgoso" debe ser false.`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const authUser = authCheck.auth

  const rl = checkRateLimit(authUser.uid)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Limite de correcciones alcanzado. Intenta nuevamente mas tarde." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter ?? 3600) } }
    )
  }

  // Verificar Feature Flag
  try {
    const flags = await getFeatureFlags()
    if (!flags["corrector-tono"]?.active) {
      return NextResponse.json(
        { error: "La función de Corrector de Anotaciones está desactivada." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[corrector-tono] Feature Flag verification failed", error)
  }

  try {
    const { texto } = await req.json()
    const textoLimpio = cleanText(texto)

    if (!textoLimpio) {
      return NextResponse.json({ error: "Falta el texto a evaluar." }, { status: 400 })
    }
    if (textoLimpio.length > 5000) {
      return NextResponse.json({ error: "El texto supera el limite de 5000 caracteres." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini." }, { status: 500 })
    }

    const prompt = buildPrompt(textoLimpio)
    const model = cleanText(process.env.GEMINI_FAST_MODEL) || "gemini-2.0-flash"

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json"
          }
        })
      }
    )

    const rawText = await response.text()
    if (!response.ok) {
      console.error("[corrector-anotaciones] Gemini API error:", rawText)
      throw new Error(`Gemini API error (${response.status})`)
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo respuesta de moderación.")
    }

    const resultJson = JSON.parse(textOutput.trim())
    return NextResponse.json({
      success: true,
      resultado: resultJson
    })
  } catch (error: any) {
    console.error("[corrector-anotaciones] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
