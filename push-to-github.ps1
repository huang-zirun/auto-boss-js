# Link to GitHub and push (run in project root: .\push-to-github.ps1)

$ErrorActionPreference = "Stop"
$repoRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }

Set-Location $repoRoot
Write-Host "Working dir: $repoRoot" -ForegroundColor Cyan

if (-not (Test-Path .git)) {
    Write-Host "Init git repo..." -ForegroundColor Yellow
    git init
}

$remote = "origin"
$url = "https://github.com/huang-zirun/auto-boss-js.git"
$remotes = @((git remote 2>$null) -split "`n" | ForEach-Object { $_.Trim() })
$hasOrigin = $remotes -contains "origin"
if ($hasOrigin) {
    git remote set-url $remote $url
    Write-Host "Remote updated: $url" -ForegroundColor Yellow
} else {
    git remote add $remote $url
    Write-Host "Remote added: $url" -ForegroundColor Green
}

Write-Host "Adding all files..." -ForegroundColor Yellow
git add .
$status = git status --short
if (-not $status) {
    $commit = git log -1 --oneline 2>$null
    if ($commit) {
        Write-Host "Working tree clean, pushing..." -ForegroundColor Yellow
    } else {
        Write-Host "Nothing to commit and no history. Add files first." -ForegroundColor Red
        exit 1
    }
} else {
    git commit -m "Initial commit: auto-boss"
    Write-Host "Committed." -ForegroundColor Green
}

git branch -M main
Write-Host "Pushing to origin main..." -ForegroundColor Yellow
git push -u origin main
Write-Host "Done." -ForegroundColor Green
