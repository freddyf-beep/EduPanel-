import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"
import { aiErrorResponse, parseGeminiApiError } from "@/lib/server/gemini-error"

const RATE_LIMIT_PER_HOUR = 30
const rateBuckets = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(uid: string): boolean {
  const now = Date.now()
  const bucket = rateBuckets.get(uid)
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(uid, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return true
  }
  if (bucket.count >= RATE_LIMIT_PER_HOUR) return false
  bucket.count++
  return true
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map((p: any) => (p?.text || "").trim()).filter(Boolean).join("\n")
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  if (!checkRateLimit(authCheck.auth.uid)) {
    return NextResponse.json({ error: "Límite de solicitudes alcanzado." }, { status: 429 })
  }

  try {
    const { tipo, asignatura, curso, objetivo, momento, contexto } = await req.json()

    const token = (process.env.GEMINI_API_KEY || "").trim()
    if (!token) {
      return NextResponse.json({ error: "Falta GEMINI_API_KEY." }, { status: 500 })
    }

    // Build prompt based on type
    let prompt = ""
    const contextBlock = [
      `Asignatura: ${asignatura || "No especificada"}`,
      `Curso: ${curso || "No especificado"}`,
      objetivo ? `Objetivo de la clase: ${objetivo}` : "",
      contexto ? `Contexto adicional: ${contexto}` : "",
    ].filter(Boolean).join("\n")

    switch (tipo) {
      case "rompehielos":
        prompt = `Eres un profesor chileno creativo y divertido. Genera UNA actividad rompehielos (warm-up) de MÁXIMO 5 minutos para iniciar una clase.

${contextBlock}

La actividad debe ser:
- Breve (2-5 minutos)
- Participativa (todos los alumnos)
- Relacionada con el tema de la clase si es posible
- Divertida y motivadora
- Fácil de implementar sin materiales especiales

Responde con un JSON:
{
  "nombre": "Nombre corto de la actividad",
  "instrucciones": "Instrucciones paso a paso en 3-4 oraciones",
  "duracion": "3 min",
  "tip": "Un consejo rápido para el profesor"
}`
        break

      case "metacognicion":
        prompt = `Eres un profesor chileno experto en metacognición y cierre de clases. Genera UNA pregunta reflexiva poderosa para cerrar la clase y activar la metacognición de los estudiantes.

${contextBlock}
Momento actual: ${momento || "Cierre"}

La pregunta debe:
- Ser abierta y provocar reflexión profunda
- Estar relacionada con el objetivo de la clase
- Ser comprensible para el nivel del curso
- Activar el pensamiento metacognitivo ("¿qué aprendí?", "¿cómo lo aprendí?", "¿qué me costó más?")

Responde con un JSON:
{
  "pregunta": "La pregunta principal de metacognición",
  "variantes": ["Una variante alternativa", "Otra variante"],
  "estrategia": "Cómo aplicar la pregunta (ticket de salida, lluvia de ideas, etc.)"
}`
        break

      case "actividad_rapida":
        prompt = `Eres un profesor chileno creativo. Genera UNA actividad rápida de ${momento === "inicio" ? "motivación" : momento === "cierre" ? "síntesis" : "ejercitación"} para usar AHORA MISMO en la clase.

${contextBlock}
Momento de la clase: ${momento || "Desarrollo"}

La actividad debe ser:
- Realizable en 5-10 minutos
- Sin necesidad de materiales adicionales
- Interactiva y participativa
- Alineada al objetivo de la clase

Responde con un JSON:
{
  "nombre": "Nombre de la actividad",
  "instrucciones": "Paso a paso en 3-5 oraciones",
  "duracion": "5-10 min",
  "modalidad": "Individual / Parejas / Grupal"
}`
        break

      default:
        return NextResponse.json({ error: "Tipo de sugerencia no reconocido." }, { status: 400 })
    }

    const model = "gemini-2.0-flash"
    const budget = await checkAiBudget(authCheck.auth.uid, { feature: "clase-en-vivo", inputText: prompt })
    if (!budget.ok) return budget.response

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, responseMimeType: "application/json" },
        }),
      }
    )

    if (!response.ok) {
      const errText = await response.text()
      console.error("[clase-en-vivo] API error:", errText)
      throw parseGeminiApiError(errText, response.status, "Gemini no pudo generar la sugerencia de clase en vivo.")
    }

    const data = await response.json()
    const text = extractGeminiText(data)
    if (!text) throw new Error("Respuesta vacía de Gemini")
    await recordAiUsage({
      uid: authCheck.auth.uid,
      feature: "clase-en-vivo",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: text,
      usageMetadata: data?.usageMetadata,
    })

    const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/```$/, "").trim())
    return NextResponse.json(parsed)
  } catch (error: any) {
    console.error("[clase-en-vivo] Error:", error)
    return aiErrorResponse(error, "Error interno")
  }
}
