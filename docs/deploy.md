# 部署到 GitHub Pages

## 1. 推仓库

```powershell
cd "C:\Program Files (x86)\360\360PT\namerena-ladder\namerena-cards"
git init
git add .
git commit -m "namerena cards: static card game on tswn-core"
git branch -M main
git remote add origin https://github.com/<you>/namerena-cards.git
git push -u origin main
```

仓库里已经带了 `.nojekyll`，Jekyll 不会动 `vendor/` 这类目录。

## 2. 开 Pages

GitHub → 仓库 **Settings → Pages**：

- Source: `Deploy from a branch`
- Branch: `main`，目录 `/ (root)`
- 保存后等 Actions 跑完，地址是 `https://<you>.github.io/namerena-cards/`

打开后应当是首页；如果显示 404，检查是否把项目放在子目录（所有资源都是相对路径，子目录部署是支持的）。

## 3. 天梯数据为什么会“过期”

页面启动时会先尝试 `fetch('https://shenjack.top:10007/')` 实时抓取，**失败就退回 `data/ladder.json`**。

失败是常态：对方站点没有 `Access-Control-Allow-Origin`，浏览器会以 CORS 拒绝，控制台会留一条红色的跨域报错——这是预期行为，不影响游戏。

因此快照需要定期刷新，三选一：

### 手动

```powershell
node tools/fetch-ladder.mjs
git add data/ladder.json && git commit -m "refresh ladder" && git push
```

### 定时 Action（推荐）

`.github/workflows/ladder.yml` 已经写好，默认每天 UTC 03:00 跑一次 `fetch-ladder.mjs`，有变化就自动提交。

需要的话在仓库 **Settings → Actions → General** 把 `Workflow permissions` 设为 *Read and write permissions*。

### 以后想真·实时

只有两条路：

1. 让 `shenjack.top` 加 `Access-Control-Allow-Origin: https://<you>.github.io`；
2. 自己加一个小小的代理（Cloudflare Worker / Vercel Function），页面改成请求代理。

在那之前，快照 + 定时刷新是最稳的“纯静态”方案。

## 4. 自定义域名

在 `Pages` 里填 Custom domain，并在仓库根放一个 `CNAME` 文件（内容为域名）。DNS 加一条 CNAME 指向 `<you>.github.io`。

## 5. 本地预览

```powershell
python -m http.server 8080
```

不要用 `file://` 打开：ES Module + `fetch` 读 wasm 都会被浏览器安全策略拦掉。
