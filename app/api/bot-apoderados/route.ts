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
    if (!flags["bot-apoderados"]?.active) {
      return NextResponse.json(
        { error: "Función Premium inactiva. Habilítela en el panel de administración." },
        { status: 403 }
      )
    }

    const { student, observaciones, curso, asignatura } = await req.json()

    if (!student || !student.nombre) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: student.nombre." }, { status: 400 })
    }

    const prompt = `
      Eres un tutor escolar inteligente y empático. Redacta un reporte o mensaje informativo dirigido al apoderado (padre/madre/tutor) del estudiante "${student.nombre}".
      
      Información del estudiante:
      Curso: ${curso || "No especificado"}
      Asignatura: ${asignatura || "No especificada"}
      Promedio actual: ${student.promedio !== undefined && student.promedio !== null ? student.promedio : "Sin notas aún"}
      Asistencia: ${student.porcentajeAsistencia !== undefined && student.porcentajeAsistencia !== null ? `${student.porcentajeAsistencia}%` : "No registrada"}
      PIE (Programa de Integración Escolar): ${student.pie ? "Sí (requiere adecuaciones)" : "No"}
      
      Observaciones recientes del docente:
      ${observaciones && observaciones.length > 0 ? observaciones.join("\n") : "No hay observaciones negativas registradas."}
      
      Instrucciones de redacción:
      1. El tono debe ser extremadamente constructivo, respetuoso y colaborativo. No debe sonar punitivo ni acusatorio.
      2. Divide el mensaje en 3 partes claras:
         - Saludo y resumen del estado académico del alumno (destacando lo positivo primero).
         - Oportunidades de mejora o alertas (ej: asistencia, notas o conducta), explicadas de forma empática.
         - Acciones concretas y sencillas que el apoderado puede realizar en el hogar para apoyar el aprendizaje.
      3. Mantén el mensaje relativamente breve y amigable (máximo 250 palabras), adecuado para enviarse por WhatsApp o correo electrónico. Usa emojis amigables.

      Responde únicamente con un objeto JSON structured (sin markdown wrappers):
      {
        "asunto": "[Asunto sugerido para el correo]",
        "mensaje": "[Cuerpo completo del mensaje redactado]",
        "consejoHogar": "[Consejo rápido para el hogar]"
      }
    `

    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "bot-apoderados", inputText: prompt })
    if (!budget.ok) return budget.response

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.3
      }
    })

    const text = response.text?.trim() || "{}"
    await recordAiUsage({
      uid: authUser.uid,
      feature: "bot-apoderados",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: text,
      usageMetadata: (response as any)?.usageMetadata,
    })
    const resultJson = JSON.parse(text)

    return NextResponse.json(resultJson)
  } catch (error: any) {
    console.error("Error en Bot Apoderados API:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor." }, { status: 500 })
  }
}
