import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { requireIntegratedAiAccess } from "@/lib/auth/ai-access"
import { getFeatureFlags } from "@/lib/feature-flags"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"

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

function parseJsonResponse(rawText: string): Record<string, any> {
  const cleaned = rawText
    .replace(/^```json\s*/i, "")
    .replace(/```$/, "")
    .trim()
  return JSON.parse(cleaned)
}

function buildRutasPrompt(
  nombre: string,
  curso: string,
  asignatura: string,
  oaId: string,
  promedio: string,
  dificultades: string
) {
  return `Eres un psicopedagogo chileno experto en adecuación curricular, DUA (Diseño Universal para el Aprendizaje) y reforzamiento pedagógico escolar.
Tu misión es generar una Ruta de Aprendizaje Personalizada (Guía de refuerzo 1-a-1) estructurada para el siguiente estudiante chileno que tiene el Objetivo de Aprendizaje (OA) descendido:

ESTUDIANTE: ${nombre}
CURSO: ${curso}
ASIGNATURA: ${asignatura}
PROMEDIO EN LA ASIGNATURA: ${promedio}
OBJETIVO DE APRENDIZAJE DESCENDIDO: ${oaId}
DIFICULTADES DETECTADAS / OBSERVACIONES:
${dificultades || "Dificultad general para alcanzar los logros de aprendizaje de este OA."}

DIRECTRICES DE REDACCIÓN:
1. **Tono**: Súper motivador, cercano y empático. Háblale directamente al estudiante para que se sienta acompañado y capaz de superarlo.
2. **Estructura**:
   - **Titulo**: Título dinámico y motivador (ej: "¡Camino a dominar las Fracciones, Mateo!").
   - **ExplicacionSimple**: Explicación conceptual ultra sencilla del OA, usando analogías cotidianas acordes al curso (ej. si es 5° básico, usar comida, deportes, etc.).
   - **EjemploResuelto**: Un ejercicio práctico resuelto paso a paso con peras y manzanas.
   - **EjerciciosPropuestos**: Tres ejercicios prácticos de menor a mayor complejidad con espacio de resolución.
   - **ChecklistMetacognicion**: Un minichecklist para que el estudiante evalúe qué tanto comprendió cada paso (Checklist de logros).
   - **MensajeAliento**: Frase final de apoyo.
3. Todo debe estar redactado en español chileno escolar formal y adaptado al nivel de desarrollo cognitivo de un estudiante de ${curso}.

Responde ESTRICTAMENTE con un JSON puro (sin bloques de código markdown) con la siguiente estructura:
{
  "titulo": "...",
  "explicacionSimple": "...",
  "ejemploResuelto": {
    "enunciado": "...",
    "pasoAPaso": ["Paso 1...", "Paso 2...", "Paso 3..."],
    "resultadoFinal": "..."
  },
  "ejerciciosPropuestos": [
    {
      "numero": 1,
      "enunciado": "...",
      "pista": "..."
    },
    {
      "numero": 2,
      "enunciado": "...",
      "pista": "..."
    },
    {
      "numero": 3,
      "enunciado": "...",
      "pista": "..."
    }
  ],
  "checklistLogros": [
    "Puedo identificar...",
    "Logro resolver...",
    "Sé cómo comprobar..."
  ],
  "mensajeAliento": "..."
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
    if (!flags["rutas-aprendizaje"]?.active) {
      return NextResponse.json(
        { error: "Esta función está desactivada por el administrador." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[rutas-aprendizaje] Feature Flag verification failed", error)
  }

  try {
    const { nombre, curso, asignatura, oaId, promedio, dificultades } = await req.json()
    if (!nombre || !oaId) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: nombre y oaId." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini en el servidor." }, { status: 500 })
    }

    const prompt = buildRutasPrompt(
      nombre,
      curso || "5° Básico",
      asignatura || "Matemática",
      oaId,
      promedio || "Sin notas",
      dificultades || ""
    )
    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "rutas-aprendizaje", inputText: prompt })
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
            temperature: 0.7,
            responseMimeType: "application/json"
          }
        })
      }
    )

    const rawText = await response.text()
    if (!response.ok) {
      console.error("[rutas-aprendizaje] API error response:", rawText)
      throw new Error(`API error (${response.status})`)
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo texto de la respuesta de Gemini.")
    }

    await recordAiUsage({
      uid: authUser.uid,
      feature: "rutas-aprendizaje",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = parseJsonResponse(textOutput)
    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("[rutas-aprendizaje] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
