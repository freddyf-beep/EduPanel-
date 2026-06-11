import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
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

function buildBloomPrompt(documentoJson: string) {
  return `Eres un experto internacional en psicometría, evaluación educativa y la Taxonomía de Bloom revisada (Anderson & Krathwohl).
Tu tarea es auditar y calibrar el nivel cognitivo de la siguiente evaluación escolar chilena.

EVALUACIÓN A EVALUAR (JSON):
${documentoJson}

INSTRUCCIONES DE AUDITORÍA:
1. Analiza cada ítem/pregunta de la prueba.
2. Clasifica cada pregunta en una de las 6 categorías de la Taxonomía de Bloom revisada:
   - "Recordar" (Nivel Bajo)
   - "Comprender" (Nivel Bajo)
   - "Aplicar" (Nivel Medio)
   - "Analizar" (Nivel Medio)
   - "Evaluar" (Nivel Alto)
   - "Crear" (Nivel Alto)
3. Estima un porcentaje general de distribución cognitiva para la prueba completa. En general, una buena prueba escolar debe tener un equilibrio (por ejemplo, 40% niveles bajos, 40% niveles medios, 20% niveles altos), aunque depende de los objetivos de aprendizaje.
4. Para cada pregunta de la evaluación, proporciona:
   - Su nivel Bloom identificado.
   - Una breve explicación psicométrica de por qué pertenece a ese nivel.
   - Una sugerencia de redacción/planteamiento alternativo si el docente desea "subir" el nivel cognitivo de esa pregunta (por ejemplo, transformar una pregunta de "Recordar" a una de "Aplicar" o "Analizar").
5. Da un diagnóstico general y 3 recomendaciones para optimizar el rigor cognitivo de la prueba.

Responde ESTRICTAMENTE con un JSON puro (sin bloques de código markdown) con la siguiente estructura:
{
  "diagnosticoGeneral": "Resumen del análisis cognitivo de la prueba...",
  "distribucion": {
    "Recordar": 25, // porcentaje de 0 a 100
    "Comprender": 35,
    "Aplicar": 20,
    "Analizar": 10,
    "Evaluar": 10,
    "Crear": 0
  },
  "auditoriaPreguntas": [
    {
      "preguntaId": "id_de_la_pregunta", // si no tiene, usa un índice o texto identificador
      "enunciadoCorto": "Enunciado corto o comienzo de la pregunta...",
      "nivelIdentificado": "Recordar",
      "explicacion": "El estudiante solo debe evocar de memoria la fecha del evento...",
      "sugerenciaSubirNivel": "En lugar de preguntar cuándo ocurrió, presente un breve extracto del diario de la época y pregunte qué causa se deduce..."
    }
  ],
  "recomendaciones": [
    "Recomendación 1...",
    "Recomendación 2...",
    "Recomendación 3..."
  ]
}`
}

function resumirItem(item: any): Record<string, unknown> {
  return {
    id: item.id,
    tipo: item.tipo,
    enunciado: item.enunciado,
    puntaje: item.puntaje ?? item.puntos,
    oaVinculado: item.oaVinculado,
    alternativas: item.alternativas,
    respuestaCorrecta: item.respuestaCorrecta,
    columnaA: item.columnaA,
    columnaB: item.columnaB,
    pasos: item.pasos,
    textoConBlancos: item.textoConBlancos,
    datos: item.datos,
  }
}

function resumirDocumento(documento: any): Record<string, unknown> {
  return {
    nombre: documento.nombre,
    objetivo: documento.objetivo,
    secciones: (documento.secciones || []).map((sec: any) => ({
      titulo: sec.titulo,
      instrucciones: sec.instrucciones ?? sec.descripcion,
      items: (sec.items || sec.actividades || []).map(resumirItem),
    })),
  }
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

  // Verificar Feature Flag
  try {
    const flags = await getFeatureFlags()
    if (!flags["calibrador-bloom"]?.active) {
      return NextResponse.json(
        { error: "Esta función está desactivada por el administrador." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[calibrar-bloom] Feature Flag verification failed", error)
  }

  try {
    const { documento } = await req.json()
    if (!documento) {
      return NextResponse.json({ error: "Falta el documento a calibrar." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini en el servidor." }, { status: 500 })
    }

    const docJson = JSON.stringify(resumirDocumento(documento), null, 2)

    const prompt = buildBloomPrompt(docJson)
    const model = "gemini-2.0-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "calibrador-bloom", inputText: prompt })
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
            temperature: 0.3,
            responseMimeType: "application/json"
          }
        })
      }
    )

    const rawText = await response.text()
    if (!response.ok) {
      console.error("[calibrar-bloom] API error response:", rawText)
      throw new Error(`API error (${response.status})`)
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo texto de la respuesta de Gemini.")
    }
    await recordAiUsage({
      uid: authUser.uid,
      feature: "calibrador-bloom",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = parseJsonResponse(textOutput)
    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("[calibrar-bloom] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
