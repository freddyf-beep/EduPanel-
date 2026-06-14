import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { requireIntegratedAiAccess } from "@/lib/auth/ai-access"
import { getFeatureFlags } from "@/lib/feature-flags"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"
import { aiErrorResponse, parseGeminiApiError } from "@/lib/server/gemini-error"

function cleanText(text: any): string {
  if (typeof text !== "string") return ""
  return text.trim()
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map((p: any) => cleanText(p?.text)).filter(Boolean).join("\n")
}

function buildPrompt(
  nombre: string,
  curso: string,
  promedio: number | string,
  asistencia: number | string,
  observaciones: string[],
  alertasHeuristica: string[]
) {
  const obsTexto = observaciones.length > 0
    ? observaciones.map((o, i) => `- ${o}`).join("\n")
    : "Sin observaciones registradas."

  const alertasTexto = alertasHeuristica.length > 0
    ? alertasHeuristica.map((a, i) => `- ${a}`).join("\n")
    : "Sin alertas automáticas detectadas."

  return `Eres una IA psicopedagógica experta en deserción escolar y retención académica en el sistema escolar chileno.
Tu labor es realizar un Análisis Predictivo de Deserción para el siguiente estudiante:

ESTUDIANTE: ${nombre}
CURSO: ${curso}
PROMEDIO GENERAL: ${promedio}
ASISTENCIA: ${asistencia}%

OBSERVACIONES DE SU BITÁCORA DOCENTE:
${obsTexto}

ALERTAS DETECTADAS POR EL SISTEMA:
${alertasTexto}

Por favor, redacta un informe de análisis predictivo estructurado en formato JSON con la siguiente estructura:
{
  "nivelRiesgo": "Crítico" o "Medio" o "Bajo",
  "probabilidadDesercion": "X%" (porcentaje estimado),
  "factoresRiesgo": ["Factor 1...", "Factor 2..."],
  "factoresProtectores": ["Factor 1...", "Factor 2..."],
  "analisisCualitativo": "Redacción de 2-3 párrafos explicando la situación psicosocial y académica del estudiante, proyectando posibles escenarios.",
  "planIntervencionSugerido": ["Acción 1...", "Acción 2...", "Acción 3..."]
}

Mantén un tono confidencial, profesional, constructivo y pedagógicamente ético.`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const aiAccessResponse = await requireIntegratedAiAccess(authCheck.auth)
  if (aiAccessResponse) return aiAccessResponse
  const authUser = authCheck.auth
  const uid = authUser.uid

  // Verificar Feature Flag
  try {
    const flags = await getFeatureFlags()
    if (!flags["radar-desercion"]?.active) {
      return NextResponse.json(
        { error: "La función de Radar de Deserción está desactivada." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[radar-desercion] Feature Flag verification failed", error)
  }

  try {
    const { nombre, curso, promedio, asistencia, observaciones, alertas } = await req.json()
    if (!nombre || !curso) {
      return NextResponse.json({ error: "Faltan parámetros requeridos." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini." }, { status: 500 })
    }

    const prompt = buildPrompt(
      nombre,
      curso,
      promedio ?? "Sin notas",
      asistencia ?? "Sin registro",
      observaciones || [],
      alertas || []
    )

    const model = "gemini-2.0-flash"
    const budget = await checkAiBudget(uid, { feature: "radar-desercion", inputText: prompt })
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
      console.error("[radar-desercion] Gemini API error:", rawText)
      throw parseGeminiApiError(rawText, response.status, "Gemini no pudo generar el analisis de desercion.")
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo respuesta cualitativa.")
    }
    await recordAiUsage({
      uid,
      feature: "radar-desercion",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = JSON.parse(textOutput.trim())
    return NextResponse.json({
      success: true,
      analisis: resultJson
    })
  } catch (error: any) {
    console.error("[radar-desercion] Error:", error)
    return aiErrorResponse(error)
  }
}
