param(
  [string]$TaskName = "EduPanel Firestore Backup",
  [string]$At = "03:00",
  [switch]$Remote,
  [string]$ProjectRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
} else {
  $ProjectRoot = (Resolve-Path $ProjectRoot).Path
}

$nodeCommand = Get-Command node -ErrorAction Stop
$nodePath = $nodeCommand.Source
$backupScript = Join-Path $ProjectRoot "scripts\firestore-backup.mjs"

if (!(Test-Path $backupScript)) {
  throw "No se encontro $backupScript"
}

$nodeArgs = "`"$backupScript`""
if ($Remote) {
  $nodeArgs = "$nodeArgs --remote"
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument $nodeArgs -WorkingDirectory $ProjectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At $At
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$description = "Backup diario de Firestore para EduPanel. Carpeta local: backups\firestore. Remote=$($Remote.IsPresent)"

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description $description `
  -Force | Out-Null

Write-Host "Tarea programada creada/actualizada: $TaskName"
Write-Host "Hora diaria: $At"
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Remoto habilitado: $($Remote.IsPresent)"
