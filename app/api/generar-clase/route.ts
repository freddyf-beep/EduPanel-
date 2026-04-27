import { NextResponse } from "next/server"
import {
  AI_PROVIDER_OPTIONS,
  buildCopilotPrompt,
  cleanText,
  coerceGeneratedLesson,
  getProviderMeta,
  parseJsonResponse,
  resolveMode,
  type AIProvider,
  type LessonRequestBody,
} from "@/lib/ai/copilot"

class ProviderConfigError extends Error {
  status = 400
}

// ─── Helpers para leer respuestas ─────────────────────────────────────────────

async function readJsonOrText(response: Response) {
  const rawText = await response.text()
  try {
    return { rawText, json: JSON.parse(rawText) as Record<string, any> }
  } catch {
    return { rawText, json: null }
  }
}

function extractGeminiText(data: Record<string, any> | null): string {
  const parts = data?.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ""
  return parts.map((part) => cleanText(part?.text)).filter(Boolean).join("\n")
}

function extractOpenAIText(data: Record<string, any> | null): string {
  return cleanText(data?.choices?.[0]?.message?.content) || ""
}

function extractAnthropicText(data: Record<string, any> | null): string {
  if (!Array.isArray(data?.content)) return ""
  return data.content.map((chunk: any) => cleanText(chunk?.text)).filter(Boolean).join("\n")
}

// ─── Llamadas a los proveedores ───────────────────────────────────────────────

function resolveProvider(raw: string): AIProvider {
  return AI_PROVIDER_OPTIONS.some(option => option.value === raw) ? raw as AIProvider : "public"
}

async function callGemini(body: LessonRequestBody, prompt: string, expectsJson: boolean, signal?: AbortSignal, provider: AIProvider = "gemini") {
  const model = cleanText(body.customModel) || getProviderMeta("gemini").defaultModel
  const token = provider === "public"
    ? cleanText(process.env.GEMINI_API_KEY)
    : cleanText(body.customToken) || cleanText(process.env.GEMINI_API_KEY)

  if (!token) {
    const error = new ProviderConfigError(
      provider === "public"
        ? "EduPanel Público no está configurado en este servidor: falta GEMINI_API_KEY en .env.local. Mientras tanto usa Gemini con tu API key personal en Configuración de IA."
        : "No hay API key de Gemini configurada. Ingresa una API key personal o configura GEMINI_API_KEY en .env.local."
    )
    throw error
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(token)}`,
    {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: expectsJson ? 0.4 : 0.7,
          ...(expectsJson ? { responseMimeType: "application/json" } : {}),
        },
      }),
    },
  )

  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) {
    const message = cleanText(json?.error?.message) || rawText || "Gemini no pudo responder."
    throw new Error(message)
  }

  return extractGeminiText(json) || rawText
}

async function callOpenAI(body: LessonRequestBody, prompt: string, expectsJson: boolean, signal?: AbortSignal) {
  const token = cleanText(body.customToken) || cleanText(process.env.OPENAI_API_KEY)
  if (!token) {
    const error = new ProviderConfigError("Debes ingresar tu API key de OpenAI en la configuración de IA o configurar OPENAI_API_KEY en .env.local.")
    throw error
  }

  const model = cleanText(body.customModel) || getProviderMeta("openai").defaultModel
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: expectsJson ? 0.4 : 0.7,
      messages: [{ role: "user", content: prompt }],
      ...(expectsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) {
    const message = cleanText(json?.error?.message) || rawText || "OpenAI no pudo responder."
    throw new Error(message)
  }

  return extractOpenAIText(json) || rawText
}

async function callAnthropic(body: LessonRequestBody, prompt: string, expectsJson: boolean, signal?: AbortSignal) {
  const token = cleanText(body.customToken) || cleanText(process.env.ANTHROPIC_API_KEY)
  if (!token) {
    const error = new ProviderConfigError("Debes ingresar tu API key de Anthropic en la configuración de IA o configurar ANTHROPIC_API_KEY en .env.local.")
    throw error
  }

  const model = cleanText(body.customModel) || getProviderMeta("anthropic").defaultModel

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": token,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      temperature: expectsJson ? 0.4 : 0.7,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  })

  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) {
    const message = cleanText(json?.error?.message) || rawText || "Anthropic no pudo responder."
    throw new Error(message)
  }

  return extractAnthropicText(json) || rawText
}

async function callCompatible(body: LessonRequestBody, prompt: string, expectsJson: boolean, signal?: AbortSignal) {
  const token = cleanText(body.customToken)
  if (!token) {
    const error = new ProviderConfigError("Debes ingresar un token para usar el endpoint compatible.")
    throw error
  }

  const endpoint = cleanText(body.customEndpoint)
  if (!endpoint) {
    const error = new ProviderConfigError("Debes indicar la URL base del endpoint compatible.")
    throw error
  }

  const model = cleanText(body.customModel) || getProviderMeta("compatible").defaultModel
  const base = endpoint.replace(/\/+$/, "")

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      model,
      temperature: expectsJson ? 0.4 : 0.7,
      messages: [{ role: "user", content: prompt }],
      ...(expectsJson ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  const { rawText, json } = await readJsonOrText(response)
  if (!response.ok) {
    const message = cleanText(json?.error?.message) || rawText || "El endpoint no pudo responder."
    throw new Error(message)
  }

  return extractOpenAIText(json) || rawText
}

async function generateText(
  provider: AIProvider,
  body: LessonRequestBody,
  prompt: string,
  expectsJson: boolean,
  signal?: AbortSignal,
): Promise<string> {
  if (provider === "openai") return callOpenAI(body, prompt, expectsJson, signal)
  if (provider === "anthropic") return callAnthropic(body, prompt, expectsJson, signal)
  if (provider === "groq") {
    return callCompatible({
      ...body,
      customToken: cleanText(body.customToken) || cleanText(process.env.GROQ_API_KEY),
      customEndpoint: "https://api.groq.com/openai/v1"
    }, prompt, expectsJson, signal)
  }
  if (provider === "compatible") return callCompatible(body, prompt, expectsJson, signal)
  // 'public' y 'gemini' usan callGemini
  return callGemini(body, prompt, expectsJson, signal, provider)
}

// ─── Handler principal ────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let provider: AIProvider = "gemini"

  try {
    const body = (await req.json()) as LessonRequestBody
    const mode = resolveMode(body.modo)
    provider = resolveProvider(cleanText(body.modelProvider) || "public")

    const prompt = buildCopilotPrompt(body, mode)
    const expectsJson = mode !== "chat"

    const rawText = await generateText(provider, body, prompt, expectsJson, req.signal)

    // Modo chat: respuesta libre en texto
    if (mode === "chat") {
      return NextResponse.json({
        respuestaChat: cleanText(rawText) || "No pude generar una respuesta esta vez.",
      })
    }

    // Modos crear_inicial y aplicar_cambios: respuesta en JSON
    const parsed = parseJsonResponse(rawText || "{}")
    const lesson = coerceGeneratedLesson(parsed)

    return NextResponse.json({
      ...lesson,
      // Solo aplicar_cambios devuelve resumen_cambios
      resumenCambios: typeof parsed.resumen_cambios === "string"
        ? cleanText(parsed.resumen_cambios)
        : undefined,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return NextResponse.json({ error: "Generación cancelada." }, { status: 499 })
    }

    console.error("[generar-clase] Error:", error)

    const rawMessage = error instanceof Error ? error.message : "Error interno del servidor"
    const message = normalizeProviderError(provider, rawMessage)

    const status = error instanceof ProviderConfigError ? error.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}

// ─── Normalización de errores ─────────────────────────────────────────────────

function normalizeProviderError(provider: AIProvider, message: string): string {
  const n = message.toLowerCase()

  if (provider === "anthropic" && n.includes("credit balance is too low")) {
    return "Tu API key de Anthropic es válida pero no tiene créditos. Recarga en console.anthropic.com → Plans & Billing."
  }
  if (provider === "anthropic" && n.includes("invalid x-api-key")) {
    return "La API key de Anthropic no es válida o fue revocada."
  }
  if (provider === "gemini" && n.includes("api key not valid")) {
    return "La API key de Gemini no es válida. Ve a aistudio.google.com y genera una nueva."
  }
  if (provider === "openai" && n.includes("invalid_api_key")) {
    return "La API key de OpenAI no es válida. Verifica en platform.openai.com."
  }

  return message
}
