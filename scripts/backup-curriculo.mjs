import { join } from "path"
import {
  PROJECT_ROOT,
  getDb,
  closeDb,
  readCurriculoSnapshot,
  writeCurriculoBackupToFirestore,
  writeJsonFile,
} from "./curriculo-common.mjs"

function buildBackupId() {
  const iso = new Date().toISOString().replace(/[:.]/g, "-")
  return `curriculo_${iso}`
}

async function main() {
  const db = getDb()
  const backupId = buildBackupId()
  const snapshot = await readCurriculoSnapshot(db)

  await writeCurriculoBackupToFirestore(db, backupId, snapshot)

  const localPath = join(PROJECT_ROOT, "Archivos de Curriculum", "backups", `${backupId}.json`)
  writeJsonFile(localPath, {
    backupId,
    ...snapshot,
  })

  console.log(JSON.stringify({
    ok: true,
    backupId,
    documentCount: snapshot.documents.length,
    localPath,
  }, null, 2))

  await closeDb(db)
}

main().catch(async (error) => {
  console.error("BACKUP_ERROR", error)
  process.exitCode = 1
})
