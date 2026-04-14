import { readdirSync, readFileSync, statSync } from "fs"
import { extname, join } from "path"
import {
  PROJECT_ROOT,
  closeDb,
  getDb,
  importCurriculoEntries,
} from "./curriculo-common.mjs"

const DEFAULT_JSON_DIR = join(PROJECT_ROOT, "Archivos de Curriculum", "json_extraido")

function collectJsonFiles(dirPath) {
  const files = []
  for (const name of readdirSync(dirPath)) {
    if (name.startsWith("_")) continue
    const fullPath = join(dirPath, name)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...collectJsonFiles(fullPath))
      continue
    }
    if (extname(fullPath).toLowerCase() === ".json") {
      files.push(fullPath)
    }
  }
  return files
}

async function main() {
  const filterText = process.argv.slice(2).join(" ").trim().toLowerCase() || null
  const db = getDb()

  try {
    const files = collectJsonFiles(DEFAULT_JSON_DIR).filter(
      (filePath) => !filterText || filePath.toLowerCase().includes(filterText)
    )
    const entries = []

    for (const filePath of files) {
      const parsed = JSON.parse(readFileSync(filePath, "utf8"))
      if (Array.isArray(parsed)) {
        entries.push(...parsed)
      }
    }

    if (entries.length === 0) {
      throw new Error("No encontré archivos JSON válidos para importar")
    }

    await importCurriculoEntries(db, entries, { replaceExisting: true })

    console.log(JSON.stringify({
      ok: true,
      importedEntries: entries.length,
      files: files.length,
    }, null, 2))
  } finally {
    await closeDb(db).catch(() => {})
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("IMPORT_ERROR", error)
    process.exit(1)
  })
