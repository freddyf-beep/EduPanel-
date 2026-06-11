#!/usr/bin/env node
import { readdirSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"

const baseUrl = (process.env.QA_BASE_URL || "http://localhost:3001").replace(/\/$/, "")
const token = (process.env.QA_ID_TOKEN || "").trim()
const runAi = process.env.QA_RUN_AI === "true"

const failures = []
const rows = []

function addResult(name, status, ok, detail = "") {
  rows.push({ name, status, ok, detail })
  if (!ok) failures.push({ name, status, detail })
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stats = statSync(full)
    if (stats.isDirectory()) walk(full, files)
    else if (entry === "page.tsx") files.push(full)
  }
  return files
}

function pageRouteFromFile(file) {
  const rel = relative("app", file).split(sep)
  if (rel.length === 1) return "/"
  const routeParts = rel
    .slice(0, -1)
    .filter((part) => !part.startsWith("(") && !part.startsWith("_"))
  return routeParts.length ? `/${routeParts.join("/")}` : "/"
}

async function readResponse(res) {
  const type = res.headers.get("content-type") || ""
  if (type.includes("application/json")) {
    try {
      return JSON.stringify(await res.json())
    } catch {
      return ""
    }
  }
  const text = await res.text().catch(() => "")
  return text.slice(0, 400)
}

async function request(name, path, options = {}, expect = (status) => status >= 200 && status < 400) {
  try {
    const res = await fetch(`${baseUrl}${path}`, options)
    const body = await readResponse(res)
    addResult(name, res.status, expect(res.status, body), body.replace(/\s+/g, " ").slice(0, 180))
  } catch (error) {
    addResult(name, 0, false, error instanceof Error ? error.message : String(error))
  }
}

function jsonOptions(body) {
  return {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  }
}

function authOptions(method = "GET", body) {
  return {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }
}

const routes = Array.from(new Set(walk("app").map(pageRouteFromFile))).sort()
for (const route of routes) {
  await request(`page ${route}`, route)
}

await request("api check-allowlist without token", "/api/check-allowlist", {}, (status) => status === 401)
await request("api preview-prompt without token", "/api/preview-prompt", jsonOptions({}), (status) => status === 401 || status === 403)
await request("api admin consumo-ia without token", "/api/admin/consumo-ia", {}, (status) => status === 401)
await request("api admin usuarios without token", "/api/admin/usuarios", {}, (status) => status === 401)

if (token) {
  await request("api check-allowlist with token", "/api/check-allowlist", authOptions(), (status, body) => status === 200 && body.includes('"allowed":true'))
  await request("api admin stats blocked for tester", "/api/admin/stats", authOptions(), (status) => status === 403)
  await request("api admin consumo-ia blocked for tester", "/api/admin/consumo-ia", authOptions(), (status) => status === 403)
  await request("api preview-prompt valid", "/api/preview-prompt", jsonOptions({
    lessonRequestBody: {
      asignatura: "Lenguaje",
      curso: "5 Basico",
      numeroClase: 1,
      totalClasesUnidad: 4,
      unidad: { nombre_unidad: "Comprension lectora" },
      oas: [{ numero: 1, descripcion: "Leer comprensivamente textos narrativos" }],
    },
    mode: "crear_inicial",
  }), (status, body) => status === 200 && body.includes("prompt"))

  if (runAi) {
    await request("api pedagogical-search ai", "/api/pedagogical-search", jsonOptions({
      query: "estrategias DUA breves para comprension lectora",
      lessonRequestBody: {
        asignatura: "Lenguaje",
        curso: "5 Basico",
        nivelCurricular: "5 Basico",
        focoPedagogico: "DUA",
        tono: "ludico",
        unidad: { nombre_unidad: "Comprension lectora" },
        oas: [{ numero: 1, descripcion: "Leer textos narrativos" }],
      },
    }), (status) => status === 200 || status === 429)
  }
}

console.table(rows.map((row) => ({
  ok: row.ok ? "yes" : "no",
  status: row.status,
  check: row.name,
  detail: row.detail,
})))

console.log(`\nQA base: ${baseUrl}`)
console.log(`Pages checked: ${routes.length}`)
console.log(`Auth token: ${token ? "yes" : "no"}`)
console.log(`AI checks: ${runAi ? "enabled" : "disabled"}`)

if (failures.length) {
  console.error(`\nQA failed: ${failures.length} checks failed.`)
  process.exit(1)
}

console.log("\nQA passed.")
