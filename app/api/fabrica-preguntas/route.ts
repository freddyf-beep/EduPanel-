import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { requireIntegratedAiAccess } from "@/lib/auth/ai-access"
import { getFeatureFlags } from "@/lib/feature-flags"
import { db } from "@/lib/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"
import { aiErrorResponse, parseGeminiApiError } from "@/lib/server/gemini-error"

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

function buildFabricaPrompt(
  asignatura: string,
  curso: string,
  oa: string,
  tema: string,
  cantidad: number,
  tipoItems: string[]
) {
  const tiposTexto = tipoItems.join(", ")

  return `Eres un experto chileno de diseño curricular y evaluación pedagógica para educación básica y media.
Tu objetivo es fabricar exactamente ${cantidad} preguntas de evaluación de alta calidad psicométrica, alineadas con los siguientes parámetros:

ASIGNATURA: ${asignatura}
CURSO: ${curso}
OBJETIVO DE APRENDIZAJE (OA): ${oa}
TEMA / CONTENIDO ESPECÍFICO: ${tema}
TIPOS DE ÍTEMS PERMITIDOS: [${tiposTexto}]

DIRECTRICES TÉCNICAS:
1. Las preguntas deben ser rigurosas, claras, sin ambigüedades.
2. Cada pregunta debe pertenecer a uno de los tipos permitidos:
   - "seleccion_multiple": Debe tener un enunciado y 4 alternativas (sólo una es correcta).
   - "verdadero_falso": Debe tener un enunciado y la respuestaCorrecta (booleano).
   - "desarrollo": Debe tener enunciado y pautaCorreccion.
   - "completar": Debe tener enunciado, un textoConBlancos (con "__" marcando los espacios) y respuestas (arreglo con los textos correctos).
3. Todo el contenido debe ser apropiado para la edad/curso indicados.

Responde ESTRICTAMENTE con un JSON puro (sin bloques de código markdown) con la siguiente estructura:
{
  "preguntas": [
    {
      "tipo": "seleccion_multiple",
      "enunciado": "Enunciado de la pregunta...",
      "alternativas": [
        { "id": "alt_1", "texto": "Texto alternativa A", "esCorrecta": true },
        { "id": "alt_2", "texto": "Texto alternativa B", "esCorrecta": false },
        { "id": "alt_3", "texto": "Texto alternativa C", "esCorrecta": false },
        { "id": "alt_4", "texto": "Texto alternativa D", "esCorrecta": false }
      ],
      "puntaje": 1,
      "oaVinculado": "${oa}",
      "habilidad": "comprender" // recordar, comprender, aplicar, analizar, evaluar o crear
    },
    {
      "tipo": "verdadero_falso",
      "enunciado": "Enunciado verdadero/falso...",
      "respuestaCorrecta": false,
      "pideJustificacion": true,
      "puntaje": 1,
      "oaVinculado": "${oa}"
    },
    {
      "tipo": "desarrollo",
      "enunciado": "Pregunta de desarrollo...",
      "pautaCorreccion": "Criterios de corrección sugeridos...",
      "lineasRespuesta": 4,
      "puntaje": 3,
      "oaVinculado": "${oa}"
    }
  ]
}`
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const aiAccessResponse = await requireIntegratedAiAccess(authCheck.auth)
  if (aiAccessResponse) return aiAccessResponse
  const authUser = authCheck.auth
  const uid = authUser.uid

  const rl = checkRateLimit(uid)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en una hora." },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    )
  }

  // Verificar Feature Flag
  try {
    const flags = await getFeatureFlags()
    if (!flags["fabrica-preguntas"]?.active) {
      return NextResponse.json(
        { error: "Esta función está desactivada por el administrador." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[fabrica-preguntas] Feature Flag verification failed", error)
  }

  try {
    const { asignatura, curso, oa, tema, cantidad, tipoItems } = await req.json()
    if (!asignatura || !curso || !oa || !tema || !cantidad || !tipoItems || tipoItems.length === 0) {
      return NextResponse.json({ error: "Faltan parámetros requeridos." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini." }, { status: 500 })
    }

    const prompt = buildFabricaPrompt(
      asignatura,
      curso,
      oa,
      tema,
      cantidad,
      tipoItems
    )

    const model = "gemini-2.0-flash"
    const budget = await checkAiBudget(uid, { feature: "fabrica-preguntas", inputText: prompt })
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
      console.error("[fabrica-preguntas] API error response:", rawText)
      throw parseGeminiApiError(rawText, response.status, "Gemini no pudo fabricar preguntas.")
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo texto de la respuesta de Gemini.")
    }
    await recordAiUsage({
      uid,
      feature: "fabrica-preguntas",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = parseJsonResponse(textOutput)
    const preguntasGeneradas = resultJson.preguntas || []

    // Guardar automáticamente cada pregunta en Firestore users/{uid}/itemBank
    const savedIds: string[] = []
    const colRef = collection(db, "users", uid, "itemBank")

    for (let i = 0; i < preguntasGeneradas.length; i++) {
      const q = preguntasGeneradas[i]
      // Generar un ID único simulado para la pregunta
      const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      q.id = id

      const entry = {
        payload: q,
        metadata: {
          asignatura,
          curso,
          oas: [oa],
          origen: "prueba",
          autor: uid,
          timestamp: new Date()
        },
        createdAt: new Date()
      }

      const docRef = await addDoc(colRef, entry)
      savedIds.push(docRef.id)
    }

    return NextResponse.json({
      success: true,
      mensaje: `Se fabricaron y guardaron ${preguntasGeneradas.length} preguntas con éxito en el Banco de Ítems.`,
      preguntas: preguntasGeneradas,
      savedIds
    })
  } catch (error: any) {
    console.error("[fabrica-preguntas] Error:", error)
    return aiErrorResponse(error)
  }
}
