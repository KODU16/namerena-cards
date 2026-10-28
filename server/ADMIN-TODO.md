# 上线对接：需要 shenjack 管理员配合的事项

> 目标：把 `KODU16/namerena-cards` 部署到 `https://shenjack.top/cards/`，
> 并让游戏把自己的对局记录写进**同源的自有后端**（`/api/cards/*`）。
>
> 我们不需要主站改任何业务代码，只需要下面这些**部署层面的配合**。

---

## 一、需要做的事（按顺序，1~4 做完即可跑通）

### 1. 加两个 nginx location

**必须在 `shenjack.top` 的同一个 `server` 块里**，否则浏览器不会带主站 cookie，登录态拿不到。

```nginx
location /cards/ {
    proxy_pass http://127.0.0.1:8800;
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

location /api/cards/ {
    proxy_pass http://127.0.0.1:8800;
    proxy_set_header Host $host;
    proxy_set_header Cookie $http_cookie;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;   # 注意：见下方第 6 条
    proxy_read_timeout 15s;
}
```

### 2. 让后端进程跑起来

```bash
cd /srv/namerena-cards/server
pip install -r requirements.txt

export CARDS_SECRET="<随机长字符串>"          # 只放环境变量，不要提交到仓库
export DATABASE_PATH=/var/lib/cards/cards.sqlite3
export DIST_DIR=/srv/namerena-cards/dist

gunicorn -w 2 -b 127.0.0.1:8800 app:app
```

首次启动会自动建表（`server/schema.sql`，幂等）。

需要确认的三件事：

- [ ] 用 systemd 还是你现有的进程托管方式？
- [ ] `DATABASE_PATH` 放哪个持久化目录（需要备份）？
- [ ] `8800` 端口是否可用（不行就给一个空闲端口，我们改一行配置）？

### 3. 确认会话校验接口可用

我们的后端**不解析主站 cookie**，而是把浏览器带来的 `Cookie` 头转发给：

```text
https://shenjack.top/api/cards/session
```

只读取两个字段：

```json
{"logged_in": true, "teamname": "战队名"}
```

- [ ] 这个接口对同机请求可用，且 `Cookie` 里就带登录态？
- [ ] 如果更希望用内部接口（例如 `/internal/whoami`），把地址给我们，只需改环境变量 `PLATFORM_SESSION`。

### 4. 确认会话 cookie 的 Path

如果登录 cookie 的 `Path` 是 `/api/` 之类的窄范围，`/cards/` 与 `/api/cards/` 都收不到。

- [ ] 会话 cookie 的 `Path=/`（或至少覆盖 `/cards/`、`/api/cards/`）

---

## 二、后续维护相关

### 5. 构建产物如何更新

```text
/srv/namerena-cards/dist      ← 仓库里 `npm run build:site` 的产物
```

- [ ] 给我们一个更新方式（rsync 账号 / CI 触发 / 你手动拉），否则每次改版都要经你手。
- [ ] 站点是纯静态：`index.html`、`js/main-<hash>.js`、`css/style-<hash>.css`、`assets/`、`vendor/`、`data/`。

### 6. 反向代理的注意事项

- [ ] 若前面有 CDN / WAF：请透传 `X-Forwarded-For`，我们的限流按 IP 统计，传丢了会变成所有人共用一个桶；
- [ ] 若 WAF 有路径白名单：放行 `/cards/` 与 `/api/cards/`；
- [ ] 上传体积很小（JSON，`team_json` ≤ 4000 字节），无需调大 `client_max_body_size`。

---

## 三、我们这边已经完成的部分（供核对）

| 项目 | 状态 |
| --- | --- |
| 前端适配器 `js/player-data.js` | 已有；只在 `*.shenjack.top` 启用，其它域完全静默 |
| 四个钩子 | 启动 / 开局 / 战败 / 通关 |
| 后端 `server/app.py` | `GET /session`、`POST /runs`、`POST /runs/<id>/finish` |
| 数据表 | `cards_run`，一局一行，见 `server/schema.sql` |
| CSRF | 无状态 HMAC，绑定用户 + 一小时时间片；`csrf_failed` 时前端自动刷新重试一次 |
| 限流 | 读 120/分、写 60/分，超限 `429` + `Retry-After` |
| 幂等 | 重复 `finish` 返回 `already:true`，不重复计数 |
| 语义 | 开新局把旧 `active` 置为 `abandoned`；`layers` 传“已通过层数”，通关传 10 |

自测脚本：`python server/smoke_test.py`（用 `AUTH_MODE=dev` 模拟登录，覆盖未登录、缺 CSRF、连开两局、幂等、他人 run、非法组别、静态页、通关）。

---

## 四、验收清单（上线后逐条打勾）

- [ ] 未登录打开 `https://shenjack.top/cards/`：游戏可玩，左下角显示「未登录 · 成绩不记录」，控制台没有 POST 请求
- [ ] 用测试账号登录后刷新：徽标显示「已登录 <战队名> · N 局 / 胜 N / 最佳 N」
- [ ] 开一局：`cards_run` 新增一行 `active`
- [ ] 再开一局：上一行变 `abandoned`
- [ ] 打输并结算：`status=lost`，`layers=已通过层数`（第 3 层失败 → 2）
- [ ] 通关：`status=won`，`layers=10`
- [ ] 同一局重复 finish：返回 `already:true`，统计不重复
- [ ] 清 cookie 后 POST：返回 `csrf_failed`，前端自动刷新 session 后成功
- [ ] 从 GitHub Pages 打开：无报错、无写请求、无徽标

---

## 五、需要你提供的信息

1. 进程托管方式 + 端口；
2. `DATABASE_PATH` 目录；
3. 会话校验接口地址（若沿用默认则无需提供）；
4. 测试账号 `cards-dev` 的密码；
5. dist 的更新方式（rsync 账号 / CI / 手动）。

---

## 六、自动部署（让「本地推送 → 线上生效」无需人工）

仓库里已经内置两条可选通路，管理员挑一条启用即可。

### 通路 A：GitHub Actions 直推（延迟 ≈ 1 分钟，推荐）

仓库新增 `.github/workflows/deploy-cards.yml`：推 `main` 后自动 `npm run build:site`，
再用 rsync 把 `dist/` 与 `server/` 推到服务器，最后执行重启命令。

管理员需要提供：

- [ ] 一个可 `ssh` 的部署账号（只需对 `/srv/namerena-cards` 有写权限 + 重启服务的 sudo）；
- [ ] 它的私钥（我们这边填到仓库 Secrets）；
- [ ] 服务器地址、端口、部署路径；
- [ ] 重启命令（默认 `sudo systemctl restart cards-backend`）。

仓库 Secrets 需要填：`CARDS_DEPLOY_HOST`、`CARDS_DEPLOY_USER`、`CARDS_DEPLOY_KEY`、
`CARDS_DEPLOY_PORT`（可选）、`CARDS_DEPLOY_PATH`、`CARDS_RESTART_CMD`（可选）。
没填 `CARDS_DEPLOY_HOST` 时该工作流只构建不部署，不会报错。

### 通路 B：服务器定时拉取（不给 SSH，延迟可调到 30 秒）

服务器上装好 `server/cards-pull.timer`（默认每 2 分钟）：

```bash
sudo cp server/cards-pull.service server/cards-pull.timer /etc/systemd/system/
sudo systemctl enable --now cards-pull.timer
```

`server/deploy.sh` 会做：`git reset --hard origin/main` → `npm ci` → `npm run build:site` →
`systemctl restart cards-backend`。把 timer 里的 `OnUnitActiveSec` 改成 `30s` 即可做到近实时。

要求：服务器上要有 `git`、`node`、`npm`，且 `/srv/namerena-cards` 是仓库的 clone。

### 通路 C：Webhook（可选）

`POST /api/cards/_deploy`，请求头 `X-Deploy-Secret: <DEPLOY_SECRET>`，服务端执行
`server/deploy.sh` 并立即返回。未设置 `DEPLOY_SECRET` 时该接口一律 404。

适合「本地推 → 手动或脚本打一发」的场景：

```bash
curl -X POST https://shenjack.top/api/cards/_deploy -H "X-Deploy-Secret: $SECRET"
```