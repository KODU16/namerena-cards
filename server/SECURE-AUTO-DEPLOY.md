# Cards 安全自动拉取与按需重建

本仓库可以保存**加密后的**部署配置，但绝不能提交 age 私钥、SSH 私钥、Webhook 密钥或明文 `.env`。目标服务器保管解密私钥；仓库只保留密文和公开接收者信息。

## 适用范围

正式站由 `cards-pull.timer` 周期性拉取 `main`。每次检查只在 Cards 的运行输入发生变化时才执行 `npm run build:site` 和 `cards-backend` 重启：

- 触发重建：`js/`、`css/`、`index.html`、`data/`、`assets/`、`vendor/`、`server/`、`tools/`、`package.json`、`package-lock.json`；
- 不触发重建：`README.md`、`docs/`、`.github/` 等说明性变更。

仓库目前的 `server/deploy.sh` 会在每次定时运行时重建。启用本方案前，应将它改为先比较 `HEAD` 与 `origin/main` 的上述路径；没有匹配文件时只更新工作树并退出。不要仅凭提交是否变化就重启后端。

## 推荐密钥分层

1. **仓库**：提交 `secrets/cards-production.env.enc`，使用 [SOPS](https://github.com/getsops/sops) + age 加密；可安全随代码版本管理。
2. **正式服务器**：仅在 `/etc/namerena-cards/age.key` 保存 age 私钥，权限为 `root:cards`、`0640`；该文件永不进入 Git、备份包或日志。
3. **服务器部署账号**：仓库拉取使用的 Git 凭据也只存服务器，不写入密文文件。推荐 deploy key 或 GitHub App 的只读凭据。
4. **GitHub Actions**：若以后选择 Actions 直推，SSH 私钥仍应放 GitHub Secrets，而不是仓库密文；不要同时启用两条会写同一目录的发布通路。

## 初始化一次

在管理员受控机器生成 age 密钥，私钥只复制到正式服务器：

```bash
age-keygen -o age.key
age-keygen -y age.key
```

将输出的公钥写入仓库根目录 `.sops.yaml` 的 `age` 接收者配置，例如：

```yaml
creation_rules:
  - path_regex: secrets/.*\.enc\.env$
    age: age1replace_with_the_production_server_public_key
```

随后在本地创建并加密配置：

```bash
mkdir -p secrets
sops --age '<服务器 age 公钥>' secrets/cards-production.env.enc
git add .sops.yaml secrets/cards-production.env.enc
git commit -m "chore: 加入 cards 生产部署密文"
```

密文中只放运行时需要的变量，例如 `DEPLOY_SECRET`、`CARDS_SECRET`、`PLATFORM_SESSION`。不要放 GitHub token、SSH 私钥或数据库文件。

在正式服务器安装 `sops` 与 `age` 后：

```bash
sudo install -d -m 0750 -o root -g cards /etc/namerena-cards
sudo install -m 0640 -o root -g cards age.key /etc/namerena-cards/age.key
```

解密应写入 `/run/namerena-cards/cards.env`（tmpfs），由 `cards-backend.service` 的 `EnvironmentFile=` 读取；不得解密到仓库工作目录。服务启动或重启前，由 root 权限的预启动脚本执行：

```bash
sops --decrypt --age /etc/namerena-cards/age.key \
  /srv/namerena-cards/secrets/cards-production.env.enc \
  > /run/namerena-cards/cards.env
chmod 0640 /run/namerena-cards/cards.env
chown root:cards /run/namerena-cards/cards.env
```

## 定时拉取的正确状态检查

每次 timer 运行应遵循以下顺序：

1. `git fetch --depth=1 origin main`；
2. 取 `git diff --name-only HEAD origin/main`；
3. 无差异则退出；只有非 Cards 运行文件变更时，`git reset --hard origin/main` 后退出；
4. 存在 Cards 运行文件变更时，`git reset --hard origin/main`、解密运行配置、构建 `dist`、重启 `cards-backend`；
5. 将执行的提交 SHA、命中文件和结果写入 journald，禁止输出任何环境变量值。

完成后用以下命令查验：

```bash
systemctl status cards-pull.timer
journalctl -u cards-pull.service -n 80 --no-pager
curl -I https://shenjack.top:10007/cards/
```

## 安全边界

- 密文泄露不会直接泄露内容，但 age 私钥泄露后必须立即轮换；
- 拥有服务器 root 权限的人能够读取运行时配置，这是服务器信任边界，SOPS 无法消除；
- 任何 Webhook 都必须校验高熵密钥并限制来源，不能把密钥写进前端、日志或 URL；
- 首次切换前保留当前可工作的 systemd 配置，并在维护窗口手动运行一次 `cards-pull.service` 验证。
