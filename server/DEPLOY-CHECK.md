# 部署查验清单（管理员用）

> 用途：按 `ADMIN-TODO.md` 装完之后，逐段跑一遍，确认「挂载 + 登录 + 记录 + 自动更新」都正常。
> 每段都给了命令和**预期输出**，对不上就查文末的故障对照表。
>
> 约定：`$APP=/srv/namerena-cards`，端口 `8800`，域名 `shenjack.top`，按实际替换。

---

## 0. 一次性安装是否到位

```bash
ls -d  $APP/dist $APP/server
python3 -c "import flask, gunicorn; print('deps ok')"
systemctl is-enabled cards-backend
```

预期：

```text
/srv/namerena-cards/dist
/srv/namerena-cards/server
deps ok
enabled
```

- [ ] `dist/index.html` 存在，且引用的是**带哈希**的产物（见第 3 段）

---

## 1. 后端进程

```bash
systemctl status cards-backend --no-pager | head -5
ss -ltnp | grep 8800
```

预期：

```text
Active: active (running)
LISTEN 0 ... 127.0.0.1:8800
```

直接问本机接口（绕过 nginx）：

```bash
curl -s http://127.0.0.1:8800/api/cards/session
```

预期：

```json
{"ok": true, "logged_in": false, "csrf_token": "..."}
```

- [ ] 返回 `logged_in:false`（未带 cookie 时这是正常的，不是故障）

---

## 2. nginx 路由

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://shenjack.top/cards/
curl -sS https://shenjack.top/api/cards/session
```

预期：

```text
200
{"ok": true, "logged_in": false, ...}
```

再看 cookie 会不会被带到后端：

```bash
curl -sS -D- -o /dev/null https://shenjack.top/cards/ | grep -i 'content-type\|cache-control'
```

> 关键要求：`/cards/` 与 `/api/cards/` **必须在同一个 server 块**，否则登录 cookie 到不了后端。

- [ ] 两个路径都是 200
- [ ] 会话 cookie 的 `Path=/`（浏览器 DevTools → Application → Cookies 可看）

---

## 3. 线上是不是最新版

```bash
curl -s https://shenjack.top/cards/ | grep -oE '(js|css)/[^"?]+'
```

预期（**带哈希**才算我们构建产物）：

```text
css/style-<hash>.css
js/main-<hash>.js
```

> 如果看到的是 `js/main.js`（无哈希），说明服务的是旧的源码拷贝，不是 `npm run build:site` 的 dist。

再确认版本够新：

```bash
curl -s https://shenjack.top/cards/$(curl -s https://shenjack.top/cards/ | grep -oE 'js/main-[^"]+\.js') | grep -c 'CPU：'
```

预期：`1`（≥1 即表示含“电脑节点”，是较新版本）

- [ ] 资源带哈希
- [ ] 能搜到较新版本的标记字符串

---

## 4. 自动部署链路

GitHub → Actions → `Deploy cards to shenjack.top`：

- [ ] 最近一次 run 是**绿色**
- [ ] 日志里出现 `Upload dist` / `Upload server code`（没跳过）
- [ ] 日志里没有 `未配置 CARDS_DEPLOY_HOST，跳过部署` 这行

手动触发一次验证：

- [ ] Actions → 该 workflow → `Run workflow`（main）→ 跑完后第 3 段的哈希**发生变化**

检查 Secrets 是否齐：

```text
仓库 Settings → Secrets and variables → Actions
需要：CARDS_DEPLOY_HOST / CARDS_DEPLOY_USER / CARDS_DEPLOY_KEY / CARDS_DEPLOY_PATH
可选：CARDS_DEPLOY_PORT / CARDS_RELOAD_CMD
```

- [ ] 5 个必填项都在

---

## 5. 登录与徽标（浏览器）

1. 打开 `https://shenjack.top/` 登录（普通战队账号）
2. 打开 `https://shenjack.top/cards/`

- [ ] 页面左下角显示「已登录 &lt;战队名&gt; · N 局 / 胜 N / 最佳 N」
- [ ] 未登录时（无痕窗口）显示「未登录 · 成绩不记录」，且控制台**没有** POST 请求

---

## 6. 记录是否真的落库

在未结算状态下开一局，然后查库：

```bash
sqlite3 /var/lib/cards/cards.sqlite3 \
  "select id, user_key, lane, status, wins, layers, started_at from cards_run order by id desc limit 5;"
```

预期（开一局后立刻）：

```text
5|cards-dev|1A|active|0|0|2026-10-28T15:00:00+00:00
```

再开一局，上一行应变 `abandoned`：

- [ ] 新行 `active`、旧行 `abandoned`
- [ ] 结算（输光/通关）后 `status` 变 `lost` / `won`，`layers` 分别是「已通过层数」/ `10`
- [ ] 同一局重复结算不会新增行（`already:true`）

---

## 7. 限流与错误码抽查

```bash
# 未登录写入 → 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://shenjack.top/api/cards/runs \
     -H 'Content-Type: application/json' -d '{}'

# 非法组别 → 400 invalid_lane（需登录 cookie 才有意义）
```

预期：`401`

- [ ] 未登录写入返回 401（不是 500，也不是 200）

---

## 8. 故障对照表

| 现象 | 多半原因 | 处理 |
| --- | --- | --- |
| `/cards/` 404 | nginx 没配或 `DIST_DIR` 指错 | 查 `nginx -T \| grep cards`、`ls $APP/dist` |
| `/cards/` 200 但资源 404 | dist 没推上去 / 路径被 `--delete` 清掉 | 看 Actions 的 `Upload dist` 是否成功 |
| `/api/cards/session` 502 | 后端没起或端口不一致 | `systemctl status cards-backend`、`ss -ltnp \| grep 8800` |
| 登录后仍是「未登录」 | cookie `Path` 不含 `/api/cards/`，或两个 location 不在同一 server 块 | 查 cookie `Path`；查 nginx 配置结构 |
| 徽标显示「未登录」但主站已登录 | 后端转发 Cookie 到 `PLATFORM_SESSION` 失败 | 在后端机器上 `curl -H 'Cookie: ...' <PLATFORM_SESSION>` 试试 |
| 有记录但 `user_key` 全是同一个 | `X-Forwarded-For` 没透传 / 反代 IP 归一 | 检查 nginx 是否设置 `X-Forwarded-For` |
| Actions 绿色但线上没变 | 没有 Secrets，走了「只构建」分支 | 补 Secrets 后 `Run workflow` |
| 线上是 `js/main.js`（无哈希） | 服务的是旧源码拷贝，不是 dist | 把 nginx 根目录改到 `$APP/dist` |
| 改完后端接口没生效 | 只在 `server/*.py` 变化时才重载 | 手动 `sudo systemctl reload cards-backend` |

---

## 9. 回滚

```bash
# 回滚到上一个可用版本（服务器端）
cd $APP && git log --oneline -5
git reset --hard <上一个commit> && npm run build:site && sudo systemctl reload cards-backend
```

- [ ] 回滚后第 3 段的哈希随之变化
- [ ] 数据表不受影响（`cards_run` 在 `DATABASE_PATH`，不在仓库里）

---

## 10. 签收

- [ ] 第 0~4 段（安装、进程、路由、版本、自动部署）
- [ ] 第 5~6 段（登录、记录落库）
- [ ] 第 7 段（错误码）
- [ ] 已被告知：日常改前端**不会重启进程**，只有 `server/*.py` 变化才平滑重载
