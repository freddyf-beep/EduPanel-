// ═══════════════════════════════════════════════════════════════════════════
// Fábrica de preguntas — núcleo de generación reutilizable (server)
// ─────────────────────────────────────────────────────────────────────────
// Lógica pura de generación con Gemini, sin auth ni Firestore, para que la
// pueda usar tanto la ruta interactiva como el cron nocturno
// (app/api/cron/fabrica-preguntas). No reemplaza la ruta interactiva existente.
// ═══════════════════════════════════════════════════════════════════════════

export interface FabricaParams {
  asignatura: string
  curso: string
  oa: string
  tema: string
  cantidad: number
  tipoItems: string[]
}

function cleanText(text: unknown): string {
  return typeof text === "string" ? text.trim() : ""
}

function extractGeminiText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map((p: any) => cleanText(p?.text)).filter(Boolean).join("\n")
}

function parseJsonResponse(rawText: string): Record<string, any> {
  const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```$/, "").trim()
  return JSON.parse(cleaned)
}

export function buildFabricaPrompt(p: FabricaParams): string {
  const tiposTexto = p.tipoItems.join(", ")
  return `Eres un experto chileno de diseño curricular y evaluación pedagógica para educación básica y media.
Tu objetivo es fabricar exactamente ${p.cantidad} preguntas de evaluación de alta calidad psicométrica, alineadas con los siguientes parámetros:

ASIGNATURA: ${p.asignatura}
CURSO: ${p.curso}
OBJETIVO DE APRENDIZAJE (OA): ${p.oa}
TEMA / CONTENIDO ESPECÍFICO: ${p.tema}
TIPOS DE ÍTEMS PERMITIDOS: [${tiposTexto}]

DIRECTRICES TÉCNICAS:
1. Las preguntas deben ser rigurosas, claras, sin ambigüedades.
2. Cada pregunta debe pertenecer a uno de los tipos permitidos:
   - "seleccion_multiple": enunciado y 4 alternativas (sólo una correcta).
   - "verdadero_falso": enunciado y respuestaCorrecta (booleano).
   - "desarrollo": enunciado y pautaCorreccion.
   - "completar": enunciado, textoConBlancos (con "__") y respuestas (arreglo).
3. Todo el contenido debe ser apropiado para la edad/curso indicados.
4. No inventes datos; cíñete al OA y tema dados.

Responde ESTRICTAMENTE con un JSON puro (sin markdown) con la estructura:
{
  "preguntas": [
    {
      "tipo": "seleccion_multiple",
      "enunciado": "...",
      "alternativas": [
        { "id": "alt_1", "texto": "...", "esCorrecta": true },
        { "id": "alt_2", "texto": "...", "esCorrecta": false },
        { "id": "alt_3", "texto": "...", "esCorrecta": false },
        { "id": "alt_4", "texto": "...", "esCorrecta": false }
      ],
      "puntaje": 1,
      "oaVinculado": "${p.oa}",
      "habilidad": "comprender"
    }
  ]
}`
}

/** Genera preguntas con Gemini y devuelve el arreglo parseado. Lanza si falla. */
export async function generarPreguntas(p: FabricaParams): Promise<any[]> {
  const token = cleanText(process.env.GEMINI_API_KEY)
  if (!token) throw new Error("Falta GEMINI_API_KEY")

  const model = cleanText(process.env.GEMINI_FAST_MODEL) || "gemini-2.5-flash"
  const prompt = buildFabricaPrompt(p)

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      }),
    },
  )

  const rawText = await response.text()
  if (!response.ok) {
    throw new Error(`Gemini ${response.status}: ${rawText.slice(0, 300)}`)
  }

  const parsedResponse = JSON.parse(rawText)
  const textOutput = extractGeminiText(parsedResponse)
  if (!textOutput) throw new Error("Gemini no devolvió texto.")

  const resultJson = parseJsonResponse(textOutput)
  return Array.isArray(resultJson.preguntas) ? resultJson.preguntas : []
}
