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

function buildSimulacionPrompt(documentoJson: string, tipo: "prueba" | "guia") {
  const tipoLabel = tipo === "prueba" ? "Prueba escrita" : "Guía de trabajo"

  return `Eres un sistema experto en auditoría pedagógica y psicometría para el sistema escolar chileno.
Tu tarea es simular la resolución de la siguiente ${tipoLabel} por parte de 3 perfiles de estudiantes ficticios distintos:

1. **Mateo (Alumno Destacado)**: Alto rendimiento, hábitos de estudio consolidados, perfeccionista. Se confunde con enunciados ambiguos o pautas poco claras.
2. **Sofía (Alumna Promedio)**: Rendimiento medio, se esfuerza pero le cuesta recordar detalles complejos. Se confunde si la dificultad sube bruscamente.
3. **Lucas (Alumno con TDAH / PIE)**: Dificultades de concentración, lectura veloz e impulsiva. Suele cometer errores por no leer las instrucciones completas o por sobrecarga visual de texto.

EVALUACIÓN ORIGINAL (JSON):
${documentoJson}

INSTRUCCIONES DE SIMULACIÓN:
1. Analiza cada ítem y pregunta de la evaluación.
2. Determina cómo respondería cada uno de los 3 estudiantes (Mateo, Sofía, Lucas).
3. Identifica errores específicos o confusiones que tendrían en preguntas concretas (por ejemplo: "En la Pregunta 2 de Selección Múltiple, Lucas se confunde porque la instrucción tiene una doble negación y marca B en lugar de A").
4. Calcula una nota estimada (de 1.0 a 7.0 en la escala chilena) para cada estudiante basada en su simulación.
5. Evalúa un "Índice de Claridad General" de la evaluación de 0 a 100.
6. Genera 3 recomendaciones de mejora pedagógica inmediatas para el docente.

Responde ESTRICTAMENTE con un JSON puro (sin bloques de código markdown) con la siguiente estructura:
{
  "indiceClaridad": 85, // número de 0 a 100
  "diagnosticoGeneral": "Resumen de la calidad psicométrica de la prueba y su nivel de dificultad general...",
  "simulaciones": [
    {
      "alumno": "Mateo",
      "perfil": "Alumno Destacado",
      "notaEstimada": 6.7, // número
      "tiempoEstimadoMinutos": 35,
      "erroresCometidos": [
        {
          "item": "Sección I, Pregunta 3",
          "causa": "Se confundió por la ambigüedad en la alternativa C, que comparte similitudes con la correcta."
        }
      ],
      "comentarioComprension": "Comprendió el 95% de la prueba. Tuvo un excelente desempeño pero critica la falta de espacio en la sección de desarrollo."
    },
    {
      "alumno": "Sofía",
      "perfil": "Alumna Promedio",
      "notaEstimada": 5.4,
      "tiempoEstimadoMinutos": 45,
      "erroresCometidos": [
        {
          "item": "Sección II, Pregunta 1",
          "causa": "No recordó la fórmula específica y no había pistas visuales o contextuales."
        }
      ],
      "comentarioComprension": "Le pareció una prueba de longitud adecuada, aunque sintió que la sección de desarrollo exigía memorización excesiva."
    },
    {
      "alumno": "Lucas",
      "perfil": "Alumno con TDAH / PIE",
      "notaEstimada": 4.1,
      "tiempoEstimadoMinutos": 50,
      "erroresCometidos": [
        {
          "item": "Instrucción General / Pregunta 5",
          "causa": "Omitió leer el enunciado de la pregunta 5 porque estaba muy junto a la anterior y se desorientó con el texto largo."
        }
      ],
      "comentarioComprension": "Presentó alta fatiga lectora a partir de la mitad de la prueba. Recomienda usar negrita en palabras clave."
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
    pideJustificacion: item.pideJustificacion,
    columnaA: item.columnaA,
    columnaB: item.columnaB,
    pasos: item.pasos,
    textoConBlancos: item.textoConBlancos,
    respuestas: item.respuestas,
    bancoPalabras: item.bancoPalabras,
    lineasRespuesta: item.lineasRespuesta,
    datos: item.datos,
  }
}

function resumirDocumento(documento: any, tipo: "prueba" | "guia"): Record<string, unknown> {
  return {
    nombre: documento.nombre,
    objetivo: documento.objetivo,
    instruccionesGenerales: documento.instruccionesGenerales ?? documento.instrucciones,
    secciones: (documento.secciones || []).map((sec: any) => {
      const rawItems = tipo === "guia"
        ? (sec.actividades || [])
        : (sec.items || sec.actividades || [])
      return {
        titulo: sec.titulo,
        instrucciones: sec.instrucciones ?? sec.descripcion,
        items: rawItems.map(resumirItem),
      }
    }),
  }
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
    if (!flags["testeador-alumnos"]?.active) {
      return NextResponse.json(
        { error: "Esta función está desactivada por el administrador." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[simular-alumnos] Feature Flag verification failed", error)
  }

  try {
    const { documento, tipo } = await req.json()
    if (!documento) {
      return NextResponse.json({ error: "Falta el documento a simular." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini en el servidor." }, { status: 500 })
    }

    const tipoDoc: "prueba" | "guia" = tipo === "guia" ? "guia" : "prueba"
    const docJson = JSON.stringify(resumirDocumento(documento, tipoDoc), null, 2)

    const prompt = buildSimulacionPrompt(docJson, tipoDoc)
    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "testeador-alumnos", inputText: prompt })
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
      console.error("[simular-alumnos] API error response:", rawText)
      throw new Error(`API error (${response.status})`)
    }

    const parsedResponse = JSON.parse(rawText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo texto de la respuesta de Gemini.")
    }

    await recordAiUsage({
      uid: authUser.uid,
      feature: "testeador-alumnos",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = parseJsonResponse(textOutput)
    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("[simular-alumnos] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
