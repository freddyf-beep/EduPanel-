import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

// Rate limit
const RATE_LIMIT_PER_HOUR = 30
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

function parseJsonResponse(rawText: string): Record<string, any> {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "")
    .trim()
  return JSON.parse(cleaned)
}

function buildBitacoraPrompt(
  estudiantes: Array<{ id: string; nombre: string }>,
  asignatura: string,
  curso: string
) {
  return `Eres un asistente de inteligencia artificial experto en educación y currículum escolar chileno (Mineduc).
Tu tarea es analizar el audio de voz grabado por un docente que relata el cierre de su clase de la asignatura "${asignatura}" para el curso "${curso}".

Debes procesar este audio para:
1. Transcribir fielmente lo que dice el docente en la propiedad "transcripcion".
2. Generar un objetivo pedagógico refinado, formal y redactado profesionalmente para el leccionario en la propiedad "objetivo". Debe ser claro, breve y coherente con lo relatado.
3. Generar una descripción formal y estructurada de la actividad realizada (leccionario) en la propiedad "actividad". Si el docente menciona incidentes o avances de grupos, inclúyelos con un lenguaje pedagógico respetuoso.
4. Identificar qué alumnos de la lista oficial del curso faltaron o llegaron tarde según el relato verbal.

LISTADO DE ESTUDIANTES OFICIAL DEL CURSO:
${estudiantes.map(e => `- ID: "${e.id}", Nombre: "${e.nombre}"`).join("\n")}

REGLAS PARA DETECTAR ASISTENCIA:
- Busca en el audio menciones directas o indirectas de inasistencia ("faltó", "no vino", "ausente", "no asistió", "Sofía y Juan no estuvieron", etc.).
- Busca menciones de atraso ("llegó tarde", "con retraso", "entró tarde", etc.).
- Mapea esos alumnos verbalizados a sus IDs correspondientes en el listado usando concordancia aproximada de nombres (ej: si dice "Sofía", mapéala a "Sofía Paz Valenzuela").
- En la propiedad "asistenciaCambios", devuelve una lista de objetos:
  - "id": el ID exacto del estudiante mapeado.
  - "estado": "ausente" (si se indica inasistencia) o "atraso" (si llegó tarde).

Devuelve estrictamente un objeto JSON plano que cumpla exactamente la siguiente estructura (sin bloques de código markdown, sin texto adicional, sin explicaciones):
{
  "transcripcion": "Texto de transcripción literal...",
  "objetivo": "Objetivo de la clase refinado...",
  "actividad": "Descripción de las actividades realizadas...",
  "asistenciaCambios": [
    { "id": "id_estudiante", "estado": "ausente" | "atraso" }
  ]
}`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const authUser = authCheck.auth

  const rl = checkRateLimit(authUser.uid)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en una hora." },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    )
  }

  try {
    const { audioBase64, mimeType, estudiantes, asignatura, curso } = await req.json()
    if (!audioBase64 || !mimeType || !estudiantes) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: audioBase64, mimeType, estudiantes." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini (GEMINI_API_KEY) en el servidor." }, { status: 500 })
    }

    const prompt = buildBitacoraPrompt(estudiantes, asignatura || "", curso || "")
    const model = "gemini-2.0-flash"

    // Llamar a la API multimodal de Gemini con audio
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: audioBase64
                  }
                }
              ]
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
      console.error("[bitacora-por-voz] Gemini API error response:", rawText)
      let parsedError
      try {
        parsedError = JSON.parse(rawText)
      } catch {}
      throw new Error(parsedError?.error?.message || `API error (${response.status})`)
    }

    let parsedResponse
    try {
      parsedResponse = JSON.parse(rawText)
    } catch (e) {
      console.error("[bitacora-por-voz] Failed to parse API response as JSON:", rawText)
      throw new Error("La respuesta de Gemini no es un JSON válido.")
    }

    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo texto de la respuesta de Gemini.")
    }

    let resultJson
    try {
      resultJson = parseJsonResponse(textOutput)
    } catch (e) {
      console.error("[bitacora-por-voz] Failed to parse generated text as JSON:", textOutput)
      throw new Error("La IA no devolvió un JSON formateado correctamente.")
    }

    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("[bitacora-por-voz] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
