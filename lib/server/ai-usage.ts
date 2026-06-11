import { getAdminApp } from "@/lib/auth/verify-token"
import { FieldValue, getFirestore } from "firebase-admin/firestore"

export interface AiBudgetCheckOptions {
  feature?: string
  inputText?: string
  estimatedInputTokens?: number
  estimatedOutputTokens?: number
  estimatedCostUsd?: number
}

export interface AiUsageRecordInput {
  uid: string
  feature: string
  provider: string
  model: string
  inputText?: string
  outputText?: string
  usageMetadata?: unknown
  costOverrideUsd?: number
  kind?: "text" | "image" | "audio" | "multimodal"
}

export interface AiUsageSummary {
  tokens_input: number
  tokens_output: number
  tokens: number
  prompts: number
  cost: number
  limit: number
  last_used: string | null
  month: string
  total_cost: number
  total_tokens: number
}

const DEFAULT_MONTHLY_LIMIT_USD = 5.0
const DEFAULT_TEXT_OUTPUT_TOKENS = 1500
const DEFAULT_IMAGE_COST_USD = 0.04
const DEFAULT_AUDIO_EXTRA_TOKENS = 1500

function numericEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

function costPerToken(): number {
  return numericEnv("AI_COST_PER_MILLION_TOKENS_USD", 1.5) / 1_000_000
}

function defaultMonthlyLimit(): number {
  return numericEnv("AI_DEFAULT_MONTHLY_LIMIT_USD", DEFAULT_MONTHLY_LIMIT_USD)
}

function usageTimeZone(): string {
  return process.env.AI_USAGE_TIME_ZONE || "America/Santiago"
}

export function getAiUsageDayKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: usageTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${map.year}-${map.month}-${map.day}`
}

export function getAiUsageMonthKey(date = new Date()): string {
  return getAiUsageDayKey(date).slice(0, 7)
}

export function estimateTokensFromText(text: unknown): number {
  if (typeof text !== "string" || !text.trim()) return 0
  return Math.max(1, Math.ceil(text.length / 4))
}

function normalizeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0
}

export function extractAiUsageTokens(usageMetadata: unknown): { input: number; output: number; total: number } {
  const usage = usageMetadata as Record<string, unknown> | null | undefined
  if (!usage || typeof usage !== "object") return { input: 0, output: 0, total: 0 }

  const input = normalizeNumber(
    usage.promptTokenCount ??
    usage.prompt_tokens ??
    usage.input_tokens ??
    usage.inputTokens
  )
  const output = normalizeNumber(
    usage.candidatesTokenCount ??
    usage.completion_tokens ??
    usage.output_tokens ??
    usage.outputTokens
  )
  const total = normalizeNumber(
    usage.totalTokenCount ??
    usage.total_tokens ??
    usage.totalTokens
  ) || input + output

  return { input, output, total }
}

export function getMonthlyUsageCost(data: Record<string, any> | undefined, monthKey = getAiUsageMonthKey()): number {
  const daily = data?.daily
  if (!daily || typeof daily !== "object") {
    return typeof data?.cost === "number" ? data.cost : 0
  }

  return Object.entries(daily).reduce((sum, [day, vals]) => {
    if (!day.startsWith(monthKey)) return sum
    const cost = typeof (vals as any)?.cost === "number" ? (vals as any).cost : 0
    return sum + cost
  }, 0)
}

export function getMonthlyUsageTokens(data: Record<string, any> | undefined, monthKey = getAiUsageMonthKey()) {
  const daily = data?.daily
  if (!daily || typeof daily !== "object") {
    const input = normalizeNumber(data?.tokens_input)
    const output = normalizeNumber(data?.tokens_output)
    const legacy = normalizeNumber(data?.tokens)
    return { input, output, total: input + output + legacy, prompts: normalizeNumber(data?.prompts) }
  }

  return Object.entries(daily).reduce((acc, [day, vals]) => {
    if (!day.startsWith(monthKey)) return acc
    const v = vals as any
    acc.input += normalizeNumber(v?.tokens_input)
    acc.output += normalizeNumber(v?.tokens_output)
    acc.total += normalizeNumber(v?.tokens)
    acc.prompts += normalizeNumber(v?.prompts)
    return acc
  }, { input: 0, output: 0, total: 0, prompts: 0 })
}

export function summarizeAiUsageData(data: Record<string, any> | undefined): AiUsageSummary {
  const month = getAiUsageMonthKey()
  const monthlyCost = getMonthlyUsageCost(data, month)
  const monthlyTokens = getMonthlyUsageTokens(data, month)
  const totalInput = normalizeNumber(data?.tokens_input)
  const totalOutput = normalizeNumber(data?.tokens_output)
  const totalLegacy = normalizeNumber(data?.tokens)
  const totalTokens = totalInput + totalOutput + totalLegacy

  return {
    tokens_input: monthlyTokens.input,
    tokens_output: monthlyTokens.output,
    tokens: monthlyTokens.total || monthlyTokens.input + monthlyTokens.output,
    prompts: monthlyTokens.prompts,
    cost: monthlyCost,
    limit: typeof data?.limit === "number" ? data.limit : defaultMonthlyLimit(),
    last_used: typeof data?.last_used?.toDate === "function" ? data.last_used.toDate().toISOString() : null,
    month,
    total_cost: typeof data?.cost === "number" ? data.cost : totalTokens * costPerToken(),
    total_tokens: totalTokens,
  }
}

export async function checkAiBudget(uid: string, options: AiBudgetCheckOptions = {}) {
  const app = await getAdminApp()
  const db = getFirestore(app)
  const ref = db.collection("ai_usage_stats").doc(uid)
  const snap = await ref.get()
  const data = snap.exists ? snap.data() as Record<string, any> : undefined
  const summary = summarizeAiUsageData(data)
  const estimatedInputTokens = options.estimatedInputTokens ?? estimateTokensFromText(options.inputText)
  const estimatedOutputTokens = options.estimatedOutputTokens ?? DEFAULT_TEXT_OUTPUT_TOKENS
  const estimatedTokenCost = (estimatedInputTokens + estimatedOutputTokens) * costPerToken()
  const estimatedCost = options.estimatedCostUsd ?? estimatedTokenCost

  if (summary.limit <= 0 || summary.cost >= summary.limit || summary.cost + estimatedCost > summary.limit) {
    const remaining = Math.max(0, summary.limit - summary.cost)
    return {
      ok: false as const,
      response: Response.json({
        error: "Limite mensual de IA alcanzado.",
        detail: `Consumo mensual: $${summary.cost.toFixed(4)} USD de $${summary.limit.toFixed(2)} USD. Restante estimado: $${remaining.toFixed(4)} USD.`,
        feature: options.feature,
        month: summary.month,
      }, { status: 402 }),
    }
  }

  if (!snap.exists) {
    await ref.set({ limit: summary.limit }, { merge: true })
  }

  return { ok: true as const, summary }
}

export async function recordAiUsage(input: AiUsageRecordInput): Promise<void> {
  try {
    const usageTokens = extractAiUsageTokens(input.usageMetadata)
    const inputTokens = usageTokens.input || estimateTokensFromText(input.inputText)
    const outputTokens = usageTokens.output || estimateTokensFromText(input.outputText)
    const totalTokens = usageTokens.total || inputTokens + outputTokens
    const cost = typeof input.costOverrideUsd === "number"
      ? input.costOverrideUsd
      : totalTokens * costPerToken()
    const day = getAiUsageDayKey()

    const app = await getAdminApp()
    const db = getFirestore(app)
    await db.collection("ai_usage_stats").doc(input.uid).set({
      tokens_input: FieldValue.increment(inputTokens),
      tokens_output: FieldValue.increment(outputTokens),
      prompts: FieldValue.increment(1),
      cost: FieldValue.increment(cost),
      last_used: FieldValue.serverTimestamp(),
      last_feature: input.feature,
      last_provider: input.provider,
      last_model: input.model,
      [`daily.${day}.tokens`]: FieldValue.increment(totalTokens),
      [`daily.${day}.tokens_input`]: FieldValue.increment(inputTokens),
      [`daily.${day}.tokens_output`]: FieldValue.increment(outputTokens),
      [`daily.${day}.cost`]: FieldValue.increment(cost),
      [`daily.${day}.prompts`]: FieldValue.increment(1),
      [`daily.${day}.features.${input.feature}.prompts`]: FieldValue.increment(1),
      [`daily.${day}.features.${input.feature}.tokens`]: FieldValue.increment(totalTokens),
      [`daily.${day}.features.${input.feature}.cost`]: FieldValue.increment(cost),
    }, { merge: true })
  } catch (error) {
    console.error("[ai-usage] no se pudo registrar consumo", error)
  }
}

export function estimateImageGenerationCost(): number {
  return numericEnv("AI_IMAGE_GENERATION_COST_USD", DEFAULT_IMAGE_COST_USD)
}

export function estimateAudioRequestTokens(prompt: string): number {
  return estimateTokensFromText(prompt) + DEFAULT_AUDIO_EXTRA_TOKENS
}
