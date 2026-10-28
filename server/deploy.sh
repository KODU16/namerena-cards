#!/usr/bin/env bash
# 服务器端一键更新：拉最新 main -> 构建 dist -> 重启后端
# 用法：APP_DIR=/srv/namerena-cards ./deploy.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/srv/namerena-cards}"
SERVICE="${SERVICE:-cards-backend}"

cd "$APP_DIR"
echo "[deploy] pull main"
git fetch --depth=1 origin main
git reset --hard origin/main

echo "[deploy] build"
if [ ! -d node_modules ]; then npm ci; else npm ci; fi
npm run build:site

echo "[deploy] restart $SERVICE"
if command -v systemctl >/dev/null 2>&1; then
  sudo systemctl restart "$SERVICE"
else
  pkill -f "gunicorn.*app:app" || true
  (cd server && nohup gunicorn -w 2 -b 127.0.0.1:8800 app:app >/var/log/cards-backend.log 2>&1 &)
fi

echo "[deploy] done at $(date -Iseconds)"
