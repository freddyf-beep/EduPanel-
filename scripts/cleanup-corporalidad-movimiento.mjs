import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { createRequire } from "module"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, "..")
const shouldDelete = process.argv.includes("--yes")

function loadEnv() {
  const raw = readFileSync(join(rootDir, ".env.local"), "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const idx = trimmed.indexOf("=")
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "")
    if (!process.env[key]) process.env[key] = val
  }
}

loadEnv()

const require = createRequire(import.meta.url)
const admin = require("firebase-admin")

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
    }),
  })
}

const db = admin.firestore()
const invalidDocId = "corporalidad_y_movimiento_1ro_basico"
const validDocId = "corporalidad_y_movimiento_parvulos"

async function main() {
  const invalidRef = db.collection("curriculo").doc(invalidDocId)
  const validRef = db.collection("curriculo").doc(validDocId)
  const [invalidSnap, validSnap] = await Promise.all([invalidRef.get(), validRef.get()])

  console.log("Documento valido:", validDocId, validSnap.exists ? "existe" : "no existe")
  console.log("Documento incorrecto:", invalidDocId, invalidSnap.exists ? "existe" : "no existe")

  if (!invalidSnap.exists) return

  const unidades = await invalidRef.collection("unidades").get()
  console.log(`Unidades bajo documento incorrecto: ${unidades.size}`)

  if (!shouldDelete) {
    console.log("Dry-run: no se borro nada. Ejecuta con --yes para eliminar el documento incorrecto y sus subcolecciones.")
    return
  }

  await db.recursiveDelete(invalidRef)
  console.log(`Eliminado curriculo/${invalidDocId}`)
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
