import "server-only"

import { access, mkdir, readdir, readFile, stat } from "fs/promises"
import { constants as fsConstants } from "fs"
import { execFile, spawn } from "child_process"
import { promisify } from "util"
import { basename, join, resolve } from "path"

const execFileAsync = promisify(execFile)

const PROJECT_ROOT = resolve(process.cwd())
const DEFAULT_BACKUP_DIR = "backups/firestore"
const BACKUP_STATUS_FILE = "backup-status.json"
const BACKUP_LOCK_FILE = "backup-lock.json"
const BACKUP_SCRIPT_PATH = join(PROJECT_ROOT, "scripts", "firestore-backup.mjs")

export const BACKUP_TASK_NAME = "EduPanel Firestore Backup"

type NullableString = string | null

export interface BackupConfig {
  executionTarget: "local" | "ssh"
  outDir: string
  retentionDays: number
  keepPlainJson: boolean
  remoteConfigured: boolean
  remoteEnabledByDefault: boolean
  remoteUser: NullableString
  remoteHost: NullableString
  remotePort: NullableString
  remoteDir: NullableString
  hasIdentityFile: boolean
  sshConfigured: boolean
  sshHostAlias: NullableString
  sshRunnerDir: NullableString
}

export interface BackupRunRecord {
  ok: boolean
  trigger: string
  startedAt: string
  finishedAt: string
  durationMs?: number
  format?: string
  projectId?: string
  collectionCount?: number
  documentCount?: number
  localJsonPath?: NullableString
  localArchivePath?: NullableString
  checksumPath?: NullableString
  checksum?: NullableString
  keepPlainJson?: boolean
  removedByRetention?: string[]
  remote?: unknown
  message?: string
}

export interface BackupStatusFile {
  version: number
  updatedAt: NullableString
  running: {
    pid: number
    startedAt: string
    trigger: string
    outDir: string
    remoteRequested: boolean
  } | null
  lastSuccess: BackupRunRecord | null
  lastFailure: BackupRunRecord | null
}

export interface RecentBackupArtifact {
  baseName: string
  archiveName: string
  archivePath: string
  checksumName: NullableString
  checksumPath: NullableString
  sizeBytes: number
  modifiedAt: string
}

export interface ScheduledTaskSummary {
  installed: boolean
  taskName: string
  state: NullableString
  lastRunTime: NullableString
  nextRunTime: NullableString
  lastTaskResult: number | null
  action: NullableString
  trigger: NullableString
}

export interface BackupDashboardSnapshot {
  config: BackupConfig
  schedule: ScheduledTaskSummary
  status: BackupStatusFile
  recentBackups: RecentBackupArtifact[]
  serverTime: string
}

function parseEnvText(raw: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const line of raw.replace(/\u0000/g, "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$/)
    if (!match) continue

    const key = match[1].trim()
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value
  }

  return values
}

async function readEnvFile(filePath: string): Promise<Record<string, string>> {
  try {
    return parseEnvText(await readFile(filePath, "utf8"))
  } catch (error: any) {
    if (error?.code === "ENOENT") return {}
    throw error
  }
}

function pickValue(envValues: Record<string, string>, key: string, fallback = ""): string {
  const processValue = process.env[key]
  if (typeof processValue === "string" && processValue.length > 0) {
    return processValue
  }

  const fileValue = envValues[key]
  return typeof fileValue === "string" && fileValue.length > 0 ? fileValue : fallback
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback
  return ["1", "true", "yes", "si", "on"].includes(value.toLowerCase())
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function loadBackupConfig(): Promise<BackupConfig> {
  const envValues = {
    ...(await readEnvFile(join(PROJECT_ROOT, ".env.local"))),
    ...(await readEnvFile(join(PROJECT_ROOT, ".env.backup.local"))),
  }

  const outDir = pickValue(envValues, "BACKUP_LOCAL_DIR", DEFAULT_BACKUP_DIR)
  const remoteUser = pickValue(envValues, "BACKUP_REMOTE_USER", "")
  const remoteHost = pickValue(envValues, "BACKUP_REMOTE_HOST", "")
  const remotePort = pickValue(envValues, "BACKUP_REMOTE_PORT", "22")
  const remoteDir = pickValue(envValues, "BACKUP_REMOTE_DIR", "")
  const executionTarget = pickValue(envValues, "BACKUP_EXECUTION_TARGET", "local").toLowerCase() === "ssh" ? "ssh" : "local"
  const sshHostAlias = pickValue(envValues, "BACKUP_SSH_HOST_ALIAS", "")
  const sshRunnerDir = pickValue(envValues, "BACKUP_SSH_RUNNER_DIR", "")

  return {
    executionTarget,
    outDir,
    retentionDays: parseNumber(pickValue(envValues, "BACKUP_RETENTION_DAYS", "0"), 0),
    keepPlainJson: parseBoolean(pickValue(envValues, "BACKUP_KEEP_PLAIN_JSON", "true"), true),
    remoteConfigured: !!(remoteUser && remoteHost && remoteDir),
    remoteEnabledByDefault: parseBoolean(pickValue(envValues, "BACKUP_REMOTE_ENABLED", "false"), false),
    remoteUser: remoteUser || null,
    remoteHost: remoteHost || null,
    remotePort: remotePort || null,
    remoteDir: remoteDir || null,
    hasIdentityFile: !!pickValue(envValues, "BACKUP_REMOTE_IDENTITY_FILE", ""),
    sshConfigured: !!(sshHostAlias && sshRunnerDir),
    sshHostAlias: sshHostAlias || null,
    sshRunnerDir: sshRunnerDir || null,
  }
}

export function resolveBackupDir(outDir: string): string {
  return resolve(PROJECT_ROOT, outDir || DEFAULT_BACKUP_DIR)
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T
  } catch (error: any) {
    if (error?.code === "ENOENT") return null
    throw error
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function stripBackupSuffix(fileName: string): string | null {
  if (fileName.endsWith(".json.gz")) return fileName.slice(0, -".json.gz".length)
  if (fileName.endsWith(".json")) return fileName.slice(0, -".json".length)
  return null
}

function shQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function buildRemoteNodeCommand(script: string): string {
  const encoded = Buffer.from(script, "utf8").toString("base64")
  return `node -e ${shQuote(`eval(Buffer.from("${encoded}","base64").toString("utf8"))`)}`
}

async function execSsh(config: BackupConfig, remoteCommand: string): Promise<string> {
  if (!config.sshConfigured || !config.sshHostAlias) {
    throw new Error("Falta BACKUP_SSH_HOST_ALIAS o BACKUP_SSH_RUNNER_DIR para usar el runner Ubuntu.")
  }

  const { stdout } = await execFileAsync("ssh", ["-o", "BatchMode=yes", config.sshHostAlias, remoteCommand], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  })

  return stdout.trim()
}

async function readLocalBackupStatus(config: BackupConfig): Promise<BackupStatusFile> {
  const statusPath = join(resolveBackupDir(config.outDir), BACKUP_STATUS_FILE)
  const status = (await readJsonFile<BackupStatusFile>(statusPath)) || {
    version: 1,
    updatedAt: null,
    running: null,
    lastSuccess: null,
    lastFailure: null,
  }

  if (status.running?.pid && !isProcessAlive(status.running.pid)) {
    return {
      ...status,
      running: null,
    }
  }

  return status
}

async function listLocalRecentBackups(limit: number, config: BackupConfig): Promise<RecentBackupArtifact[]> {
  const outDir = resolveBackupDir(config.outDir)

  try {
    await access(outDir, fsConstants.F_OK)
  } catch {
    return []
  }

  const entries = await readdir(outDir, { withFileTypes: true })
  const groups = new Map<string, { archiveName?: string; checksumName?: string }>()

  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (!entry.name.startsWith("edupanel-firestore-")) continue

    const baseName = stripBackupSuffix(entry.name) || (entry.name.endsWith(".sha256") ? entry.name.slice(0, -".sha256".length) : null)
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
      } satisfies RecentBackupArtifact
    })
  )

  return artifacts
    .filter((item): item is RecentBackupArtifact => !!item)
    .sort((a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt))
    .slice(0, limit)
}

function escapeSingleQuotes(value: string): string {
  return value.replace(/'/g, "''")
}

async function getWindowsScheduledTaskSummary(taskName = BACKUP_TASK_NAME): Promise<ScheduledTaskSummary> {
  if (process.platform !== "win32") {
    return {
      installed: false,
      taskName,
      state: null,
      lastRunTime: null,
      nextRunTime: null,
      lastTaskResult: null,
      action: null,
      trigger: null,
    }
  }

  const escapedTaskName = escapeSingleQuotes(taskName)
  const command = `
$task = Get-ScheduledTask -TaskName '${escapedTaskName}' -ErrorAction SilentlyContinue
if (-not $task) {
  [pscustomobject]@{
    installed = $false
    taskName = '${escapedTaskName}'
    state = $null
    lastRunTime = $null
    nextRunTime = $null
    lastTaskResult = $null
    action = $null
    trigger = $null
  } | ConvertTo-Json -Compress
  exit 0
}
$info = Get-ScheduledTaskInfo -TaskName '${escapedTaskName}'
[pscustomobject]@{
  installed = $true
  taskName = $task.TaskName
  state = [string]$task.State
  lastRunTime = if ($info.LastRunTime -and $info.LastRunTime.Year -gt 1900) { $info.LastRunTime.ToString('o') } else { $null }
  nextRunTime = if ($info.NextRunTime -and $info.NextRunTime.Year -gt 1900) { $info.NextRunTime.ToString('o') } else { $null }
  lastTaskResult = [int]$info.LastTaskResult
  action = (($task.Actions | ForEach-Object { $_.Execute + ' ' + $_.Arguments }) -join '; ')
  trigger = (($task.Triggers | ForEach-Object { $_.CimClass.CimClassName + ':' + $_.StartBoundary }) -join '; ')
} | ConvertTo-Json -Compress
`.trim()

  const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", command], {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  })

  return JSON.parse(stdout.trim()) as ScheduledTaskSummary
}

function latestRunResult(status: BackupStatusFile): number | null {
  const successAt = status.lastSuccess?.finishedAt ? Date.parse(status.lastSuccess.finishedAt) : 0
  const failureAt = status.lastFailure?.finishedAt ? Date.parse(status.lastFailure.finishedAt) : 0
  if (!successAt && !failureAt) return null
  return failureAt > successAt ? 1 : 0
}

async function getRemoteScheduleSummary(config: BackupConfig, status: BackupStatusFile): Promise<ScheduledTaskSummary> {
  const runnerDir = config.sshRunnerDir!
  const remoteCommand = `cd ${shQuote(runnerDir)} && ${buildRemoteNodeCommand(`
    const { execSync } = require("child_process")
    const fs = require("fs")
    const path = require("path")

    const runnerDir = process.cwd()
    let cronLine = ""
    try {
      const raw = execSync("crontab -l", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      cronLine = raw
        .split(/\\r?\\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes(\`\${runnerDir}/run-backup.sh\`))
        .slice(-1)[0] || ""
    } catch {
      cronLine = ""
    }

    const cronLogPath = path.join(runnerDir, "logs", "cron.log")
    const now = new Date()
    const nextRun = new Date(now)
    nextRun.setMinutes(0, 0, 0)
    nextRun.setHours(now.getHours() + 1)

    console.log(JSON.stringify({
      installed: !!cronLine,
      cronLine,
      lastRunTime: fs.existsSync(cronLogPath) ? fs.statSync(cronLogPath).mtime.toISOString() : null,
      nextRunTime: nextRun.toISOString(),
    }))
  `)}`

  const raw = await execSsh(config, remoteCommand)
  const summary = JSON.parse(raw) as {
    installed: boolean
    cronLine: string
    lastRunTime: string | null
    nextRunTime: string | null
  }

  return {
    installed: summary.installed,
    taskName: "Ubuntu cron",
    state: status.running ? "Running" : summary.installed ? "Ready" : "Missing",
    lastRunTime: summary.lastRunTime || status.lastSuccess?.finishedAt || status.lastFailure?.finishedAt || null,
    nextRunTime: summary.installed ? summary.nextRunTime : null,
    lastTaskResult: latestRunResult(status),
    action: summary.cronLine || null,
    trigger: summary.installed ? "cron: 0 * * * *" : null,
  }
}

async function getLocalDashboardSnapshot(config: BackupConfig, taskName = BACKUP_TASK_NAME): Promise<BackupDashboardSnapshot> {
  const [status, recentBackups, schedule] = await Promise.all([
    readLocalBackupStatus(config),
    listLocalRecentBackups(10, config),
    getWindowsScheduledTaskSummary(taskName),
  ])

  return {
    config,
    schedule,
    status,
    recentBackups,
    serverTime: new Date().toISOString(),
  }
}

async function getRemoteDashboardSnapshot(config: BackupConfig): Promise<BackupDashboardSnapshot> {
  if (!config.sshConfigured || !config.sshRunnerDir) {
    throw new Error("El modo ssh requiere BACKUP_SSH_HOST_ALIAS y BACKUP_SSH_RUNNER_DIR.")
  }

  const statusCommand = `cd ${shQuote(config.sshRunnerDir)} && /usr/bin/node scripts/firestore-backup-status.mjs --limit 10`
  const raw = await execSsh(config, statusCommand)
  const remoteSnapshot = JSON.parse(raw) as {
    config: Omit<BackupConfig, "executionTarget" | "sshConfigured" | "sshHostAlias" | "sshRunnerDir">
    status: BackupStatusFile
    recentBackups: RecentBackupArtifact[]
    serverTime: string
  }

  const mergedConfig: BackupConfig = {
    ...config,
    outDir: remoteSnapshot.config.outDir,
    retentionDays: remoteSnapshot.config.retentionDays,
    keepPlainJson: remoteSnapshot.config.keepPlainJson,
    remoteConfigured: remoteSnapshot.config.remoteConfigured,
    remoteEnabledByDefault: remoteSnapshot.config.remoteEnabledByDefault,
    remoteUser: remoteSnapshot.config.remoteUser,
    remoteHost: remoteSnapshot.config.remoteHost,
    remotePort: remoteSnapshot.config.remotePort,
    remoteDir: remoteSnapshot.config.remoteDir,
    hasIdentityFile: remoteSnapshot.config.hasIdentityFile,
  }

  const schedule = await getRemoteScheduleSummary(mergedConfig, remoteSnapshot.status)

  return {
    config: mergedConfig,
    schedule,
    status: remoteSnapshot.status,
    recentBackups: remoteSnapshot.recentBackups,
    serverTime: remoteSnapshot.serverTime,
  }
}

export async function getBackupDashboardSnapshot(taskName = BACKUP_TASK_NAME): Promise<BackupDashboardSnapshot> {
  const config = await loadBackupConfig()
  if (config.executionTarget === "ssh") {
    return getRemoteDashboardSnapshot(config)
  }
  return getLocalDashboardSnapshot(config, taskName)
}

async function isLocalBackupRunning(config: BackupConfig): Promise<boolean> {
  const lockPath = join(resolveBackupDir(config.outDir), BACKUP_LOCK_FILE)
  const lockData = await readJsonFile<{ pid?: number }>(lockPath)
  return !!(lockData?.pid && isProcessAlive(lockData.pid))
}

async function isRemoteBackupRunning(config: BackupConfig): Promise<boolean> {
  const snapshot = await getRemoteDashboardSnapshot(config)
  return !!snapshot.status.running
}

export async function startBackupProcess(options?: {
  remote?: boolean
  trigger?: string
}): Promise<{ pid: number | null; startedAt: string; remoteRequested: boolean; trigger: string }> {
  const config = await loadBackupConfig()
  const trigger = options?.trigger || "manual-admin"

  if (config.executionTarget === "ssh") {
    if (await isRemoteBackupRunning(config)) {
      throw new Error("Ya hay un respaldo en curso.")
    }

    const runnerDir = config.sshRunnerDir!
    const startCommand = `cd ${shQuote(runnerDir)} && mkdir -p logs && nohup ./run-backup.sh ${shQuote(trigger)} > logs/manual.log 2>&1 < /dev/null & echo $!`
    const stdout = await execSsh(config, startCommand)
    const pid = Number(stdout.trim()) || null

    return {
      pid,
      startedAt: new Date().toISOString(),
      remoteRequested: false,
      trigger,
    }
  }

  const outDir = resolveBackupDir(config.outDir)
  await mkdir(outDir, { recursive: true })

  if (await isLocalBackupRunning(config)) {
    throw new Error("Ya hay un respaldo en curso.")
  }

  const remoteRequested = options?.remote ?? config.remoteEnabledByDefault
  const args = [BACKUP_SCRIPT_PATH, "--trigger", trigger]
  if (remoteRequested) {
    args.push("--remote")
  }

  const child = spawn(process.execPath, args, {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  })

  child.unref()

  return {
    pid: child.pid ?? null,
    startedAt: new Date().toISOString(),
    remoteRequested,
    trigger,
  }
}

export function relativeBackupPath(absolutePath: string): string {
  return basename(absolutePath)
}
