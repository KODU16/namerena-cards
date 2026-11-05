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

## 多人大逃杀

需要 Node.js 18 或更新版本。先在仓库根目录执行 `npm run build:site`，构建会同时生成 `server/generated/arena-runtime.mjs` 和标准 WASM；不能只复制 dist。Python 后端第一次处理多人请求时自动启动本机 Node/WASM 服务，多个 gunicorn worker 共用它。

内部服务仅监听 127.0.0.1，默认端口 8801，可用 ARENA_RUNTIME_PORT 修改；NODE_BINARY 可指定 Node 可执行文件绝对路径。认证共用 CARDS_SECRET，所有 worker 必须使用同一值。运行账号需要启动 Node 的权限。服务重启后会从 SQLite 保存的指令恢复战斗一次，正常出牌仅在原会话上增量推进。

入口是首页“多人 · 大逃杀”。2～12 个已登录战队加入同一房间，房主开始；服务器生成独立角色、手牌、商店和地图，不能带入单人存档。普通 AI 完全复用 cards 试炼的随机 @! 构建。每 90 秒扩大危险区，每 10 秒扣除危险区内角色生命。移动、搜索、药水、补给站购买及同区域玩家交战均由服务端验证。

每次出牌限 10 秒，超时随机打出一张当时可用的手牌，普通攻击始终可用；刷新、重新登录和所有人离线都不会延长期限，下一次请求按时间顺序追算。对手与旁观者无法读取当前玩家手牌。最后存活者正常结算；其局内天梯分数严格超过 cards 抓取的 1A 榜首时显示金色胜利。结束时重新抓取，网络失败回退仓库快照并在结果中说明。

接口：GET /api/cards/arena/rooms（大厅）、POST 同路径（创建）、GET /api/cards/arena/rooms/<房间号>（同步）、POST /api/cards/arena/rooms/<房间号>/actions（操作）。写操作均需登录、CSRF 和唯一 action_id，重复购买不会重复扣款。房间及成员表自动建立，位于同一 DATABASE_PATH 数据库。

验证：`python server/arena_smoke_test.py`（从仓库根目录运行，真实双账号、SQLite、WASM、超时与断线恢复）；`node tools/verify-arena-ui.mjs` 需另一个终端先运行 `python server/arena_ui_test_server.py`（仅绑定 127.0.0.1:8817，临时数据库与测试专用路由）；通过 CARDS_VIEWPORT_WIDTH/HEIGHT 可检查手机布局。测试服务不可作为生产入口。
