# cards 后端（对局记录 + 静态站点）

与主站同源部署：`https://shenjack.top/cards/` 提供游戏，`https://shenjack.top/api/cards/*` 提供接口。

## 1. 依赖与启动

```bash
pip install -r requirements.txt
export CARDS_SECRET="换成随机长字符串"
export DATABASE_PATH=/var/lib/cards/cards.sqlite3
export DIST_DIR=/var/www/namerena-cards/dist
python app.py            # 开发
gunicorn -w 2 -b 127.0.0.1:8800 app:app   # 生产
```

首次启动会自动建表（见 `schema.sql`）。

## 2. 登录如何延续

本服务**不解析主站 cookie**，而是把浏览器的 `Cookie` 头转发给主站的
`PLATFORM_SESSION`（默认 `https://shenjack.top/api/cards/session`），
拿到 `teamname` 作为用户身份。因此：

- 必须同源部署（`/cards/` 与 `/api/cards/` 同一 host:port），否则浏览器不会带主站 cookie；
- 主站未登录 → 本服务 `logged_in:false`，前端隐藏徽标、不发写请求。

如果维护者更愿意给一个内部校验接口，只需改 `PLATFORM_SESSION` 指向它，
返回体保持 `{"logged_in": true, "teamname": "..."}` 即可。

## 3. 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cards/session` | 登录态、CSRF、战绩；永远 200 |
| POST | `/api/cards/runs` | 开一局，返回 `run_id`；旧 active 自动变 abandoned |
| POST | `/api/cards/runs/<id>/finish` | 结算，幂等（重复调用 `already:true`） |

错误统一 `{"ok": false, "error": {"code", "message"}}`；
限流读 120/分、写 60/分（按 IP），触发时 429 + `Retry-After`。

CSRF：`/session` 下发 `csrf_token`，POST 放 `X-CSRFToken` 头；
token 绑定用户并带一小时时间片，过期返回 `csrf_failed`，前端会刷新后重试一次。

## 4. 行为约定

- 同一玩家同时只保留一局 `active`：开新局把旧的置为 `abandoned`；
- `finish` 只统计一次，重复调用返回 `already:true` 且不重复计数；
- `layers` 传「已通过层数」（第 3 层失败 → 2），通关传 10；
- 游客（未登录）可以玩，服务端拒绝写入并返回 401。

## 5. 自测

```bash
python smoke_test.py     # 用 AUTH_MODE=dev + X-Debug-Team 跑一遍主流程
```

覆盖：未登录 401、缺 CSRF 400、开两局、结算幂等、他人 run、非法组别、静态页、通关。

## 6. 上线前检查

- [ ] `CARDS_SECRET` 已换成随机值，未写进仓库
- [ ] `DATABASE_PATH` 指向持久化目录，且有备份
- [ ] nginx 的 `/cards/` 与 `/api/cards/` 在同一 server 块
- [ ] `DIST_DIR` 指向 `npm run build:site` 的产物
- [ ] 在 `/cards/` 下登录后，徽标显示「已登录 <战队名>」
