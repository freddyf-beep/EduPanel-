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
  ausenteNombre: string,
  ausenteAsignatura: string,
  bloqueDia: string,
  candidatos: Array<{ nombre: string; especialidad: string; libre: boolean; coincidenciaEspecialidad: boolean }>
) {
  const candidatosTexto = candidatos.map(c => 
    `- Profesor: ${c.nombre} | Especialidad: ${c.especialidad} | Disponible en el bloque: ${c.libre ? "SÍ" : "NO"} | Coincide Especialidad: ${c.coincidenciaEspecialidad ? "SÍ" : "NO"}`
  ).join("\n")

  return `Eres una IA consultora de dirección y recursos humanos escolares de un establecimiento educativo chileno.
Tu labor es sugerir la mejor opción de profesor de reemplazo (sustituto) para cubrir una ausencia:

DETALLES DE LA AUSENCIA:
- Profesor Ausente: ${ausenteNombre}
- Asignatura a cubrir: ${ausenteAsignatura}
- Día y Bloque Horario: ${bloqueDia}

CANDIDATOS DISPONIBLES:
${candidatosTexto}

Por favor, analiza la mejor opción basándote en:
1. Disponibilidad horaria (los que NO están libres no deben ser recomendados).
2. Afinidad pedagógica (los que coinciden en especialidad son prioridad).

Genera una respuesta en formato JSON con la siguiente estructura:
{
  "mejorCandidato": "Nombre del profesor recomendado",
  "razonRecomendacion": "Explicación detallada de por qué es la mejor opción pedagógica y horaria.",
  "candidatosAlternativos": ["Nombre - Razón breve...", "Nombre - Razón..."],
  "mensajeInvitacionDocente": "Estimado/a [Nombre], le escribimos para solicitar su apoyo con un reemplazo..."
}

Mantén un tono profesional y empático escolar.`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const aiAccessResponse = await requireIntegratedAiAccess(authCheck.auth)
  if (aiAccessResponse) return aiAccessResponse
  const authUser = authCheck.auth

  // Verificar Feature Flag
  try {
    const flags = await getFeatureFlags()
    if (!flags["agent-sustituciones"]?.active) {
      return NextResponse.json(
        { error: "La función de Agente de Sustituciones está desactivada." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[agente-sustituciones] Feature Flag verification failed", error)
  }

  try {
    const { ausenteNombre, ausenteAsignatura, bloqueDia, candidatos } = await req.json()

    if (!ausenteNombre || !ausenteAsignatura || !bloqueDia || !Array.isArray(candidatos)) {
      return NextResponse.json({ error: "Faltan parámetros requeridos." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini." }, { status: 500 })
    }

    const prompt = buildPrompt(ausenteNombre, ausenteAsignatura, bloqueDia, candidatos)
    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "agent-sustituciones", inputText: prompt })
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
            temperature: 0.4,
            responseMimeType: "application/json"
          }
        })
      }
    )

    const rawText = await response.text()
    if (!response.ok) {
      console.error("[agente-sustituciones] Gemini API error:", rawText)
      throw parseGeminiApiError(rawText, response.status, "Gemini no pudo sugerir un sustituto.")
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo recomendación de sustitución.")
    }

    await recordAiUsage({
      uid: authUser.uid,
      feature: "agent-sustituciones",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = JSON.parse(textOutput.trim())
    return NextResponse.json({
      success: true,
      recomendacion: resultJson
    })
  } catch (error: any) {
    console.error("[agente-sustituciones] Error:", error)
    return aiErrorResponse(error)
  }
}
