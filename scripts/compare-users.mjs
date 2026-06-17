import { readFile } from "fs/promises"
import { join, resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { cert, deleteApp, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const originalEnvKeys = new Set(Object.keys(process.env))

const UID_FREDDY = "S2U9BEMrI7beV5pF5rTF0u5AhSp2"
const UID_UDEFRET = "hOAmMTbkTzTwF7F2fAeFsR9K0CO2"

async function loadEnv() {
  let raw
  try { raw = await readFile(join(PROJECT_ROOT, ".env.local"), "utf8") } catch { return }
  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    if (originalEnvKeys.has(key)) continue
    if (!process.env[key]) process.env[key] = val
  }
}

function env(name, fb = "") { const v = process.env[name]; return v === undefined || v === null || v === "" ? fb : v }

async function readCollectionsRecursive(db, uid) {
  const result = {}
  const userRef = db.collection("users").doc(uid)
  const subs = await userRef.listCollections()
  
  for (const sub of subs) {
    const colName = sub.id
    const snap = await sub.get()
    result[colName] = []
    for (const doc of snap.docs) {
      const data = doc.data()
      result[colName].push({
        id: doc.id,
        updatedAt: data.updatedAt ? 
          (typeof data.updatedAt.toDate === "function" ? data.updatedAt.toDate().toISOString() : String(data.updatedAt)) 
          : null,
        updateTime: typeof doc.updateTime?.toDate === "function" ? doc.updateTime.toDate().toISOString() : null,
        // extract key fields
        keys: Object.keys(data).filter(k => !["updatedAt", "createdAt"].includes(k)),
        count: typeof data === "object" ? Object.keys(data).length : 0,
      })
    }
  }
  return result
}

function formatDate(d) {
  if (!d) return "sin fecha"
  try {
    const dt = new Date(d)
    return dt.toLocaleString("es-CL", { timeZone: "America/Santiago" })
  } catch { return String(d) }
}

async function main() {
  await loadEnv()
  const app = initializeApp({
    credential: cert({
      projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: env("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: env("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
    projectId: env("FIREBASE_ADMIN_PROJECT_ID"),
  })
  const db = getFirestore(app)

  const freddy = await readCollectionsRecursive(db, UID_FREDDY)
  const udefret = await readCollectionsRecursive(db, UID_UDEFRET)

  const allCols = new Set([...Object.keys(freddy), ...Object.keys(udefret)])

  console.log("=" .repeat(70))
  console.log(`COMPARATIVA: freddyfiguea (${UID_FREDDY}) vs udefret34 (${UID_UDEFRET})`)
  console.log("=" .repeat(70))

  let fdTotal = 0, udTotal = 0

  for (const col of [...allCols].sort()) {
    const fa = freddy[col] || []
    const ub = udefret[col] || []
    fdTotal += fa.length
    udTotal += ub.length
    
    if (fa.length === 0 && ub.length === 0) continue

    console.log(`\n--- ${col.toUpperCase()} ---`)
    console.log(`  freddyfiguea: ${fa.length} docs  |  udefret34: ${ub.length} docs`)
    
    if (fa.length !== ub.length) {
      const onlyF = fa.filter(f => !ub.some(u => u.id === f.id))
      const onlyU = ub.filter(u => !fa.some(f => f.id === u.id))
      
      if (onlyF.length > 0) {
        console.log(`  SOLO freddyfiguea:`)
        for (const d of onlyF) {
          console.log(`    - ${d.id} [update: ${formatDate(d.updateTime)}] keys: ${d.keys.slice(0,8).join(", ")}`)
        }
      }
      if (onlyU.length > 0) {
        console.log(`  SOLO udefret34:`)
        for (const d of onlyU) {
          console.log(`    - ${d.id} [update: ${formatDate(d.updateTime)}] keys: ${d.keys.slice(0,8).join(", ")}`)
        }
      }
    } else {
      // Compare update times
      for (let i = 0; i < fa.length; i++) {
        const f = fa[i], u = ub[i]
        if (f.id !== u.id) {
          console.log(`  DIFERENTE ID: ${f.id} vs ${u.id}`)
        }
      }
    }
  }

  console.log(`\n${"=".repeat(70)}`)
  console.log(`TOTAL freddyfiguea: ${fdTotal} documentos`)
  console.log(`TOTAL udefret34:    ${udTotal} documentos`)
  console.log(`DIFERENCIA:         ${fdTotal - udTotal} (freddy - udefret)`)

  // ── Check specific items the user mentioned ──
  console.log(`\n${"=".repeat(70)}`)
  console.log("VERIFICACION DE ITEMS MENCIONADOS")
  console.log("=".repeat(70))

  // Listas de cotejo
  const flistas = (freddy.listas_cotejo || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  const ulistas = (udefret.listas_cotejo || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  console.log(`\nListas de cotejo:`)
  console.log(`  freddyfiguea: ${flistas.length}  |  udefret34: ${ulistas.length}`)
  if (flistas.length > 0) {
    console.log(`  Ultimas de freddyfiguea:`)
    for (const l of flistas.slice(0,5)) console.log(`    ${l.id} [${formatDate(l.updateTime)}]`)
  }
  if (ulistas.length > 0) {
    console.log(`  Ultimas de udefret34:`)
    for (const l of ulistas.slice(0,5)) console.log(`    ${l.id} [${formatDate(l.updateTime)}]`)
  }

  // Rubricas
  const frub = (freddy.rubricas || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  const urub = (udefret.rubricas || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  console.log(`\nRubricas:`)
  console.log(`  freddyfiguea: ${frub.length}  |  udefret34: ${urub.length}`)
  if (frub.length > 0) {
    console.log(`  Todas de freddyfiguea:`)
    for (const r of frub.slice(0,10)) console.log(`    ${r.id} [${formatDate(r.updateTime)}]`)
  }

  // Rubricas evaluaciones
  const frev = (freddy.rubricas_evaluaciones || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  const urev = (udefret.rubricas_evaluaciones || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  console.log(`\nRubricas evaluaciones:`)
  console.log(`  freddyfiguea: ${frev.length}  |  udefret34: ${urev.length}`)

  // Planificaciones curso
  const fplan = (freddy.planificaciones_curso || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  const uplan = (udefret.planificaciones_curso || []).sort((a,b) => (b.updateTime || "").localeCompare(a.updateTime || ""))
  console.log(`\nPlanificaciones curso:`)
  console.log(`  freddyfiguea: ${fplan.length}  |  udefret34: ${uplan.length}`)
  for (const p of fplan) console.log(`  [freddy] ${p.id} [${formatDate(p.updateTime)}]`)

  await deleteApp(app).catch(() => {})
}

main().catch(e => { console.error("ERROR", e); process.exitCode = 1 })
