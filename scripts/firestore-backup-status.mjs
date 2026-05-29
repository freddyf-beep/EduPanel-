import { readdir, readFile, stat } from "fs/promises"
import { basename, dirname, join, resolve } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = resolve(__dirname, "..")
const BACKUP_STATUS_FILE = "backup-status.json"
const originalEnvKeys = new Set(Object.keys(process.env))

function parseArgs(argv) {
  const args = {
    limit: 10,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--limit") {
      args.limit = Number(argv[i + 1] || "10")
      i += 1
    } else if (arg === "--help" || arg === "-h") {
      console.log("Uso: node scripts/firestore-backup-status.mjs [--limit 10]")
      process.exit(0)
    } else {
      throw new Error(`Argumento no reconocido: ${arg}`)
    }
  }

  return args
}

async function loadEnvFile(filePath, { overrideFileValues = false } = {}) {
  let raw
  try {
    raw = await readFile(filePath, "utf8")
  } catch (error) {
    if (error.code === "ENOENT") return
    throw error
  }

  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const key = match[1].trim()
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    if (originalEnvKeys.has(key)) continue
    if (process.env[key] === undefined || overrideFileValues) {
      process.env[key] = value
    }
  }
}

async function loadBackupEnv() {
  await loadEnvFile(join(PROJECT_ROOT, ".env.local"))
  await loadEnvFile(join(PROJECT_ROOT, ".env.backup.local"), { overrideFileValues: true })
}

function env(name, fallback = "") {
  const value = process.env[name]
  return value === undefined || value === null || value === "" ? fallback : value
}

function boolEnv(name, fallback = false) {
  const value = process.env[name]
  if (value === undefined || value === null || value === "") return fallback
  return ["1", "true", "yes", "si", "on"].includes(String(value).toLowerCase())
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"))
  } catch (error) {
    if (error.code === "ENOENT") return null
    throw error
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function stripBackupSuffix(fileName) {
  if (fileName.endsWith(".json.gz")) return fileName.slice(0, -".json.gz".length)
  if (fileName.endsWith(".json")) return fileName.slice(0, -".json".length)
  if (fileName.endsWith(".sha256")) return fileName.slice(0, -".sha256".length)
  return null
}

async function listRecentBackups(outDir, limit) {
  const entries = await readdir(outDir, { withFileTypes: true }).catch(() => [])
  const groups = new Map()

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.startsWith("edupanel-firestore-")) continue

    const baseName = stripBackupSuffix(entry.name)
    if (!baseName) continue

    const current = groups.get(baseName) || {}
    if (entry.name.endsWith(".json.gz")) current.archiveName = entry.name
    else if (entry.name.endsWith(".json") && !current.archiveName) current.archiveName = entry.name
    else if (entry.name.endsWith(".sha256")) current.checksumName = entry.name
    groups.set(baseName, current)
  }

  const artifacts = await Promise.all(
    Array.from(groups.entries()).map(async ([baseName, files]) => {
      if (!files.archiveName) return null
      const archivePath = join(outDir, files.archiveName)
      const archiveStat = await stat(archivePath)

      return {
        baseName,
        archiveName: files.archiveName,
        archivePath,
        checksumName: files.checksumName || null,
        checksumPath: files.checksumName ? join(outDir, files.checksumName) : null,
        sizeBytes: archiveStat.size,
        modifiedAt: archiveStat.mtime.toISOString(),
      }
    })
  )

  return artifacts
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))
    .slice(0, limit)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  await loadBackupEnv()

  const outDir = resolve(PROJECT_ROOT, env("BACKUP_LOCAL_DIR", "backups/firestore"))
  const statusPath = join(outDir, BACKUP_STATUS_FILE)
  const status = (await readJsonIfExists(statusPath)) || {
    version: 1,
    updatedAt: null,
    running: null,
    lastSuccess: null,
    lastFailure: null,
  }

  if (status.running?.pid && !isProcessAlive(status.running.pid)) {
    status.running = null
  }

  const recentBackups = await listRecentBackups(outDir, args.limit)

  console.log(
    JSON.stringify(
      {
        config: {
          outDir,
          retentionDays: Number(env("BACKUP_RETENTION_DAYS", "0")) || 0,
          keepPlainJson: boolEnv("BACKUP_KEEP_PLAIN_JSON", true),
          remoteConfigured: !!(env("BACKUP_REMOTE_USER") && env("BACKUP_REMOTE_HOST") && env("BACKUP_REMOTE_DIR")),
          remoteEnabledByDefault: boolEnv("BACKUP_REMOTE_ENABLED", false),
          remoteUser: env("BACKUP_REMOTE_USER") || null,
          remoteHost: env("BACKUP_REMOTE_HOST") || null,
          remotePort: env("BACKUP_REMOTE_PORT", "22") || null,
          remoteDir: env("BACKUP_REMOTE_DIR") || null,
          hasIdentityFile: !!env("BACKUP_REMOTE_IDENTITY_FILE"),
        },
        status,
        recentBackups,
        serverTime: new Date().toISOString(),
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error("FIRESTORE_BACKUP_STATUS_ERROR", error)
  process.exitCode = 1
})
