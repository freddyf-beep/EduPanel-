param(
  [string]$TaskName = "EduPanel Firestore Backup",
  [ValidateSet("Daily", "Hourly")]
  [string]$Mode = "Daily",
  [string]$At = "",
  [int]$EveryHours = 1,
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

if ($Mode -eq "Hourly" -and $EveryHours -lt 1) {
  throw "EveryHours debe ser >= 1"
}

$nodeArgs = "`"$backupScript`" --trigger scheduled-$($Mode.ToLower())"
if ($Remote) {
  $nodeArgs = "$nodeArgs --remote"
}

$action = New-ScheduledTaskAction -Execute $nodePath -Argument $nodeArgs -WorkingDirectory $ProjectRoot

if ($Mode -eq "Hourly") {
  if ([string]::IsNullOrWhiteSpace($At)) {
    $now = Get-Date
    $startAt = Get-Date -Hour $now.Hour -Minute 0 -Second 0
    $startAt = $startAt.AddHours(1)
  } else {
    $parsedAt = [datetime]::ParseExact($At, "HH:mm", $null)
    $startAt = Get-Date -Hour $parsedAt.Hour -Minute $parsedAt.Minute -Second 0
    while ($startAt -le (Get-Date)) {
      $startAt = $startAt.AddHours($EveryHours)
    }
  }

  $trigger = New-ScheduledTaskTrigger `
    -Once `
    -At $startAt `
    -RepetitionInterval (New-TimeSpan -Hours $EveryHours) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
} else {
  $dailyAt = if ([string]::IsNullOrWhiteSpace($At)) { "03:00" } else { $At }
  $trigger = New-ScheduledTaskTrigger -Daily -At $dailyAt
}

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Backup Firestore EduPanel ($Mode). Remote=$($Remote.IsPresent)" `
  -Force | Out-Null

$task = Get-ScheduledTask -TaskName $TaskName
$info = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host "Tarea creada/actualizada: $TaskName"
Write-Host "Modo: $Mode"
if ($Mode -eq "Hourly") {
  Write-Host "Cada: $EveryHours hora(s)"
  Write-Host "Primer disparo: $startAt"
}
elseif (![string]::IsNullOrWhiteSpace($At)) {
  Write-Host "Inicio: $At"
}
Write-Host "Proyecto: $ProjectRoot"
Write-Host "Remoto habilitado: $($Remote.IsPresent)"
Write-Host "Proxima ejecucion: $($info.NextRunTime)"
Write-Host "Estado: $($task.State)"
