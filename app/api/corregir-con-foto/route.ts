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

function buildCorregirPrompt(rubrica: any, studentName?: string) {
  return `Eres un docente experto del sistema educacional chileno. Tu tarea es evaluar el trabajo/prueba adjunto de un estudiante utilizando la siguiente rúbrica de evaluación:

DATOS GENERALES DE LA RÚBRICA:
- Nombre: ${rubrica.nombre || "Sin nombre"}
- Asignatura: ${rubrica.asignatura || "Sin asignatura"}
- Curso: ${rubrica.curso || "Sin curso"}
- Puntaje Máximo: ${rubrica.puntajeMaximo || 0}
${rubrica.unidadNombre ? `- Unidad: ${rubrica.unidadNombre}` : ""}

CRITERIOS DE EVALUACIÓN:
${rubrica.partes.map((parte: any, pIdx: number) => {
  return `Parte ${pIdx + 1}: ${parte.nombre}
${parte.criterios.map((c: any) => {
    return `- Criterio ID: "${c.id}"
  Nombre: "${c.nombre}"
  Niveles de logro posibles (elige uno de estos exactamente):
  * "logrado" (${c.niveles?.logrado?.puntos ?? 4} puntos): ${c.niveles?.logrado?.descripcion ?? ""}
  * "casiLogrado" (${c.niveles?.casiLogrado?.puntos ?? 3} puntos): ${c.niveles?.casiLogrado?.descripcion ?? ""}
  * "parcialmenteLogrado" (${c.niveles?.parcialmenteLogrado?.puntos ?? 2} puntos): ${c.niveles?.parcialmenteLogrado?.descripcion ?? ""}
  * "porLograr" (${c.niveles?.porLograr?.puntos ?? 1} puntos): ${c.niveles?.porLograr?.descripcion ?? ""}`
  }).join("\n")}`
}).join("\n\n")}

${studentName ? `ALUMNO EVALUADO: ${studentName}` : ""}

INSTRUCCIONES DE CORRECCIÓN:
1. Realiza una transcripción fiel de las respuestas, texto manuscrito o contenido que observes en el documento del estudiante en la propiedad "transcripcion". Si hay varias páginas u hojas, transcribe lo más relevante o todo lo que esté visible.
2. Analiza detenidamente el trabajo y, para cada criterio en la rúbrica, determina el nivel de logro correspondiente ("logrado", "casiLogrado", "parcialmenteLogrado" o "porLograr").
3. Justifica de manera muy detallada por qué asignas ese nivel a dicho criterio en "justificacion".
4. Redacta comentarios pedagógicos y observaciones de retroalimentación constructiva en "observaciones" orientados al alumno.

Debes responder estrictamente con un objeto JSON que siga la siguiente estructura exacta:
{
  "transcripcion": "Transcripción del texto manuscrito encontrado en el documento.",
  "evaluaciones": {
    "<criterioId>": {
      "nivel": "logrado" | "casiLogrado" | "parcialmenteLogrado" | "porLograr",
      "puntos": <número correspondiente de puntos>,
      "justificacion": "Detalle de la justificación pedagógica."
    }
  },
  "observaciones": "Comentarios finales de retroalimentación."
}
`
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
    const { imageBase64, mimeType, rubrica, studentName } = await req.json()
    if (!imageBase64 || !mimeType || !rubrica) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: imageBase64, mimeType o rubrica." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini (GEMINI_API_KEY) en el servidor." }, { status: 500 })
    }

    const prompt = buildCorregirPrompt(rubrica, studentName)
    const model = "gemini-2.0-flash"

    // Construir llamada multimodal
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
                    data: imageBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    )

    const rawText = await response.text()
    if (!response.ok) {
      console.error("[corregir-con-foto] API error response:", rawText)
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
      console.error("[corregir-con-foto] Failed to parse API response as JSON:", rawText)
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
      console.error("[corregir-con-foto] Failed to parse generated text as JSON:", textOutput)
      throw new Error("La IA no devolvió un JSON formateado correctamente.")
    }

    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("[corregir-con-foto] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
