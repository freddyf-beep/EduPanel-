// ═══════════════════════════════════════════════════════════════════════════
// Firebase Remote Config (server-side) — afinar IA sin redeploy
// ─────────────────────────────────────────────────────────────────────────
// Permite cambiar parámetros globales (p. ej. un sufijo institucional para los
// prompts de IA, o la temperatura por defecto) desde la consola de Firebase
// Remote Config, SIN tocar código ni redeployar en Vercel.
//
// Usa firebase-admin (server template). Reutiliza las credenciales de Firebase
// Admin. No-breaking: si la API no está habilitada o falla, devuelve los
// valores por defecto (comportamiento actual). Caché en memoria con TTL.
//
// Requisitos en consola: habilitar "Firebase Remote Config API" y crear los
// parámetros listados en RC_DEFAULTS. Ver docs/firebase-features-setup.md.
// ═══════════════════════════════════════════════════════════════════════════

import { getAdminApp } from "@/lib/auth/verify-token"

/** Parámetros conocidos y sus valores por defecto (fallback si Remote Config falla). */
export const RC_DEFAULTS = {
  /** Texto global agregado al final de los prompts de IA (instrucciones institucionales). */
  ai_prompt_suffix: "",
  /** Temperatura por defecto para generación (vacío = usar la del código). */
  ai_default_temperature: "",
} as const

export type RemoteConfigKey = keyof typeof RC_DEFAULTS

const RC_CACHE_TTL_MS = 5 * 60_000
let cache: { values: Record<string, string>; expiresAt: number } | null = null

/** Limpia el caché de Remote Config (p. ej. para forzar recarga). */
export function clearRemoteConfigCache(): void {
  cache = null
}

/** Devuelve todos los parámetros conocidos, con caché y fallback a RC_DEFAULTS. */
export async function getRemoteConfigValues(): Promise<Record<string, string>> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.values

  try {
    const app = await getAdminApp()
    const { getRemoteConfig } = await import("firebase-admin/remote-config")
    const template = await getRemoteConfig(app).getServerTemplate({
      defaultConfig: RC_DEFAULTS as unknown as { [key: string]: string },
    })
    const config = template.evaluate()

    const values: Record<string, string> = { ...RC_DEFAULTS }
    for (const key of Object.keys(RC_DEFAULTS)) {
      try {
        const v = config.getString(key)
        if (typeof v === "string") values[key] = v
      } catch {
        /* mantener default */
      }
    }
    cache = { values, expiresAt: now + RC_CACHE_TTL_MS }
    return values
  } catch (e) {
    console.warn("[remote-config] no disponible, usando defaults:", (e as Error).message)
    return { ...RC_DEFAULTS }
  }
}

/** Lee un parámetro string de Remote Config con fallback. */
export async function getRemoteString(key: RemoteConfigKey, fallback = ""): Promise<string> {
  const values = await getRemoteConfigValues()
  const v = values[key]
  return typeof v === "string" && v.length > 0 ? v : fallback
}

/** Sufijo institucional global para anteponer/anexar a los prompts de IA. */
export async function getGlobalPromptSuffix(): Promise<string> {
  return getRemoteString("ai_prompt_suffix", "")
}
