param(
  [string]$HostAlias = "servidor-ubuntu",
  [string]$RunnerDir = "/home/udefret/edupanel-backup-runner",
  [string]$BackupDir = "/home/udefret/edupanel-backups/firestore",
  [string]$LiveBackupDir = "/home/udefret/edupanel-backups/firebase-live",
  [string]$EnvLocalPath = "",
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

if ([string]::IsNullOrWhiteSpace($EnvLocalPath)) {
  $preferredEnv = "C:\Users\fredd\OneDrive\Documentos\edupanel_local\.env.local"
  if (Test-Path $preferredEnv) {
    $EnvLocalPath = $preferredEnv
  } else {
    $EnvLocalPath = Join-Path $projectRoot ".env.local"
  }
}

$envValues = Parse-EnvFile $EnvLocalPath
$required = "FIREBASE_ADMIN_PROJECT_ID", "FIREBASE_ADMIN_CLIENT_EMAIL", "FIREBASE_ADMIN_PRIVATE_KEY"
foreach ($key in $required) {
  if (-not $envValues.ContainsKey($key) -or [string]::IsNullOrWhiteSpace($envValues[$key])) {
    throw "Falta $key en .env.local"
  }
}

Copy-Item -LiteralPath (Join-Path $projectRoot "ops\ubuntu-backup-runner\package.json") -Destination (Join-Path $stage "package.json") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "ops\ubuntu-backup-runner\run-backup.sh") -Destination (Join-Path $stage "run-backup.sh") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "ops\ubuntu-backup-runner\run-live-backup.sh") -Destination (Join-Path $stage "run-live-backup.sh") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "ops\ubuntu-backup-runner\ecosystem.config.cjs") -Destination (Join-Path $stage "ecosystem.config.cjs") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\firestore-backup.mjs") -Destination (Join-Path $stageScripts "firestore-backup.mjs") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\firestore-backup-status.mjs") -Destination (Join-Path $stageScripts "firestore-backup-status.mjs") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\firestore-restore.mjs") -Destination (Join-Path $stageScripts "firestore-restore.mjs") -Force
Copy-Item -LiteralPath (Join-Path $projectRoot "scripts\firebase-live-backup.mjs") -Destination (Join-Path $stageScripts "firebase-live-backup.mjs") -Force

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

$remoteEnvLive = @(
  "FIREBASE_LIVE_BACKUP_DIR=$LiveBackupDir",
  "FIREBASE_LIVE_RETENTION_DAYS=30",
  "FIREBASE_LIVE_HEARTBEAT_MS=30000",
  "AUTH_POLL_INTERVAL_MS=60000",
  "FIRESTORE_ROOT_DISCOVERY_INTERVAL_MS=30000",
  "FIRESTORE_DISCOVERY_INTERVAL_MS=300000",
  "FIRESTORE_FULL_SNAPSHOT_INTERVAL_MS=21600000"
) -join "`n"
Write-Utf8NoBom (Join-Path $stage ".env.live.local") ($remoteEnvLive + "`n")

$currentCron = (ssh -o BatchMode=yes $HostAlias "crontab -l 2>/dev/null || true") -join "`n"
$currentCron = $currentCron -replace '(?<=2>&1)(?=\S)', "`n"
$cronLines = @()
if ($currentCron) {
  $cronLines = $currentCron -split "\r?\n" | Where-Object {
    $_ -and
    ($_ -notmatch [regex]::Escape("$RunnerDir/run-backup.sh")) -and
    ($_ -notmatch "edupanel-firebase-live-backup") -and
    ($_ -notmatch "ecosystem\.config\.cjs")
  }
}
$cronLines += "0 * * * * $RunnerDir/run-backup.sh scheduled-hourly >> $RunnerDir/logs/cron.log 2>&1"
$cronLines += "@reboot cd $RunnerDir && /usr/bin/pm2 startOrReload ecosystem.config.cjs --update-env >> $RunnerDir/logs/pm2-reboot.log 2>&1"
$lf = [string][char]10
$cronContent = ([string]::Join($lf, [string[]]$cronLines) + $lf)
Write-Utf8NoBom (Join-Path $stage "edupanel.cron") $cronContent
$cronB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($cronContent))

ssh -o BatchMode=yes $HostAlias "mkdir -p $RunnerDir/scripts $RunnerDir/logs $BackupDir $LiveBackupDir"
scp -o BatchMode=yes (Join-Path $stage "package.json") "${HostAlias}:$RunnerDir/package.json"
scp -o BatchMode=yes (Join-Path $stage "run-backup.sh") "${HostAlias}:$RunnerDir/run-backup.sh"
scp -o BatchMode=yes (Join-Path $stage "run-live-backup.sh") "${HostAlias}:$RunnerDir/run-live-backup.sh"
scp -o BatchMode=yes (Join-Path $stage "ecosystem.config.cjs") "${HostAlias}:$RunnerDir/ecosystem.config.cjs"
scp -o BatchMode=yes (Join-Path $stage ".env.local") "${HostAlias}:$RunnerDir/.env.local"
scp -o BatchMode=yes (Join-Path $stage ".env.backup.local") "${HostAlias}:$RunnerDir/.env.backup.local"
scp -o BatchMode=yes (Join-Path $stage ".env.live.local") "${HostAlias}:$RunnerDir/.env.live.local"
scp -o BatchMode=yes (Join-Path $stageScripts "firestore-backup.mjs") "${HostAlias}:$RunnerDir/scripts/firestore-backup.mjs"
scp -o BatchMode=yes (Join-Path $stageScripts "firestore-backup-status.mjs") "${HostAlias}:$RunnerDir/scripts/firestore-backup-status.mjs"
scp -o BatchMode=yes (Join-Path $stageScripts "firestore-restore.mjs") "${HostAlias}:$RunnerDir/scripts/firestore-restore.mjs"
scp -o BatchMode=yes (Join-Path $stageScripts "firebase-live-backup.mjs") "${HostAlias}:$RunnerDir/scripts/firebase-live-backup.mjs"

ssh -o BatchMode=yes $HostAlias "cd $RunnerDir && chmod 600 .env.local .env.backup.local .env.live.local && chmod +x run-backup.sh run-live-backup.sh && npm install --omit=dev && printf '%s' '$cronB64' | base64 -d > /tmp/edupanel.cron && crontab /tmp/edupanel.cron && rm -f /tmp/edupanel.cron && /usr/bin/pm2 startOrReload ecosystem.config.cjs --update-env && /usr/bin/pm2 save"

# Refuerza el cron con printf remoto. Evita que una tabla cron previamente
# corrupta vuelva a quedar con entradas pegadas.
ssh -o BatchMode=yes $HostAlias "printf '%s\n' '0 3 * * 0 cd ~/kt-logss && node backup-supabase.js >> ~/kt-logss/backup.log 2>&1' '0 * * * * $RunnerDir/run-backup.sh scheduled-hourly >> $RunnerDir/logs/cron.log 2>&1' '@reboot cd $RunnerDir && /usr/bin/pm2 startOrReload ecosystem.config.cjs --update-env >> $RunnerDir/logs/pm2-reboot.log 2>&1' | crontab -"

if ($DisableWindowsTask) {
  Disable-ScheduledTask -TaskName "EduPanel Firestore Backup" -ErrorAction SilentlyContinue | Out-Null
}

Remove-Item -LiteralPath $stage -Recurse -Force

Write-Host "Runner Ubuntu desplegado en $HostAlias"
Write-Host "Runner: $RunnerDir"
Write-Host "Backups: $BackupDir"
Write-Host "Live backups: $LiveBackupDir"
Write-Host "Cron: 0 * * * * $RunnerDir/run-backup.sh scheduled-hourly"
Write-Host "PM2: edupanel-firebase-live-backup"
