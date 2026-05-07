import {
  closeDb,
  getDb,
  importCurriculoEntries,
  parseCurriculoDocId,
  readCurriculoBackupFromFirestore,
} from "./curriculo-common.mjs"

function snapshotToEntries(snapshot) {
  const entries = []
  for (const rootDoc of snapshot.documents) {
    const parsed = parseCurriculoDocId(rootDoc.id)
    for (const unit of rootDoc.units) {
      entries.push({
        nivel: rootDoc.data?.nivel || parsed?.nivel || "",
        asignatura: rootDoc.data?.asignatura || parsed?.asignatura || "",
        unidad: {
          ...unit.data,
          objetivos_aprendizaje: (unit.subcollections.objetivos_aprendizaje || []).map((item) => item.data),
          actividades_sugeridas: (unit.subcollections.actividades_sugeridas || []).map((item) => item.data),
          ejemplos_evaluacion: (unit.subcollections.ejemplos_evaluacion || []).map((item) => item.data),
        },
      })
    }
  }
  return entries
}

async function main() {
  const backupId = process.argv[2]
  if (!backupId) {
    throw new Error("Uso: node scripts/restore-curriculo-backup.mjs <backupId>")
  }

  const db = getDb()
  const snapshot = await readCurriculoBackupFromFirestore(db, backupId)
  const entries = snapshotToEntries(snapshot).filter((entry) => entry.asignatura && entry.nivel)

  if (entries.length === 0) {
    throw new Error(`El backup ${backupId} no trae metadatos de asignatura/nivel para restaurar automáticamente.`)
  }

  await importCurriculoEntries(db, entries, { replaceExisting: true })

  console.log(JSON.stringify({
    ok: true,
    backupId,
    restoredEntries: entries.length,
  }, null, 2))

  await closeDb(db)
}

main().catch((error) => {
  console.error("RESTORE_ERROR", error)
  process.exitCode = 1
})
