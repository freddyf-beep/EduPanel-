/**
 * Cliente fetch con Firebase ID Token automatico.
 *
 * Uso:
 *   import { apiFetch } from "@/lib/api-client"
 *   const res = await apiFetch("/api/generar-clase", {
 *     method: "POST",
 *     body: JSON.stringify({ ... })
 *   })
 *
 * Inyecta automaticamente:
 *   - Authorization: Bearer <idToken>   (del usuario actual de Firebase Auth)
 *   - Content-Type: application/json    (si no se especifica y hay body)
 *
 * Si no hay usuario autenticado, lanza error inmediatamente sin hacer la
 * peticion (evita 401 server-side innecesario).
 */

import { auth } from "./firebase"

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message)
    this.name = "ApiError"
  }
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser
  if (!user) {
    throw new ApiError(401, "No hay sesion activa")
  }

  const idToken = await user.getIdToken()

  const headers = new Headers(init.headers)
  headers.set("Authorization", `Bearer ${idToken}`)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(input, { ...init, headers })

  if (!res.ok) {
    let body: unknown = undefined
    try {
      body = await res.clone().json()
    } catch {
      try {
        body = await res.clone().text()
      } catch {
        // ignorar
      }
    }
    throw new ApiError(res.status, `Request to ${input} failed: ${res.status}`, body)
  }

  return res
}

/**
 * Convenience: parsea como JSON. Lanza ApiError si !ok.
 */
export async function apiFetchJson<T = unknown>(input: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init)
  return (await res.json()) as T
}
