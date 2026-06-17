// ═══════════════════════════════════════════════════════════════════════════
// Vertex AI Search (Discovery Engine) — búsqueda sobre el corpus de currículum
// ─────────────────────────────────────────────────────────────────────────
// Permite "grounding" sobre tus propios documentos (programas MINEDUC, OAs,
// actividades) en lugar de la web. Consume el crédito de Google Cloud de
// "GenAI App Builder" (Vertex AI Search / Agent Builder).
//
// Auth: reutiliza las credenciales de cuenta de servicio de Firebase Admin
// (su access token incluye el scope cloud-platform). El service account debe
// tener el rol "Discovery Engine Viewer" (o Editor) en el proyecto.
//
// Configuración (env, todas opcionales — si faltan, la búsqueda se desactiva
// y los callers caen a su comportamiento previo):
//   VERTEX_SEARCH_ENGINE_ID     ID del motor/app de búsqueda (recomendado), o
//   VERTEX_SEARCH_DATASTORE_ID  ID del data store (si no se usa engine)
//   VERTEX_SEARCH_PROJECT_ID    por defecto FIREBASE_ADMIN_PROJECT_ID
//   VERTEX_SEARCH_LOCATION      por defecto "global" (p. ej. "us", "eu")
//   VERTEX_SEARCH_COLLECTION    por defecto "default_collection"
//
// Llamada vía REST (sin SDK nuevo). Ver docs/vertex-ai-search-setup.md.
// ═══════════════════════════════════════════════════════════════════════════

import { getAdminApp } from "@/lib/auth/verify-token"

export interface CurriculumSearchHit {
  title: string
  snippet: string
  uri?: string
}

/** True si hay configuración suficiente para consultar Vertex AI Search. */
export function isVertexSearchConfigured(): boolean {
  const hasTarget = Boolean(process.env.VERTEX_SEARCH_ENGINE_ID || process.env.VERTEX_SEARCH_DATASTORE_ID)
  const hasProject = Boolean(process.env.VERTEX_SEARCH_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID)
  return hasTarget && hasProject
}

/** Obtiene un access token de Google Cloud desde las credenciales de Firebase Admin. */
async function getCloudAccessToken(): Promise<string> {
  const app = await getAdminApp()
  const credential = app.options.credential
  if (!credential || typeof credential.getAccessToken !== "function") {
    throw new Error("Credenciales de cuenta de servicio no disponibles para Vertex AI Search.")
  }
  const token = await credential.getAccessToken()
  const accessToken = token?.access_token
  if (!accessToken) throw new Error("No se pudo obtener access token de la cuenta de servicio.")
  return accessToken
}

function buildServingConfigPath(): string {
  const project = process.env.VERTEX_SEARCH_PROJECT_ID || process.env.FIREBASE_ADMIN_PROJECT_ID!
  const location = process.env.VERTEX_SEARCH_LOCATION || "global"
  const collection = process.env.VERTEX_SEARCH_COLLECTION || "default_collection"
  const engineId = process.env.VERTEX_SEARCH_ENGINE_ID
  const dataStoreId = process.env.VERTEX_SEARCH_DATASTORE_ID
  const base = `projects/${project}/locations/${location}/collections/${collection}`
  return engineId
    ? `${base}/engines/${engineId}/servingConfigs/default_search`
    : `${base}/dataStores/${dataStoreId}/servingConfigs/default_search`
}

function searchHost(): string {
  const location = process.env.VERTEX_SEARCH_LOCATION || "global"
  return location === "global"
    ? "discoveryengine.googleapis.com"
    : `${location}-discoveryengine.googleapis.com`
}

/**
 * Busca en el corpus de currículum vía Vertex AI Search.
 * Devuelve [] si no está configurado. Lanza error si la API falla (el caller
 * debe envolver en try/catch para degradar de forma elegante).
 */
export async function searchCurriculumCorpus(
  query: string,
  pageSize = 5,
): Promise<CurriculumSearchHit[]> {
  if (!isVertexSearchConfigured()) return []
  const cleaned = query.trim()
  if (!cleaned) return []

  const url = `https://${searchHost()}/v1/${buildServingConfigPath()}:search`
  const accessToken = await getCloudAccessToken()

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: cleaned,
      pageSize,
      // Resúmenes/snippets extractivos para usar como contexto de grounding.
      contentSearchSpec: {
        snippetSpec: { returnSnippet: true },
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`Vertex AI Search ${res.status}: ${errText.slice(0, 300)}`)
  }

  const data = (await res.json()) as { results?: any[] }
  const results = Array.isArray(data?.results) ? data.results : []

  return results
    .map((r: any): CurriculumSearchHit | null => {
      const docu = r?.document || {}
      const derived = docu.derivedStructData || {}
      const struct = docu.structData || {}
      const title =
        derived.title || struct.title || struct.nombre_unidad || struct.nombre || docu.id || "Documento"
      const snippetFromArray = Array.isArray(derived.snippets) && derived.snippets[0]?.snippet
      const snippet =
        snippetFromArray ||
        derived.extractive_answers?.[0]?.content ||
        struct.descripcion ||
        struct.proposito ||
        ""
      const uri = derived.link || struct.uri || undefined
      const cleanedSnippet = String(snippet).replace(/<[^>]+>/g, "").trim()
      if (!title && !cleanedSnippet) return null
      return {
        title: String(title),
        snippet: cleanedSnippet,
        uri: uri ? String(uri) : undefined,
      }
    })
    .filter((h): h is CurriculumSearchHit => h !== null)
    .slice(0, pageSize)
}
