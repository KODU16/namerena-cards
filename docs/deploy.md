# 部署到主站 /cards/

正式地址：[名竞尖塔](https://shenjack.top:10007/cards/)。服务器已配置自动拉取本仓库的 `main` 分支并构建发布；提交推送后检查主站是否加载对应的新资源指纹。

## 构建与发布

```powershell
npm ci
npm run build:site
```

构建使用 `tools/build-icons.mjs` 将 `assets/icons32/` 下的 71 张独立 32×32 图标合并为共享调色板图集，再将压缩运行资源输出到 `dist/`。开发源码、独立图标文件和高清原稿不作为运行资源发布。

服务器更新方式与管理员检查项见 [自动更新](../server/AUTO-UPDATE.md) 和 [部署检查](../server/DEPLOY-CHECK.md)。服务器定时拉取是当前正式发布方式；GitHub Actions 的 `deploy-cards.yml` 也能构建，并在配置部署密钥时通过 SSH 上传。

未配置部署密钥时，该工作流成功仅表示构建完成，不能作为服务器已更新的依据。发布后需核对主站页面、JS/CSS 指纹及新图标资源。

## 同源账号与存档

`/cards/` 与 `/api/cards/` 必须保持相同协议、域名和端口，以便复用主站登录及账号存档。不要把正式发布切回 GitHub Pages。

## 本地预览

```powershell
python -m http.server 8123 --directory dist
```

GitHub Pages 工作流仅保留手动触发，用于需要时发布独立演示；推送 `main` 不再自动部署旧站。
