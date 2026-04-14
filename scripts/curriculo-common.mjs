import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs"
import { dirname, join, resolve } from "path"
import { fileURLToPath } from "url"
import { initializeApp, getApps } from "firebase/app"
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  writeBatch,
  terminate,
} from "firebase/firestore"

export const firebaseConfig = {
  apiKey: "AIzaSyAPZ0knktdl2TINlaVhBi8-o8o7o9DFVCc",
  authDomain: "edupanel-bf5cb.firebaseapp.com",
  projectId: "edupanel-bf5cb",
  storageBucket: "edupanel-bf5cb.firebasestorage.app",
  messagingSenderId: "1091516333641",
  appId: "1:1091516333641:web:0753278efac24ad4394998",
}

export const KNOWN_CURRICULO_SUBCOLLECTIONS = [
  "objetivos_aprendizaje",
  "actividades_sugeridas",
  "ejemplos_evaluacion",
]

const SUBJECT_FALLBACK_OPTIONS = [
  "Música",
]

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
export const PROJECT_ROOT = resolve(__dirname, "..")

export function getDb() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  return getFirestore(app)
}

export async function closeDb(db) {
  await terminate(db).catch(() => {})
}

export function buildDocId(asignatura, nivel) {
  return `${asignatura}_${nivel}`
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
}

export const CURRICULO_LEVEL_LABELS = [
  "1ro Básico",
  "2do Básico",
  "3ro Básico",
  "4to Básico",
  "5to Básico",
  "6to Básico",
  "7mo Básico",
  "8vo Básico",
  "1ro Medio",
  "2do Medio",
  "3ro Medio",
  "4to Medio",
  "NT1-2",
]

export function parseCurriculoDocId(docId) {
  const normalizedLevels = CURRICULO_LEVEL_LABELS.map((label) => ({
    label,
    normalized: buildDocId("", label).replace(/^_/, ""),
  })).sort((a, b) => b.normalized.length - a.normalized.length)

  for (const level of normalizedLevels) {
    const suffix = `_${level.normalized}`
    if (!docId.endsWith(suffix)) continue

    const rawSubject = docId.slice(0, -suffix.length)
    const fallbackSubject = SUBJECT_FALLBACK_OPTIONS.find((option) => buildDocId(option, "").replace(/_$/, "") === rawSubject)

    return {
      asignatura: fallbackSubject || rawSubject.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" "),
      nivel: level.label,
    }
  }

  return null
}

export function normalizeTextId(texto) {
  return texto
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true })
  }
}

export function writeJsonFile(filePath, data) {
  ensureDir(dirname(filePath))
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8")
}

export function parseSimpleEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const raw = readFileSync(filePath)
    .toString("utf8")
    .replace(/\u0000/g, "")

  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const [key, ...rest] = trimmed.split("=")
    env[key.trim()] = rest.join("=").trim()
  }
  return env
}

export function getEnvValue(name) {
  if (process.env[name]) return process.env[name]
  const localEnv = parseSimpleEnvFile(join(PROJECT_ROOT, ".env.local"))
  if (localEnv[name]) return localEnv[name]
  const exampleEnv = parseSimpleEnvFile(join(PROJECT_ROOT, ".env.example"))
  return exampleEnv[name] || null
}

export async function readCurriculoSnapshot(db) {
  const rootSnap = await getDocs(collection(db, "curriculo"))
  const documents = []

  for (const rootDoc of rootSnap.docs) {
    const rootData = rootDoc.data()
    const unitSnap = await getDocs(collection(db, "curriculo", rootDoc.id, "unidades"))
    const units = []

    for (const unitDoc of unitSnap.docs) {
      const unitData = unitDoc.data()
      const subcollections = {}

      for (const subName of KNOWN_CURRICULO_SUBCOLLECTIONS) {
        const subSnap = await getDocs(collection(db, "curriculo", rootDoc.id, "unidades", unitDoc.id, subName))
        subcollections[subName] = subSnap.docs.map((item) => ({
          id: item.id,
          data: item.data(),
        }))
      }

      units.push({
        id: unitDoc.id,
        data: unitData,
        subcollections,
      })
    }

    documents.push({
      id: rootDoc.id,
      data: rootData,
      units,
    })
  }

  return {
    createdAt: new Date().toISOString(),
    documents,
  }
}

export async function writeCurriculoBackupToFirestore(db, backupId, snapshot) {
  await setDoc(doc(db, "curriculo_backups", backupId), {
    createdAt: snapshot.createdAt,
    documentCount: snapshot.documents.length,
    sourceCollection: "curriculo",
  })

  for (const rootDoc of snapshot.documents) {
    await setDoc(doc(db, "curriculo_backups", backupId, "documentos", rootDoc.id), rootDoc.data)

    for (const unit of rootDoc.units) {
      await setDoc(doc(db, "curriculo_backups", backupId, "documentos", rootDoc.id, "unidades", unit.id), unit.data)

      for (const subName of KNOWN_CURRICULO_SUBCOLLECTIONS) {
        for (const item of unit.subcollections[subName] || []) {
          await setDoc(
            doc(db, "curriculo_backups", backupId, "documentos", rootDoc.id, "unidades", unit.id, subName, item.id),
            item.data
          )
        }
      }
    }
  }
}

export async function readCurriculoBackupFromFirestore(db, backupId) {
  const metaSnap = await getDoc(doc(db, "curriculo_backups", backupId))
  if (!metaSnap.exists()) {
    throw new Error(`No existe el backup ${backupId} en curriculo_backups`)
  }

  const rootSnap = await getDocs(collection(db, "curriculo_backups", backupId, "documentos"))
  const documents = []

  for (const rootDoc of rootSnap.docs) {
    const unitSnap = await getDocs(collection(db, "curriculo_backups", backupId, "documentos", rootDoc.id, "unidades"))
    const units = []

    for (const unitDoc of unitSnap.docs) {
      const subcollections = {}
      for (const subName of KNOWN_CURRICULO_SUBCOLLECTIONS) {
        const subSnap = await getDocs(collection(db, "curriculo_backups", backupId, "documentos", rootDoc.id, "unidades", unitDoc.id, subName))
        subcollections[subName] = subSnap.docs.map((item) => ({
          id: item.id,
          data: item.data(),
        }))
      }

      units.push({
        id: unitDoc.id,
        data: unitDoc.data(),
        subcollections,
      })
    }

    documents.push({
      id: rootDoc.id,
      data: rootDoc.data(),
      units,
    })
  }

  return {
    createdAt: metaSnap.data().createdAt || new Date().toISOString(),
    documents,
  }
}

export async function deleteCurriculoDocumentTree(db, docId) {
  const unitSnap = await getDocs(collection(db, "curriculo", docId, "unidades"))

  for (const unitDoc of unitSnap.docs) {
    for (const subName of KNOWN_CURRICULO_SUBCOLLECTIONS) {
      const subSnap = await getDocs(collection(db, "curriculo", docId, "unidades", unitDoc.id, subName))
      for (const item of subSnap.docs) {
        await deleteDoc(item.ref)
      }
    }
    await deleteDoc(unitDoc.ref)
  }

  await deleteDoc(doc(db, "curriculo", docId))
}

export function getAdecuacionesDuaText(unidad) {
  if (typeof unidad?.adecuaciones_dua === "string") return unidad.adecuaciones_dua
  return unidad?.adecuaciones_dua?.estrategias_neurodiversidad || ""
}

export async function importCurriculoEntries(db, entries, { replaceExisting = true } = {}) {
  const grouped = new Map()

  for (const entry of entries) {
    if (!entry?.nivel || !entry?.asignatura || !entry?.unidad) continue
    const docId = buildDocId(entry.asignatura, entry.nivel)
    if (!grouped.has(docId)) grouped.set(docId, [])
    grouped.get(docId).push(entry)
  }

  for (const [docId, groupEntries] of grouped.entries()) {
    if (replaceExisting) {
      await deleteCurriculoDocumentTree(db, docId).catch(() => {})
    }

    await setDoc(doc(db, "curriculo", docId), { ready: true })

    for (const entry of groupEntries) {
      const unidad = entry.unidad
      const unidadId = `unidad_${unidad.numero_unidad}`
      await setDoc(doc(db, "curriculo", docId, "unidades", unidadId), {
        numero_unidad: unidad.numero_unidad,
        nombre_unidad: unidad.nombre_unidad || "",
        proposito: unidad.proposito || "",
        conocimientos_previos: unidad.conocimientos_previos || [],
        palabras_clave: unidad.palabras_clave || [],
        conocimientos: unidad.conocimientos || [],
        habilidades: unidad.habilidades || [],
        actitudes: unidad.actitudes || [],
        adecuaciones_dua: getAdecuacionesDuaText(unidad),
      })

      for (const oa of unidad.objetivos_aprendizaje || []) {
        const oaId = `oa_${oa.numero}`
        await setDoc(doc(db, "curriculo", docId, "unidades", unidadId, "objetivos_aprendizaje", oaId), {
          tipo: oa.tipo || "OA",
          numero: oa.numero,
          descripcion: oa.descripcion || "",
          indicadores: oa.indicadores || [],
        })
      }

      for (const [index, actividad] of (unidad.actividades_sugeridas || []).entries()) {
        await setDoc(doc(db, "curriculo", docId, "unidades", unidadId, "actividades_sugeridas", `act_${index + 1}`), {
          nombre: actividad.nombre || `Actividad ${index + 1}`,
          oas_asociados: actividad.oas_asociados || [],
          descripcion: actividad.descripcion || "",
        })
      }

      for (const [index, evaluacion] of (unidad.ejemplos_evaluacion || []).entries()) {
        const payload = {
          titulo: evaluacion.titulo || `Ejemplo ${index + 1}`,
          oas_evaluados: evaluacion.oas_evaluados || [],
          actividad_evaluacion: evaluacion.actividad_evaluacion || "",
        }

        if (evaluacion.criterios_evaluacion && Object.keys(evaluacion.criterios_evaluacion).length > 0) {
          payload.criterios_evaluacion = evaluacion.criterios_evaluacion
        } else {
          payload.criterios_evaluacion = {
            criterios: [
              ...(evaluacion.criterios_proceso || []),
              ...(evaluacion.criterios_presentacion || []),
            ],
          }
        }

        await setDoc(doc(db, "curriculo", docId, "unidades", unidadId, "ejemplos_evaluacion", `ev_${index + 1}`), payload)
      }
    }
  }
}
