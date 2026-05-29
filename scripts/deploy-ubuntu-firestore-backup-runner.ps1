param(
  [string]$HostAlias = "mi-servidor-ubuntu",
  [string]$RunnerDir = "/home/udefret/edupanel-backup-runner",
  [string]$BackupDir = "/home/udefret/edupanel-backups/firestore",
  [switch]$DisableWindowsTask
)

$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$stage = Join-Path $env:TEMP ("edupanel-ubuntu-backup-runner-" + [guid]::NewGuid().ToString())
$stageScripts = Join-Path $stage "scripts"
New-Item -ItemType Directory -Force -Path $stageScripts | Out-Null

function Parse-EnvFile([string]$Path) {
  $values = @{}
  if (!(Test-Path $Path)) { return $values }

  Get-Content $Path | ForEach-Object {
    if ($_ -match '^\s*(?:export\s+)?([^#=\s]+)\s*=\s*(.*)\s*$') {
      $key = $matches[1].Trim()
      $value = $matches[2].Trim()
      if ((($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) -and $value.Length -ge 2) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      $values[$key] = $value
    }
  }

  return $values
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

$envValues = Parse-EnvFile (Join-Path $projectRoot ".env.local")
$required = "FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY"
foreach ($key in $required) {
  if (-not $envValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envValues[$key])) {
    throw "Falta $key en .env.local"
  }
}

Copy-Item -LiteralPath (Join-Path $projectRoot "ops\ubuntu-backup-runner\package.json") -Destination (Join-Path $stage "package.json") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "ops\ubuntu-backup-runner\run-backup.sh") -Destination (Join-Path $stage "run-backup.sh") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\firestore-backup.mjs") -Destination (Join-Path $stageScripts "firestore-backup.mjs") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\firestore-backup-status.mjs") -Destination (Join-Path $stageScripts "firestore-backup-status.mjs") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\firestore-restore.mjs") -Destination (Join-Path $stageScripts "firestore-restore.mjs") -Force

$remoteEnvLocal = @(
  "FIREBASE_ADMIN_PROJECT_ID=$($envValues['FIREBASE_ADMIN_PROJECT_ID'])",
  "FIREBASE_ADMIN_CLIENT_EMAIL=$($envValues['FIREBASE_ADMIN_CLIENT_EMAIL'])",
  "FIREBASE_ADMIN_PRIVATE_KEY=$($envValues['FIREBASE_ADMIN_PRIVATE_KEY'])"
) -join "`n"
Write-Utf8NoBom (Join-Path $stage ".env.local") ($remoteEnvLocal + "`n")

$remoteEnvBackup = @(
  "BACKUP_LOCAL_DIR=$BackupDir",
  "BACKUP_RETENTION_DAYS=7",
  "BACKUP_KEEP_PLAIN_JSON=false",
  "BACKUP_REMOTE_ENABLED=false",
  "FIRESTORE_PREFER_REST=true"
) -join "`n"
Write-Utf8NoBom (Join-Path $stage ".env.backup.local") ($remoteEnvBackup + "`n")

$currentCron = ssh -o BatchMode=yes $HostAlias "crontab -l 2>/dev/null || true"
$cronLines = @()
if ($currentCron) {
  $cronLines = $currentCron -split "\r?\n" | Where-Object { $_ -and ($_ -notmatch [regex]::Escape("$RunnerDir/run-backup.sh")) }
}
$cronLines += "0 * * * * $RunnerDir/run-backup.sh scheduled-hourly >> $RunnerDir/logs/cron.log 2>&1"
Write-Utf8NoBom (Join-Path $stage "edupanel.cron") ((($cronLines -join "`n") + "`n"))

ssh -o BatchMode=yes $HostAlias "mkdir -p $RunnerDir/scripts $RunnerDir/logs $BackupDir"
scp -o BatchMode=yes (Join-Path $stage "package.json") "${HostAlias}:$RunnerDir/package.json"
scp -o BatchMode=yes (Join-Path $stage "run-backup.sh") "${HostAlias}:$RunnerDir/run-backup.sh"
scp -o BatchMode=yes (Join-Path $stage ".env.local") "${HostAlias}:$RunnerDir/.env.local"
scp -o BatchMode=yes (Join-Path $stage ".env.backup.local") "${HostAlias}:$RunnerDir/.env.backup.local"
scp -o BatchMode=yes (Join-Path $stage "edupanel.cron") "${HostAlias}:/tmp/edupanel.cron"
scp -o BatchMode=yes (Join-Path $stageScripts "firestore-backup.mjs") "${HostAlias}:$RunnerDir/scripts/firestore-backup.mjs"
scp -o BatchMode=yes (Join-Path $stageScripts "firestore-backup-status.mjs") "${HostAlias}:$RunnerDir/scripts/firestore-backup-status.mjs"
scp -o BatchMode=yes (Join-Path $stageScripts "firestore-restore.mjs") "${HostAlias}:$RunnerDir/scripts/firestore-restore.mjs"

ssh -o BatchMode=yes $HostAlias "cd $RunnerDir && chmod +x run-backup.sh && npm install --omit=dev && crontab /tmp/edupanel.cron && rm -f /tmp/edupanel.cron"

if ($DisableWindowsTask) {
  Disable-ScheduledTask -TaskName "EduPanel Firestore Backup" -ErrorAction SilentlyContinue | Out-Null
}

Remove-Item -LiteralPath $stage -Recurse -Force

Write-Host "Runner Ubuntu desplegado en $HostAlias"
Write-Host "Runner: $RunnerDir"
Write-Host "Backups: $BackupDir"
Write-Host "Cron: 0 * * * * $RunnerDir/run-backup.sh scheduled-hourly"
