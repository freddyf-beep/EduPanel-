import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { requireIntegratedAiAccess } from "@/lib/auth/ai-access"
import { getFeatureFlags } from "@/lib/feature-flags"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"

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

function buildInformePrompt(
  nombre: string,
  curso: string,
  asignatura: string,
  promedio: string,
  asistencia: string,
  observaciones: string[],
  pieInfo?: { diagnostico?: string; notas?: string },
  tono: "empatico" | "formal" | "constructivo" | "directo" = "empatico"
) {
  const obsText = observaciones.length > 0
    ? observaciones.map((o, i) => `${i + 1}. ${o}`).join("\n")
    : "Sin observaciones registradas."

  const pieText = pieInfo
    ? `Diagnóstico PIE: ${pieInfo.diagnostico || "No especificado"}. Notas PIE: ${pieInfo.notas || "Sin notas"}`
    : "No es alumno PIE."

  return `Eres un psicopedagogo y docente experto en el sistema educativo chileno, con amplia experiencia en la redacción de Informes de Personalidad y Desarrollo Personal y Social (IDPS) de alumnos de educación básica y media.

Tu tarea es redactar un informe de personalidad empático, constructivo, profesional y formal para el apoderado del siguiente estudiante:

ESTUDIANTE: ${nombre}
CURSO: ${curso}
ASIGNATURA: ${asignatura}
PROMEDIO DE NOTAS: ${promedio || "Sin notas registradas"}
ASISTENCIA: ${asistencia || "Sin registro"}%
OBSERVACIONES DEL LIBRO DE CLASES:
${obsText}
INFORMACIÓN PIE (Si corresponde):
${pieText}

INSTRUCCIONES DE REDACCIÓN:
1. **Tono**: ${tono} (empatía, respeto, balanceando los puntos fuertes y los aspectos a mejorar).
2. **Estructura del Informe**:
   - **Área Socioemocional y Conductual**: Describir cómo se relaciona con sus pares y docentes, actitud en el aula y comportamiento.
   - **Área Académica y Hábitos de Estudio**: Analizar su desempeño (vinculándolo a su promedio y asistencia) y sus hábitos de trabajo en clases.
   - **Fortalezas y Aspectos a Fortalecer**: Mencionar de forma constructiva qué aspectos debe reforzar en casa y en el aula.
   - **Mensaje de Cierre / Conclusión**: Una frase de aliento para el apoderado y el alumno.
3. Evita palabras excesivamente negativas como "flojo" o "malo". Usa términos formativos chilenos (por ejemplo, "requiere mayor monitoreo", "muestra disposición al aprendizaje", "debe consolidar hábitos").
4. Sé conciso pero completo (alrededor de 250-300 palabras en total).

Responde ESTRICTAMENTE con un JSON puro (sin bloques de código markdown) con la siguiente estructura:
{
  "socioemocional": "Redacción del área socioemocional...",
  "academica": "Redacción del área académica...",
  "fortalezas": ["fortaleza 1", "fortaleza 2"],
  "oportunidadesMejora": ["punto a mejorar 1", "punto a mejorar 2"],
  "conclusion": "Mensaje de cierre para el apoderado..."
}`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const aiAccessResponse = await requireIntegratedAiAccess(authCheck.auth)
  if (aiAccessResponse) return aiAccessResponse
  const authUser = authCheck.auth

  const rl = checkRateLimit(authUser.uid)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en una hora." },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    )
  }

  // Verificar Feature Flag
  try {
    const flags = await getFeatureFlags()
    if (!flags["redactor-informes"]?.active) {
      return NextResponse.json(
        { error: "Esta función está desactivada por el administrador." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[redactor-informes] Feature Flag verification failed, proceeding with default", error)
  }

  try {
    const { nombre, curso, asignatura, promedio, asistencia, observaciones, pieInfo, tono } = await req.json()
    if (!nombre) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: nombre." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini (GEMINI_API_KEY) en el servidor." }, { status: 500 })
    }

    const prompt = buildInformePrompt(
      nombre,
      curso || "No especificado",
      asignatura || "Todas",
      promedio || "",
      asistencia || "",
      observaciones || [],
      pieInfo,
      tono
    )

    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "redactor-informes", inputText: prompt })
    if (!budget.ok) return budget.response

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
            temperature: 0.5,
            responseMimeType: "application/json"
          }
        })
      }
    )

    const rawText = await response.text()
    if (!response.ok) {
      console.error("[redactor-informes] API error response:", rawText)
      let parsedError
      try { parsedError = JSON.parse(rawText) } catch {}
      throw new Error(parsedError?.error?.message || `API error (${response.status})`)
    }

    let parsedResponse
    try {
      parsedResponse = JSON.parse(rawText)
    } catch (e) {
      throw new Error("La respuesta de Gemini no es un JSON válido.")
    }

    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo texto de la respuesta de Gemini.")
    }

    await recordAiUsage({
      uid: authUser.uid,
      feature: "redactor-informes",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    let resultJson
    try {
      resultJson = parseJsonResponse(textOutput)
    } catch (e) {
      console.error("[redactor-informes] Failed to parse generated text as JSON:", textOutput)
      throw new Error("La IA no devolvió un JSON formateado correctamente.")
    }

    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("[redactor-informes] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
