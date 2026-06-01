import { NextResponse } from "next/server"
import {
  buildEvalCopilotPrompt,
  type EvalCopilotRequest,
  type EvalCopilotMode,
} from "@/lib/ai/evaluaciones-copilot"
import {
  AI_PROVIDER_OPTIONS,
  cleanText,
  parseJsonResponse,
  isJsonParseFailure,
  type AIProvider,
} from "@/lib/ai/copilot"
import { verifyAllowedUser } from "@/lib/auth/verify-token"
import { checkAiQuota, recordAiUsage } from "@/lib/auth/ai-quota"

// Rate limiting identico al de generar-clase
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

class ProviderConfigError extends Error { status = 400 }

async function readJsonOrText(response: Response) {
  const rawText = await response.text()
  try { return { rawText, json: JSON.parse(rawText) as Record<string, any> } }
  catch { return { rawText, json: null } }
}

function extractGeminiText(data: Record<string, any> | null): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map((p: any) => cleanText(p?.text)).filter(Boolean).join("\n")
}

function extractOpenAIText(data: Record<string, any> | null): string {
  return cleanText(data?.choices?.[0]?.message?.content) || ""
}

function extractAnthropicText(data: Record<string, any> | null): string {
  if (!Array.isArray(data?.content)) return ""
  return data.content.map((c: any) => cleanText(c?.text)).filter(Boolean).join("\n")
}

function resolveProvider(raw: string): AIProvider {
  return AI_PROVIDER_OPTIONS.some(o => o.value === raw) ? raw as AIProvider : "public"
}

async function callGemini(body: EvalCopilotRequest, prompt: string, signal?: AbortSignal) {
  const model = cleanText(body.customModel) || "gemini-2.0-flash"
  const token = body.modelProvider === "public"
    ? cleanText(process.env.GEMINI_API_KEY)
    : cleanText(body.customToken) || cleanText(process.env.GEMINI_API_KEY)
  if (!token) throw new ProviderConfigError("Falta GEMINI_API_KEY. Configura tu API key en Ajustes de IA.")
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
    {
      method: "POST", signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.5, responseMimeType: "application/json" },
      }),
    }
  )
  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) throw new Error(cleanText(json?.error?.message) || rawText)
  
  const usage = json?.usageMetadata ? {
    inputTokens: Number(json.usageMetadata.promptTokenCount) || 0,
    outputTokens: Number(json.usageMetadata.candidatesTokenCount) || 0,
  } : undefined

  return {
    text: extractGeminiText(json) || rawText,
    usage,
  }
}

async function callOpenAI(body: EvalCopilotRequest, prompt: string, signal?: AbortSignal) {
  const token = cleanText(body.customToken) || cleanText(process.env.OPENAI_API_KEY)
  if (!token) throw new ProviderConfigError("Falta API key de OpenAI.")
  const model = cleanText(body.customModel) || "gpt-4o-mini"
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model, temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  })
  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) throw new Error(cleanText(json?.error?.message) || rawText)
  
  const usage = json?.usage ? {
    inputTokens: Number(json.usage.prompt_tokens) || 0,
    outputTokens: Number(json.usage.completion_tokens) || 0,
  } : undefined

  return {
    text: extractOpenAIText(json) || rawText,
    usage,
  }
}

async function callAnthropic(body: EvalCopilotRequest, prompt: string, signal?: AbortSignal) {
  const token = cleanText(body.customToken) || cleanText(process.env.ANTHROPIC_API_KEY)
  if (!token) throw new ProviderConfigError("Falta API key de Anthropic.")
  const model = cleanText(body.customModel) || "claude-3-5-sonnet-20241022"
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", "x-api-key": token, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model, temperature: 0.5, max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    }),
  })
  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) throw new Error(cleanText(json?.error?.message) || rawText)
  
  const usage = json?.usage ? {
    inputTokens: Number(json.usage.input_tokens) || 0,
    outputTokens: Number(json.usage.output_tokens) || 0,
  } : undefined

  return {
    text: extractAnthropicText(json) || rawText,
    usage,
  }
}

async function callCompatible(body: EvalCopilotRequest, prompt: string, signal?: AbortSignal) {
  const token = cleanText(body.customToken)
  if (!token) throw new ProviderConfigError("Falta token para endpoint compatible.")
  const endpoint = cleanText(body.customEndpoint)
  if (!endpoint) throw new ProviderConfigError("Falta URL del endpoint compatible.")
  const model = cleanText(body.customModel) || "gpt-4o-mini"
  const base = endpoint.replace(/\/+$/, "")
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      model, temperature: 0.5,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  })
  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) throw new Error(cleanText(json?.error?.message) || rawText)
  
  const usage = json?.usage ? {
    inputTokens: Number(json.usage.prompt_tokens) || 0,
    outputTokens: Number(json.usage.completion_tokens) || 0,
  } : undefined

  return {
    text: extractOpenAIText(json) || rawText,
    usage,
  }
}

async function generateText(provider: AIProvider, body: EvalCopilotRequest, prompt: string, signal?: AbortSignal): Promise<{ text: string; usage?: { inputTokens: number; outputTokens: number } }> {
  if (provider === "openai") return callOpenAI(body, prompt, signal)
  if (provider === "anthropic") return callAnthropic(body, prompt, signal)
  if (provider === "groq") {
    return callCompatible({
      ...body,
      customToken: cleanText(body.customToken) || cleanText(process.env.GROQ_API_KEY),
      customEndpoint: "https://api.groq.com/openai/v1",
    }, prompt, signal)
  }
  if (provider === "compatible") return callCompatible(body, prompt, signal)
  return callGemini(body, prompt, signal)
}

export async function POST(req: Request) {
  const authCheck = await verifyAllowedUser(req)
  if (!authCheck.ok) return authCheck.response
  const auth = authCheck.auth

  const quotaCheck = await checkAiQuota(auth.uid)
  if (!quotaCheck.ok) {
    return NextResponse.json(
      { error: quotaCheck.error },
      { status: 403 }
    )
  }

  const rl = checkRateLimit(auth.uid)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiadas solicitudes. Intenta en una hora." },
      { status: 429, headers: rl.retryAfter ? { "Retry-After": String(rl.retryAfter) } : {} }
    )
  }

  let provider: AIProvider = "gemini"
  let totalInputTokens = 0
  let totalOutputTokens = 0

  const recordTokens = (usage?: { inputTokens: number; outputTokens: number }) => {
    if (usage) {
      totalInputTokens += usage.inputTokens
      totalOutputTokens += usage.outputTokens
    }
  }

  try {
    const body = (await req.json()) as EvalCopilotRequest
    provider = resolveProvider(cleanText(body.modelProvider) || "public")

    const prompt = buildEvalCopilotPrompt(body)
    const isChat = body.modo === "chat"

    const { text: rawText, usage: initialUsage } = await generateText(provider, body, prompt, req.signal)
    recordTokens(initialUsage)

    // Modo chat: respuesta libre
    if (isChat) {
      if (totalInputTokens > 0 || totalOutputTokens > 0) {
        recordAiUsage(auth.uid, totalInputTokens, totalOutputTokens).catch(err => {
          console.error("[generar-evaluacion] Error recording AI usage:", err)
        })
      }
      return NextResponse.json({ respuestaChat: cleanText(rawText) || "No pude generar una respuesta." })
    }

    // Modos JSON: parsear respuesta
    let parsed: Record<string, unknown>
    try {
      parsed = parseJsonResponse(rawText || "{}")
    } catch (parseErr) {
      if (!isJsonParseFailure(parseErr)) throw parseErr
      // Reintento con prompt estricto
      const retryPrompt = `${prompt}\n\nIMPORTANTE: Devuelve SOLO JSON valido, sin texto adicional, sin code-fences.`
      try {
        const { text: retryText, usage: retryUsage } = await generateText(provider, body, retryPrompt, req.signal)
        recordTokens(retryUsage)
        parsed = parseJsonResponse(retryText || "{}")
      } catch (retryErr) {
        if (totalInputTokens > 0 || totalOutputTokens > 0) {
          recordAiUsage(auth.uid, totalInputTokens, totalOutputTokens).catch(err => {
            console.error("[generar-evaluacion] Error recording AI usage:", err)
          })
        }
        return NextResponse.json({
          error: "json_parse_failed",
          message: "La IA no devolvio JSON valido.",
          rawText: (parseErr as any).rawText || rawText || "",
        }, { status: 200 })
      }
    }

    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      recordAiUsage(auth.uid, totalInputTokens, totalOutputTokens).catch(err => {
        console.error("[generar-evaluacion] Error recording AI usage:", err)
      })
    }

    return NextResponse.json(parsed)
  } catch (error) {
    if (totalInputTokens > 0 || totalOutputTokens > 0) {
      recordAiUsage(auth.uid, totalInputTokens, totalOutputTokens).catch(err => {
        console.error("[generar-evaluacion] Error recording AI usage:", err)
      })
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Generacion cancelada." }, { status: 499 })
    }
    console.error("[generar-evaluacion] Error:", error)
    const message = error instanceof Error ? error.message : "Error interno"
    const status = error instanceof ProviderConfigError ? 400 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
