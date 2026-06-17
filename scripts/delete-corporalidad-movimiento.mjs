import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { createRequire } from "module"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = join(__dirname, "..")
const shouldDelete = process.argv.includes("--yes")

const SUBJECT = "Corporalidad y Movimiento"
const SUBJECT_ID_PREFIX = "corporalidad_y_movimiento"
const USER_COLLECTIONS_WITH_ASIGNATURA = [
  "planificaciones",
  "planificaciones_curso",
  "ver_unidad",
  "cronograma_unidad",
  "actividades_clase",
  "banco_curricular",
  "cronogramas",
  "anotaciones",
  "observaciones_360",
]

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
const auth = admin.auth()

async function deleteOrLog(ref, label, recursive = false) {
  console.log(`${shouldDelete ? "DELETE" : "DRY"} ${label}`)
  if (!shouldDelete) return
  if (recursive) await db.recursiveDelete(ref)
  else await ref.delete()
}

async function deletePublicCurriculum() {
  const snap = await db.collection("curriculo").get()
  for (const docSnap of snap.docs) {
    const data = docSnap.data()
    const shouldRemove = docSnap.id.startsWith(SUBJECT_ID_PREFIX) || data.asignatura === SUBJECT
    if (!shouldRemove) continue
    await deleteOrLog(docSnap.ref, `curriculo/${docSnap.id}`, true)
  }
}

async function deleteUserDocs() {
  const userIds = new Set()
  const usersSnap = await db.collection("users").get()
  usersSnap.docs.forEach((docSnap) => userIds.add(docSnap.id))

  let pageToken
  do {
    const page = await auth.listUsers(1000, pageToken)
    page.users.forEach((user) => userIds.add(user.uid))
    pageToken = page.pageToken
  } while (pageToken)

  for (const userId of userIds) {
    const userRef = db.collection("users").doc(userId)
    for (const colName of USER_COLLECTIONS_WITH_ASIGNATURA) {
      const colRef = userRef.collection(colName)
      const snap = await colRef.get()
      for (const docSnap of snap.docs) {
        const data = docSnap.data()
        const shouldRemove =
          data.asignatura === SUBJECT ||
          data.nivel === SUBJECT ||
          docSnap.id.includes(SUBJECT_ID_PREFIX)
        if (!shouldRemove) continue
        await deleteOrLog(docSnap.ref, `users/${userId}/${colName}/${docSnap.id}`, true)
      }
    }

    const nivelRef = userRef.collection("configuracion").doc("nivel_mapping")
    const nivelSnap = await nivelRef.get()
    if (!nivelSnap.exists) continue
    const data = nivelSnap.data() || {}
    const asignaturaMapping = { ...(data.asignaturaMapping || {}) }
    let touched = false
    for (const [curso, perSubject] of Object.entries(asignaturaMapping)) {
      if (perSubject && typeof perSubject === "object" && SUBJECT in perSubject) {
        delete perSubject[SUBJECT]
        touched = true
      }
      if (perSubject && typeof perSubject === "object" && Object.keys(perSubject).length === 0) {
        delete asignaturaMapping[curso]
      }
    }
    if (touched) {
      console.log(`${shouldDelete ? "UPDATE" : "DRY"} users/${userId}/configuracion/nivel_mapping remove asignaturaMapping.${SUBJECT}`)
      if (shouldDelete) await nivelRef.set({ ...data, asignaturaMapping }, { merge: true })
    }
  }
}

async function main() {
  await deletePublicCurriculum()
  await deleteUserDocs()
  if (!shouldDelete) {
    console.log("Dry-run: no se borro nada. Ejecuta con --yes para borrar.")
  }
}

main().catch((error) => {
  console.error("Error:", error)
  process.exit(1)
})
