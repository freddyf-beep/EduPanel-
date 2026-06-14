import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { requireIntegratedAiAccess } from "@/lib/auth/ai-access"
import { checkAiBudget, estimateTokensFromText, recordAiUsage } from "@/lib/server/ai-usage"
import { aiErrorResponse, parseGeminiApiError } from "@/lib/server/gemini-error"

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

function isValidRubrica(rubrica: any): boolean {
  return Boolean(
    rubrica &&
    Array.isArray(rubrica.partes) &&
    rubrica.partes.every((parte: any) =>
      parte &&
      Array.isArray(parte.criterios)
    )
  )
}

function isValidLista(lista: any): boolean {
  return Boolean(
    lista &&
    Array.isArray(lista.secciones) &&
    lista.secciones.every((seccion: any) =>
      seccion &&
      Array.isArray(seccion.indicadores)
    )
  )
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

function buildCorregirListaPrompt(lista: any, studentName?: string) {
  const escala = Array.isArray(lista.escalaDicotomica) ? lista.escalaDicotomica : ["Si", "No"]
  return `Eres un docente experto del sistema educacional chileno. Tu tarea es evaluar el trabajo/prueba adjunto de un estudiante utilizando la siguiente lista de cotejo:

DATOS GENERALES DE LA LISTA:
- Nombre: ${lista.nombre || "Sin nombre"}
- Asignatura: ${lista.asignatura || "Sin asignatura"}
- Curso: ${lista.curso || "Sin curso"}
- Escala: ${escala[0]} / ${escala[1]}
${lista.unidadNombre ? `- Unidad: ${lista.unidadNombre}` : ""}

INDICADORES OBSERVABLES:
${lista.secciones.map((seccion: any, sIdx: number) => {
  return `Seccion ${sIdx + 1}: ${seccion.nombre}
${seccion.indicadores.map((indicador: any) => {
    return `- Indicador ID: "${indicador.id}"
  Texto: "${indicador.texto}"
  ${indicador.esTransversal ? "Tipo: indicador transversal actitudinal." : ""}
  ${indicador.focoDiferenciadoActivo ? `Canal alternativo DUA: ${indicador.focoDiferenciadoTexto || "No especificado"}` : ""}`
  }).join("\n")}`
}).join("\n\n")}

${studentName ? `ALUMNO EVALUADO: ${studentName}` : ""}

INSTRUCCIONES DE CORRECCION:
1. Realiza una transcripcion fiel del contenido visible en la propiedad "transcripcion".
2. Para cada indicador, decide si la evidencia permite marcar ${escala[0]} (true) o ${escala[1]} (false).
3. Si no hay evidencia suficiente para un indicador, marca false y explica la ausencia de evidencia.
4. Redacta observaciones pedagogicas formativas en "observaciones".

Debes responder estrictamente con un objeto JSON que siga esta estructura exacta:
{
  "transcripcion": "Transcripcion del trabajo del estudiante.",
  "respuestas": {
    "<indicadorId>": {
      "valor": true | false,
      "justificacion": "Evidencia concreta usada para decidir."
    }
  },
  "observaciones": "Comentarios finales de retroalimentacion."
}
`
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

  try {
    const { imageBase64, mimeType, rubrica, lista, studentName } = await req.json()
    if (!imageBase64 || !mimeType || (!rubrica && !lista)) {
      return NextResponse.json({ error: "Faltan parametros requeridos: imageBase64, mimeType y rubrica o lista." }, { status: 400 })
    }
    if (rubrica && !isValidRubrica(rubrica)) {
      return NextResponse.json({ error: "Rubrica invalida: debe incluir partes y criterios." }, { status: 400 })
    }
    if (lista && !isValidLista(lista)) {
      return NextResponse.json({ error: "Lista de cotejo invalida: debe incluir secciones e indicadores." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini (GEMINI_API_KEY) en el servidor." }, { status: 500 })
    }

    const prompt = lista ? buildCorregirListaPrompt(lista, studentName) : buildCorregirPrompt(rubrica, studentName)
    const model = "gemini-2.0-flash"
    const budget = await checkAiBudget(authUser.uid, {
      feature: "corregir-con-foto",
      estimatedInputTokens: estimateTokensFromText(prompt) + 2500,
    })
    if (!budget.ok) return budget.response

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
      throw parseGeminiApiError(rawText, response.status, "Gemini no pudo corregir la imagen.")
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
    await recordAiUsage({
      uid: authUser.uid,
      feature: "corregir-con-foto",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
      kind: "multimodal",
    })

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
    return aiErrorResponse(error)
  }
}
