import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"

// Rate limit
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

function buildAdaptarPiePrompt(
  tipo: "prueba" | "guia",
  documentoJson: string,
  diagnostico: string,
  notasPie: string,
  especialista: string
) {
  const tipoLabel = tipo === "prueba" ? "prueba escrita" : "guía de aprendizaje"
  return `Eres un experto en educación diferencial del sistema chileno (Decreto 170, DUA y PACI), especialista en adecuaciones curriculares para alumnos con Necesidades Educativas Especiales (NEE).

Tu tarea es adaptar una ${tipoLabel} completa para un alumno con el siguiente diagnóstico PIE:

DIAGNÓSTICO: ${diagnostico || "No especificado"}
ESPECIALISTA ASIGNADO: ${especialista || "No especificado"}
NOTAS ADICIONALES DEL ALUMNO: ${notasPie || "Sin notas adicionales."}

DIRECTRICES DUA (Diseño Universal de Aprendizaje):
1. REPRESENTACIÓN: Ofrecer múltiples formas de presentar la información (visual, auditiva, kinestésica).
2. ACCIÓN Y EXPRESIÓN: Permitir diversas formas de responder (oral, gráfico, kinestésico).
3. COMPROMISO: Aumentar la motivación y engagement con el material.

ESTRATEGIAS DE ADECUACIÓN SEGÚN DIAGNÓSTICO:
- TEL (Trastorno Específico del Lenguaje): Simplificar enunciados, usar vocabulario directo, apoyar con imágenes.
- TDAH (Déficit Atencional): Dividir instrucciones en pasos cortos, reducir cantidad de ítems por página, usar negritas para destacar palabras clave.
- TEA (Trastorno del Espectro Autista): Evitar lenguaje figurado, ser muy literal, instrucciones paso a paso, anticipar cambios de formato.
- DEA (Dificultad de Aprendizaje): Dar más tiempo, reducir cantidad de preguntas manteniendo la esencia, enunciados más cortos.
- DI (Discapacidad Intelectual): Simplificar a nivel concreto, usar apoyo visual, opciones reducidas en selección múltiple.
- FIL (Funcionamiento Intelectual Limítrofe): Similar a DEA con más apoyo concreto y visual.

EVALUACIÓN ORIGINAL (JSON):
${documentoJson}

INSTRUCCIONES DE ADAPTACIÓN:
1. Conserva la estructura general (secciones, tipos de ítem).
2. Simplifica los enunciados usando un lenguaje directo y claro.
3. Agrega apoyos visuales descriptivos donde sea necesario (indica "[APOYO VISUAL: descripción]" en enunciados).
4. En ítems de selección múltiple: reduce a 3 alternativas si hay 4+, elimina distractores ambiguos.
5. En ítems de desarrollo: reduce el número de líneas de respuesta y simplifica la pauta.
6. En ítems de completar: incluye un banco de palabras si no existe.
7. Añade una instrucción general de inicio que indique adecuación curricular.
8. NO elimines secciones completas; adáptalas.
9. Mantén los mismos IDs de sección para que sea compatible con el sistema.
10. Genera nuevos IDs únicos para los ítems (usa el prefijo "pie_" seguido de un timestamp simulado).

Responde ESTRICTAMENTE con un JSON puro (sin bloques de código markdown) con la siguiente estructura:
{
  "nombre": "Nombre de la evaluación adaptada (agrega '(Adecuación PIE)' al final)",
  "instruccionesGenerales": ["instrucción 1 adaptada...", "instrucción 2..."],
  "secciones": [
    {
      "id": "id de la sección original",
      "titulo": "Título adaptado",
      "instrucciones": "Instrucciones simplificadas",
      "tipoPredominante": "tipo original",
      "items": [
        ... ítems adaptados con la misma estructura JSON del original pero con contenido simplificado ...
      ]
    }
  ],
  "notasAdecuacion": "Breve resumen de las adecuaciones realizadas para el registro PACI del docente."
}`
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
    const { tipo, documento, diagnostico, notasPie, especialista } = await req.json()
    if (!tipo || !documento) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: tipo y documento." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini (GEMINI_API_KEY) en el servidor." }, { status: 500 })
    }

    // Serializar solo los campos relevantes para el prompt
    const docJson = JSON.stringify({
      nombre: documento.nombre,
      instruccionesGenerales: documento.instruccionesGenerales,
      secciones: documento.secciones,
    }, null, 2)

    const prompt = buildAdaptarPiePrompt(tipo, docJson, diagnostico || "", notasPie || "", especialista || "")
    const model = "gemini-2.0-flash"

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
      console.error("[adaptar-pie] API error response:", rawText)
      let parsedError
      try { parsedError = JSON.parse(rawText) } catch {}
      throw new Error(parsedError?.error?.message || `API error (${response.status})`)
    }

    let parsedResponse
    try {
      parsedResponse = JSON.parse(rawText)
    } catch (e) {
      console.error("[adaptar-pie] Failed to parse API response as JSON:", rawText)
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
      console.error("[adaptar-pie] Failed to parse generated text as JSON:", textOutput)
      throw new Error("La IA no devolvió un JSON formateado correctamente.")
    }

    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("[adaptar-pie] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
