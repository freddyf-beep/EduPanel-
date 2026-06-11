import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
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
  asignatura: string,
  curso: string,
  totalOas: number,
  oasCubiertos: number,
  oasParciales: number,
  oasPendientes: number,
  clasesFirmadas: number,
  semanasRestantes: number,
  detallesOas: string[]
) {
  const oasDetallesTexto = detallesOas.length > 0
    ? detallesOas.join("\n")
    : "Sin detalles de OAs disponibles."

  return `Eres una IA consultora de diseño curricular y aseguramiento del aprendizaje del Ministerio de Educación (MINEDUC) de Chile.
Tu labor es realizar un Análisis Predictivo de Cobertura Curricular y Plan de Ajuste del Tiempo para el siguiente curso:

ASIGNATURA: ${asignatura}
CURSO: ${curso}

MÉTRICAS CURRICULARES ACTUALES:
- Total de Objetivos de Aprendizaje (OAs): ${totalOas}
- OAs Cubiertos (evaluados en pruebas/actividades): ${oasCubiertos}
- OAs Parciales (vistos solo en guías o clases firmadas): ${oasParciales}
- OAs Pendientes (no abordados): ${oasPendientes}
- Clases Registradas/Firmadas: ${clasesFirmadas}
- Semanas de Clases Restantes en el año académico: ${semanasRestantes} semanas

LISTADO DETALLADO DE ESTADO POR OA:
${oasDetallesTexto}

Por favor, redacta una propuesta de ajuste curricular y proyección en formato JSON con la siguiente estructura exacta:
{
  "porcentajeProyectado": "X%" (ej. 85%),
  "diagnosticoTiempo": "Evaluación del tiempo disponible contra la densidad curricular restante.",
  "oasEnRiesgo": ["OA X...", "OA Y..."],
  "estrategiaCompactacion": ["Propuesta 1 de fusión de objetivos...", "Propuesta 2..."],
  "sugerenciasPlanificacion": ["Recomendación práctica 1...", "Recomendación práctica 2..."]
}

Mantén un tono técnico, realista, pragmático y de apoyo al docente para optimizar la cobertura sin sobrecargar al estudiante.`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const authUser = authCheck.auth

  // Verificar Feature Flag
  try {
    const flags = await getFeatureFlags()
    if (!flags["predictor-cobertura"]?.active) {
      return NextResponse.json(
        { error: "La función de Predictor de Cobertura Curricular está desactivada." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[predictor-cobertura] Feature Flag verification failed", error)
  }

  try {
    const {
      asignatura,
      curso,
      totalOas,
      oasCubiertos,
      oasParciales,
      oasPendientes,
      clasesFirmadas,
      semanasRestantes,
      detallesOas
    } = await req.json()

    if (!asignatura || !curso) {
      return NextResponse.json({ error: "Faltan parámetros requeridos." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini." }, { status: 500 })
    }

    const prompt = buildPrompt(
      asignatura,
      curso,
      totalOas || 0,
      oasCubiertos || 0,
      oasParciales || 0,
      oasPendientes || 0,
      clasesFirmadas || 0,
      semanasRestantes || 12,
      detallesOas || []
    )

    const model = "gemini-2.0-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "predictor-cobertura", inputText: prompt })
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
      console.error("[predictor-cobertura] Gemini API error:", rawText)
      throw parseGeminiApiError(rawText, response.status, "Gemini no pudo predecir la cobertura curricular.")
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo respuesta de cobertura.")
    }
    await recordAiUsage({
      uid: authUser.uid,
      feature: "predictor-cobertura",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = JSON.parse(textOutput.trim())
    return NextResponse.json({
      success: true,
      reporte: resultJson
    })
  } catch (error: any) {
    console.error("[predictor-cobertura] Error:", error)
    return aiErrorResponse(error)
  }
}
