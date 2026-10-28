# 部署到 GitHub Pages

## 压缩发布

先运行 `npm ci` 和 `npm run build:site`，再把生成的 `dist/` 内容作为 Pages 的发布根目录。若使用 GitHub Actions，上传 Pages artifact 的 `path` 应指向 `dist`；若使用分支发布，将 `dist/` 内容同步到所选发布分支的根目录。不要把开发源码直接覆盖成压缩文件。

`dist/` 可用 `python -m http.server 8123 --directory dist` 本地预览，支持仓库子路径。体积与兼容性说明见 [流量与压缩发布](bandwidth.md)。

本仓库通过 `.github/workflows/pages.yml` 自动构建发布；Pages 来源应设置为 GitHub Actions。


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

- Source: `GitHub Actions`
- 工作流：`.github/workflows/pages.yml`，推送 `main` 或手动运行时构建并发布 `dist/`
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
