#!/usr/bin/env bash
# 每日碳排放計算器 - Git 初始化與 GitHub 推送腳本 (Bash / Linux / Mac)
# 使用方式: ./setup_git.sh "https://github.com/YOUR_USERNAME/daily-carbon-calculator.git"

REPO_URL=$1

echo "=========================================================="
echo " 🚀 每日碳排放計算器 Git 初始化與 GitHub 部署腳本"
echo "=========================================================="

# 1. 檢查並初始化 Git
if [ ! -d ".git" ]; then
    echo "[1/4] 正在初始化 Git 數據庫..."
    git init
    git branch -M main
else
    echo "[1/4] Git 數據庫已存在。"
fi

# 2. 加入所有檔案
echo "[2/4] 正在將檔案加入 Git 暫存區..."
git add .

# 3. 建立首次 Commit
echo "[3/4] 正在建立 Commit..."
git commit -m "feat: 🌿 initialize daily carbon footprint calculator & data pipeline"

# 4. 連結 GitHub 遠端與推送
if [ -n "$REPO_URL" ]; then
    echo "[4/4] 正在連結 GitHub 遠端倉庫: $REPO_URL"
    git remote remove origin 2>/dev/null || true
    git remote add origin "$REPO_URL"
    echo "🚀 正在推送到 GitHub 主分支 (main)..."
    git push -u origin main
    echo "✅ 成功推送到 GitHub！"
else
    echo ""
    echo "⚠️ 未傳入遠端倉庫網址。您可以手動執行以下命令推送到 GitHub："
    echo "   git remote add origin https://github.com/YOUR_USERNAME/daily-carbon-calculator.git"
    echo "   git push -u origin main"
    echo ""
fi

echo "=========================================================="
