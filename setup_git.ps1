# 每日碳排放計算器 - Git 初始化與 GitHub 推送腳本 (PowerShell)
# 使用方式: .\setup_git.ps1 -RepoUrl "https://github.com/YOUR_USERNAME/daily-carbon-calculator.git"

param (
    [Parameter(Mandatory=$false)]
    [string]$RepoUrl = ""
)

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " 🚀 每日碳排放計算器 Git 初始化與 GitHub 部署腳本" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

# 1. 檢查並初始化 Git
if (-not (Test-Path ".git")) {
    Write-Host "[1/4] 正在初始化 Git 數據庫..." -ForegroundColor Yellow
    git init
    git branch -M main
} else {
    Write-Host "[1/4] Git 數據庫已存在。" -ForegroundColor Cyan
}

# 2. 加入所有變動檔
Write-Host "[2/4] 正在加入檔案至 Git 暫存區..." -ForegroundColor Yellow
git add .

# 3. 建立首次 Commit
Write-Host "[3/4] 正在建立 Commit 紀錄..." -ForegroundColor Yellow
git commit -m "feat: 🌿 initialize daily carbon footprint calculator & data pipeline"

# 4. 連結 GitHub 遠端倉庫並推送到 main
if ($RepoUrl -ne "") {
    Write-Host "[4/4] 正在設定 GitHub 遠端倉庫: $RepoUrl" -ForegroundColor Yellow
    git remote remove origin 2>$null
    git remote add origin $RepoUrl
    Write-Host "🚀 正在推送到 GitHub 主分支 (main)..." -ForegroundColor Yellow
    git push -u origin main
    Write-Host "✅ 成功推送到 GitHub！" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ 未提供 -RepoUrl 參數。您可以執行以下指令推送到您的 GitHub:" -ForegroundColor Yellow
    Write-Host "   git remote add origin https://github.com/YOUR_USERNAME/daily-carbon-calculator.git" -ForegroundColor White
    Write-Host "   git push -u origin main`n" -ForegroundColor White
}

Write-Host "==========================================================" -ForegroundColor Green
