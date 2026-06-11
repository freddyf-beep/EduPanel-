import { NextRequest, NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { getFeatureFlags } from "@/lib/feature-flags"
import { GoogleGenAI } from "@google/genai"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" })

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

export async function POST(req: NextRequest) {
  try {
    const authCheck = await verifyAllowedUser(req)
    if (!authCheck.ok) return authCheck.response
    const authUser = authCheck.auth

    // Rate Limiting
    const rl = checkRateLimit(authUser.uid)
    if (!rl.ok) {
      return NextResponse.json(
        { error: `Demasiadas solicitudes. Intente de nuevo en ${rl.retryAfter} segundos.` },
        { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
      )
    }

    // Comprobar feature flag
    const flags = await getFeatureFlags()
    if (!flags["rubricas-sello"]?.active) {
      return NextResponse.json(
        { error: "Función Premium inactiva. Habilítela en el panel de administración." },
        { status: 403 }
      )
    }

    const { objetivo, sello, niveles, curso, asignatura } = await req.json()

    if (!objetivo || !sello) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: objetivo o sello." }, { status: 400 })
    }

    const prompt = `
      Eres un consultor de diseño curricular experto. Diseña una rúbrica de evaluación analítica que integre de forma transversal el sello educativo "${sello}" junto con el siguiente objetivo/contenido pedagógico: "${objetivo}".
      
      Detalles del contexto:
      Curso: ${curso || "No especificado"}
      Asignatura: ${asignatura || "No especificada"}
      Niveles de desempeño requeridos: ${niveles || 4} (ej: Insatisfactorio, Básico, Competente, Destacado)
      
      Genera exactamente de 3 a 5 criterios de evaluación. Al menos uno de los criterios debe evaluar explícitamente cómo se manifiesta el sello institucional "${sello}" (ej: si el sello es ecológico, evaluar conciencia ambiental; si es artístico, evaluar creatividad y expresión estética, etc.) en el desempeño del estudiante.

      Responde únicamente con un objeto JSON estructurado de la siguiente forma (sin envoltorios markdown, sin explicaciones adicionales):
      {
        "titulo": "Rúbrica con Sello: [Nombre descriptivo]",
        "selloIntegrado": "${sello}",
        "criterios": [
          {
            "nombre": "[Nombre del criterio]",
            "descripcion": "[Qué evalúa este criterio]",
            "desempenos": [
              { "nivel": "[Nombre del nivel, ej: Destacado]", "puntaje": 4, "descriptor": "[Qué hace el alumno para obtener este puntaje]" },
              ...
            ]
          },
          ...
        ]
      }
    `

    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "rubricas-sello", inputText: prompt })
    if (!budget.ok) return budget.response

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.2
      }
    })

    const text = response.text?.trim() || "{}"
    await recordAiUsage({
      uid: authUser.uid,
      feature: "rubricas-sello",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: text,
      usageMetadata: (response as any)?.usageMetadata,
    })
    const resultJson = JSON.parse(text)

    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("Error en Rúbricas Sello API:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor." }, { status: 500 })
  }
}
