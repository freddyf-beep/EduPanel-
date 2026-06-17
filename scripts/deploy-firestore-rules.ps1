param(
  [switch]$Yes
)

$ErrorActionPreference = "Stop"

Write-Host "EduPanel Firestore rules deploy"
Write-Host "This deploys firestore.rules to the Firebase project selected by the Firebase CLI."
Write-Host ""

if (-not (Get-Command firebase -ErrorAction SilentlyContinue)) {
  throw "Firebase CLI is not installed or not in PATH. Install with: npm install -g firebase-tools"
}

firebase projects:list

if (-not $Yes) {
  $answer = Read-Host "Deploy firestore.rules now? Type DEPLOY to continue"
  if ($answer -ne "DEPLOY") {
    Write-Host "Cancelled."
    exit 0
  }
}

firebase deploy --only firestore:rules
