import { NextResponse } from "next/server"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { getFeatureFlags } from "@/lib/feature-flags"
import { checkAiBudget, estimateImageGenerationCost, recordAiUsage } from "@/lib/server/ai-usage"

const RATE_LIMIT_PER_HOUR = 15
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
    if (!flags["ilustrador-casos"]?.active) {
      return NextResponse.json(
        { error: "Esta función está desactivada por el administrador." },
        { status: 403 }
      )
    }
  } catch (error) {
    console.error("[ilustrador-casos] Feature Flag verification failed", error)
  }

  try {
    const { prompt, tema, aspect = "1:1" } = await req.json()
    if (!prompt) {
      return NextResponse.json({ error: "Falta el prompt de imagen." }, { status: 400 })
    }

    const token = cleanText(process.env.GEMINI_API_KEY)
    if (!token) {
      return NextResponse.json({ error: "Falta la clave de API de Gemini." }, { status: 500 })
    }

    // Intentar llamar a Imagen 3 en Gemini API
    const model = "imagen-3.0-generate-002"
    const imagePrompt = `Educational illustration for school test, clear, simplified, vector/line-art style, white background, subject: ${prompt}`
    const budget = await checkAiBudget(authUser.uid, {
      feature: "ilustrador-casos",
      inputText: imagePrompt,
      estimatedCostUsd: estimateImageGenerationCost(),
    })
    if (!budget.ok) return budget.response

    let base64Image = ""
    let isFallback = false
    let fallbackUrl = ""

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            instances: [
              {
                prompt: imagePrompt
              }
            ],
            parameters: {
              sampleCount: 1,
              outputMimeType: "image/jpeg",
              aspectRatio: aspect
            }
          })
        }
      )

      if (response.ok) {
        const data = await response.json()
        const b64 = data?.predictions?.[0]?.bytesBase64Encoded
        if (b64) {
          base64Image = `data:image/jpeg;base64,${b64}`
          await recordAiUsage({
            uid: authUser.uid,
            feature: "ilustrador-casos",
            provider: "gemini",
            model,
            inputText: imagePrompt,
            outputText: "[image]",
            costOverrideUsd: estimateImageGenerationCost(),
            kind: "image",
          })
        }
      } else {
        console.warn("[ilustrador-casos] Imagen API returned non-OK status, using Unsplash fallback:", response.status)
      }
    } catch (apiError) {
      console.error("[ilustrador-casos] Imagen API call failed, falling back to Unsplash", apiError)
    }

    if (!base64Image) {
      // Fallback a Unsplash con palabras clave relevantes
      isFallback = true
      const query = encodeURIComponent(`${tema || "education"} classroom diagram`)
      fallbackUrl = `https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&w=600&q=80`
      
      // Intentar mapear palabras clave específicas para buscar mejores imágenes
      const keyword = (tema || prompt || "").toLowerCase()
      if (keyword.includes("celula") || keyword.includes("biologia")) {
        fallbackUrl = "https://images.unsplash.com/photo-1532187643603-ba119ca4109e?auto=format&fit=crop&w=600&q=80"
      } else if (keyword.includes("planeta") || keyword.includes("espacio") || keyword.includes("tierra")) {
        fallbackUrl = "https://images.unsplash.com/photo-1614730321146-b6fa6a46bcb4?auto=format&fit=crop&w=600&q=80"
      } else if (keyword.includes("quimica") || keyword.includes("laboratorio")) {
        fallbackUrl = "https://images.unsplash.com/photo-1507668077129-56e32842fceb?auto=format&fit=crop&w=600&q=80"
      } else if (keyword.includes("matematica") || keyword.includes("geometria")) {
        fallbackUrl = "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?auto=format&fit=crop&w=600&q=80"
      } else if (keyword.includes("historia") || keyword.includes("antiguo")) {
        fallbackUrl = "https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=600&q=80"
      }
    }

    return NextResponse.json({
      success: true,
      image: base64Image || fallbackUrl,
      isFallback,
      promptUsado: prompt
    })
  } catch (error: any) {
    console.error("[ilustrador-casos] Error:", error)
    return NextResponse.json({ error: error.message || "Error interno del servidor" }, { status: 500 })
  }
}
