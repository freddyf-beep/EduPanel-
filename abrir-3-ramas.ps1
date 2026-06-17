# ============================================
# Script para abrir 3 ramas en 3 puertos
# ============================================
# Este script:
# 1. Guarda los cambios sin commitear en stash
# 2. Crea 3 worktrees (uno por rama)
# 3. Instala dependencias en cada uno
# 4. Abre 3 terminales con npm run dev en puertos 3000, 3001, 3002

# Detener ejecucion si hay errores
$ErrorActionPreference = "Stop"

$RepoPath = "C:\Users\fredd\OneDrive\Documentos\edupanel_local"
$WorktreeBase = "C:\Users\fredd\OneDrive\Documentos\edupanel_ramas"

# Definir las 3 ramas y sus puertos
$Branches = @(
    @{ Name = "main";                                  Port = 3000; Folder = "edupanel_main" },
    @{ Name = "feature/ver-unidad-v3-qa";              Port = 3001; Folder = "edupanel_ver-unidad-v3-qa" },
    @{ Name = "refactor/evaluaciones-shells";          Port = 3002; Folder = "edupanel_evaluaciones-shells" }
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Preparando 3 ramas en 3 puertos" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Guardar cambios sin commitear en stash
Write-Host "[1/4] Guardando cambios sin commitear en stash..." -ForegroundColor Yellow
Set-Location $RepoPath
$hasChanges = (git status --porcelain) -ne $null
if ($hasChanges) {
    git stash push -u -m "cambios sin confirmar antes de revisar ramas"
    Write-Host "  -> Cambios guardados en stash" -ForegroundColor Green
} else {
    Write-Host "  -> No hay cambios sin guardar" -ForegroundColor Green
}
Write-Host ""

# 2. Crear carpeta base para worktrees
Write-Host "[2/4] Creando carpeta para worktrees..." -ForegroundColor Yellow
if (-not (Test-Path $WorktreeBase)) {
    New-Item -ItemType Directory -Path $WorktreeBase | Out-Null
}
Set-Location $RepoPath
Write-Host "  -> $WorktreeBase" -ForegroundColor Green
Write-Host ""

# 3. Crear worktree para cada rama
Write-Host "[3/4] Creando worktrees..." -ForegroundColor Yellow
foreach ($Branch in $Branches) {
    $WorktreePath = Join-Path $WorktreeBase $Branch.Folder
    $BranchName = $Branch.Name
    $Port = $Branch.Port

    # Si la carpeta ya existe, saltar
    if (Test-Path $WorktreePath) {
        Write-Host "  -> Ya existe: $BranchName en $WorktreePath" -ForegroundColor DarkYellow
    } else {
        # Verificar si la rama existe localmente
        $branchExists = git branch --list $BranchName
        if ($branchExists) {
            git worktree add $WorktreePath $BranchName | Out-Null
            Write-Host "  -> Creado: $BranchName -> $WorktreePath" -ForegroundColor Green
        } else {
            Write-Host "  -> ERROR: La rama '$BranchName' no existe localmente" -ForegroundColor Red
            Write-Host "     Ejecuta primero: git fetch origin $BranchName" -ForegroundColor Red
        }
    }

    # Instalar dependencias si no existe node_modules
    if (Test-Path $WorktreePath) {
        $NodeModules = Join-Path $WorktreePath "node_modules"
        if (-not (Test-Path $NodeModules)) {
            Write-Host "  -> Instalando dependencias en $($Branch.Folder)..." -ForegroundColor Yellow
            Set-Location $WorktreePath
            npm install --no-audit --no-fund --silent
            Set-Location $RepoPath
        }
    }
}
Write-Host ""

# 4. Abrir terminales con npm run dev
Write-Host "[4/4] Abriendo 3 terminales con servidores..." -ForegroundColor Yellow
foreach ($Branch in $Branches) {
    $WorktreePath = Join-Path $WorktreeBase $Branch.Folder
    $Port = $Branch.Port
    $BranchName = $Branch.Name

    if (Test-Path $WorktreePath) {
        # Crear comando para esta terminal
        $Command = "cd `"$WorktreePath`" ; npm run dev -- -p $Port"

        # Abrir nueva ventana de PowerShell
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $Command

        Write-Host "  -> $BranchName -> http://localhost:$Port" -ForegroundColor Green
        Start-Sleep -Seconds 2  # Esperar entre aperturas
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Listo!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Abres estas URLs en tu navegador:" -ForegroundColor White
Write-Host "  main:                    http://localhost:3000" -ForegroundColor White
Write-Host "  ver-unidad-v3-qa:        http://localhost:3001" -ForegroundColor White
Write-Host "  evaluaciones-shells:     http://localhost:3002" -ForegroundColor White
Write-Host ""
Write-Host "Para cerrar los servidores: cierra las 3 ventanas de PowerShell" -ForegroundColor Gray
Write-Host ""
Write-Host "Para volver a tu rama con tus cambios:" -ForegroundColor Yellow
Write-Host "  git stash pop" -ForegroundColor Yellow
Write-Host ""

Read-Host "Presiona Enter para cerrar este script"
