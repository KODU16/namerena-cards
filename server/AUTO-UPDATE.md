# 让 `/cards/` 自动跟随最新版 + 存档跨设备

> 面向：服务器管理员
> 目标：`https://shenjack.top:10007/cards/` **不再需要有人手动推一次**，
> 而是自动跟随 `KODU16/namerena-cards` 的 `main`；
> 同时让「存档」写进账号，换设备能读回。

---

## 一、自动跟随（二选一，推荐 A）

### 方案 A：服务器定时拉取（不依赖 GitHub 访问服务器）

适用：服务器不能/不想对 GitHub 开 SSH，但自己能 `git clone`。

```bash
# 一次性：把仓库放到部署目录（用部署账号）
sudo mkdir -p /srv/namerena-cards && sudo chown "$USER" /srv/namerena-cards
git clone --depth=1 https://github.com/KODU16/namerena-cards.git /srv/namerena-cards

# 一次性：装定时器（默认每 2 分钟拉一次）
sudo cp /srv/namerena-cards/server/cards-pull.service /etc/systemd/system/
sudo cp /srv/namerena-cards/server/cards-pull.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cards-pull.timer
```

`server/deploy.sh` 每次执行的动作：

```text
git reset --hard origin/main
npm ci
npm run build:site          # 产出 dist/
systemctl reload-or-restart cards-backend   # 后端代码变了才需要
```

**还要把 nginx 的 `/cards/` 指向新产物**（这是关键的一步，很多人漏掉）：

```nginx
location /cards/ {
    alias /srv/namerena-cards/dist/;
    index index.html;
    try_files $uri $uri/ /cards/index.html;
    add_header Cache-Control "no-cache";
}
```

> 如果 `/cards/` 现在是「手动拷一份文件」的位置（例如 `/var/www/.../cards`），
> 请改成指向上面的 `dist/`，否则拉取了也不会生效。

想要更实时：把 `cards-pull.timer` 里的 `OnUnitActiveSec=2min` 改成 `30s`。

### 方案 B：GitHub Actions 直推（延迟约 1 分钟）

适用：愿意给一个 SSH 部署账号。

仓库已带 `.github/workflows/deploy-cards.yml`，只需在
`Settings → Secrets and variables → Actions` 填：

| Secret | 值 |
| --- | --- |
| `CARDS_DEPLOY_HOST` | 服务器地址 |
| `CARDS_DEPLOY_USER` | 部署账号 |
| `CARDS_DEPLOY_KEY` | 该账号私钥 |
| `CARDS_DEPLOY_PATH` | **`/cards/` 实际对外服务的目录**（例如 `/srv/namerena-cards/dist`） |
| `CARDS_DEPLOY_PORT` | 可选，默认 22 |
| `CARDS_RELOAD_CMD` | 可选，默认 `sudo systemctl reload-or-restart cards-backend` |

填完后每次推 `main` 自动：构建 → rsync `dist/` 与 `server/` → 只有 `server/*.py` 变化时才平滑重载。

> 没填 `CARDS_DEPLOY_HOST` 时工作流只构建、不部署、不报错。

---

## 二、存档跨设备

现在的线上 `/api/cards/saves` 返回 **404**，所以前端自动退回了「本机存档」（localStorage）。
要变成账号存档，需要让这个路径有服务应答。两种做法：

### 做法 1（最小侵入，推荐）：只反代存档接口

只把 `/api/cards/saves` 交给 cards 后端，其余 `/api/cards/*`（session / runs / finish）仍由主站现有服务处理：

```nginx
location /api/cards/saves {
    proxy_pass http://127.0.0.1:8800;
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

然后起 cards 后端（它只负责存档，登录校验靠转发 Cookie 给主站）：

```bash
cd /srv/namerena-cards/server
pip install -r requirements.txt
CARDS_SECRET=<随机串> \
DATABASE_PATH=/var/lib/cards/cards.sqlite3 \
PLATFORM_SESSION=https://shenjack.top:10007/api/cards/session \
DIST_DIR=/srv/namerena-cards/dist \
gunicorn -w 2 -b 127.0.0.1:8800 app:app
```

**为什么这样能工作**：前端打开存档面板时先 `GET /api/cards/saves`，
后端返回它自己签的 `csrf_token`，后续 PUT/DELETE 用这个 token，不会和主站的 CSRF 打架。

### 做法 2：由主站实现存档接口

如果更希望在主站代码里做，按 `server/README.md` 的契约加 4 个接口即可：

```text
GET    /api/cards/saves          列表
GET    /api/cards/saves/<slot>   读取
PUT    /api/cards/saves/<slot>   保存（payload ≤ 300 KB）
DELETE /api/cards/saves/<slot>   删除
```

表结构见 `server/schema.sql` 里的 `cards_slot`，主键 `(user_key, slot)`，
槽位固定 1–10（越界返回 400）。

---

## 三、验收

```bash
# 1. 自动更新是否生效
curl -s https://shenjack.top:10007/cards/ | grep -oE 'js/main-[^"]+\.js'
#   记下哈希 → 等一个拉取周期（或 push 一次）→ 再查，哈希应变化

# 2. 存档接口是否上线
curl -s -o /dev/null -w '%{http_code}\n' https://shenjack.top:10007/api/cards/saves
#   期望 200（未登录时返回 {"ok":true,"logged_in":false,...}，也是 200）

# 3. 浏览器
#   登录后打开 /cards/ → 首页中间按钮「选择存档」→ 面板顶部应写
#   「存档保存在账号里，换设备也能读。」而不是「本机存档」
```

- [ ] 第 1 步哈希会自动变化（无需人工推送）
- [ ] 第 2 步返回 200 且带 `logged_in` 字段
- [ ] 第 3 步面板文案是「账号」而不是「本机」
- [ ] 在另一台设备/无痕窗口登录同一账号，能读到同一槽位

---

## 四、回滚

```bash
cd /srv/namerena-cards
git log --oneline -5
git reset --hard <上一个可用 commit>
npm run build:site
sudo systemctl reload cards-backend   # 只有后端代码回滚才需要
```

- 存档数据在 `DATABASE_PATH`（默认 `/var/lib/cards/cards.sqlite3`），**不在仓库里**，回滚代码不会丢档；
- 停用自动更新：`sudo systemctl disable --now cards-pull.timer`（方案 A）
  或删掉仓库 Secrets 里的 `CARDS_DEPLOY_HOST`（方案 B）。
