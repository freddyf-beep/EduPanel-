import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { requireIntegratedAiAccess } from "@/lib/auth/ai-access"
import { getFeatureFlags } from "@/lib/feature-flags"
import { db } from "@/lib/firebase"
import { collection, doc, setDoc, addDoc, getDocs, query, where } from "firebase/firestore"
import { checkAiBudget, recordAiUsage } from "@/lib/server/ai-usage"

const RATE_LIMIT_PER_HOUR = 10
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

function buildCurriculumPrompt(rawText: string, asignatura: string, curso: string) {
  return `Eres un experto curricular del Ministerio de Educación de Chile (Mineduc).
Tu labor es tomar el siguiente fragmento de texto extraído de un PDF oficial de bases curriculares y extraer los Objetivos de Aprendizaje (OAs) de forma estructurada para poblar nuestra base de datos.

ASIGNATURA OBJETIVO: ${asignatura}
CURSO OBJETIVO: ${curso}

TEXTO EXTRACTADO DEL PDF:
${rawText}

DIRECTRICES DE EXTRACCIÓN:
1. Encuentra todos los Objetivos de Aprendizaje (OAs) descritos. Cada OA tiene un código (ej. OA 1, OA 05, etc.) y una descripción de la habilidad y conocimiento a desarrollar.
2. Identifica el Eje Temático al que pertenece cada OA (ej. "Números y Operaciones", "Lectura", "Geografía").
3. Si el texto lo contiene, extrae Indicadores de Evaluación sugeridos para cada OA.
4. Si el texto lo contiene, identifica el nombre de la Unidad correspondiente (ej. "Unidad 1", "Unidad 2" o nombre específico).

Responde ESTRICTAMENTE con un JSON puro (sin bloques de código markdown) con la siguiente estructura:
{
  "unidadNombre": "Nombre de la Unidad detectada...",
  "objetivos": [
    {
      "codigo": "OA 01",
      "descripcion": "Descripción del objetivo en infinitivo...",
      "eje": "Nombre del Eje Temático...",
      "indicadores": [
        "Indicador de evaluación 1...",
        "Indicador de evaluación 2..."
      ]
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
    if (!flags["expansion-curriculum"]?.active) {
      return NextResponse.json(
        { error: "Esta función está desactivada por el administrador." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[expansion-curriculum] Feature Flag verification failed", error)
  }

  try {
    const { rawText, asignatura, curso, pdfUrl } = await req.json()
    if (!rawText || !asignatura || !curso) {
      return NextResponse.json({ error: "Faltan parámetros requeridos: rawText, asignatura, curso." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini." }, { status: 500 })
    }

    const prompt = buildCurriculumPrompt(rawText, asignatura, curso)
    const model = "gemini-2.5-flash"
    const budget = await checkAiBudget(authUser.uid, { feature: "expansion-curriculum", inputText: prompt })
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
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      }
    )

    const rawResultText = await response.text()
    if (!response.ok) {
      console.error("[expansion-curriculum] API error response:", rawResultText)
      throw new Error(`API error (${response.status})`)
    }

    const parsedResponse = JSON.parse(rawResultText)
    const textOutput = extractGeminiText(parsedResponse)
    if (!textOutput) {
      throw new Error("No se obtuvo texto de la respuesta de Gemini.")
    }
    await recordAiUsage({
      uid: authUser.uid,
      feature: "expansion-curriculum",
      provider: "gemini",
      model,
      inputText: prompt,
      outputText: textOutput,
      usageMetadata: parsedResponse?.usageMetadata,
    })

    const resultJson = parseJsonResponse(textOutput)
    const objetivosExtraidos = resultJson.objetivos || []
    const unidadNombre = resultJson.unidadNombre || "Unidad Nueva (Importada)"

    // Buscar si existe el documento base de asignatura + curso en "curriculo"
    const curriculoRef = collection(db, "curriculo")
    const q = query(curriculoRef, where("asignatura", "==", asignatura), where("curso", "==", curso))
    const snap = await getDocs(q)

    let docId = ""
    if (!snap.empty) {
      docId = snap.docs[0].id
    } else {
      // Crear documento base si no existe
      const newDoc = await addDoc(curriculoRef, {
        asignatura,
        curso,
        creadoPor: authUser.uid,
        creadoEn: new Date()
      })
      docId = newDoc.id
    }

    // Agregar unidad a la subcoleccion "unidades"
    const unidadesRef = collection(db, "curriculo", docId, "unidades")
    const unidadDoc = await addDoc(unidadesRef, {
      nombre: unidadNombre,
      descripcion: `Importado de PDF${pdfUrl ? ` (${pdfUrl})` : ""}`,
      orden: 99
    })
    const unidadId = unidadDoc.id

    // Agregar objetivos a "objetivos_aprendizaje" de la unidad
    const oasRef = collection(db, "curriculo", docId, "unidades", unidadId, "objetivos_aprendizaje")
    for (let i = 0; i < objetivosExtraidos.length; i++) {
      const oa = objetivosExtraidos[i]
      await addDoc(oasRef, {
        codigo: oa.codigo,
        descripcion: oa.descripcion,
        eje: oa.eje || "General",
        indicadores: oa.indicadores || [],
        orden: i + 1
      })
    }

    return NextResponse.json({
      success: true,
      mensaje: `Se importó exitosamente la unidad "${unidadNombre}" con ${objetivosExtraidos.length} objetivos de aprendizaje.`,
      unidadId,
      unidadNombre,
      objetivosCount: objetivosExtraidos.length
    })
  } catch (error: any) {
    console.error("[expansion-curriculum] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
