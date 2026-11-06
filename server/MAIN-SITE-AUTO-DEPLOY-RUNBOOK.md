# 主站 Cards 全自动部署交接手册

交付目标：主站管理员或其运维 Agent 完成本手册的一次性初始化后，开发者只需把 Cards 代码推送到 `main`；正式站 `https://shenjack.top:10007/cards/` 会在最多两个定时周期内拉取、构建并上线。后续不需要管理员手动 SSH、点击 GitHub Actions 或调用 Webhook。

本文采用**服务器主动拉取**，不依赖 GitHub Actions 持有服务器 SSH 私钥。仓库只保存加密配置，私钥和运行时明文只存在正式服务器。

## 0. 验收标准

全部完成后必须同时满足：

1. `cards-pull.timer` 为 `active (waiting)`，且开机自启；
2. `cards-pull.service` 能以 `cards` 用户拉取 `origin/main`；
3. 每次部署都从 SOPS 密文解密运行配置到 `/run/namerena-cards/cards.env`；
4. 只有 Cards 运行文件变化才构建和重启；文档、README、GitHub workflow 变更不重启；
5. 日志记录部署前后 SHA、命中文件和结果，不记录密钥；
6. 推送一个已审批的 Cards 小改动后，正式页面在四分钟内返回新构建指纹，且 `journalctl` 显示成功部署。

## 1. 不可跳过的安全规则

- 不得把 age 私钥、Git deploy key、`CARDS_SECRET`、`DEPLOY_SECRET`、数据库文件或明文 `.env` 提交到 Git；
- 不得将上述值粘贴进工单、聊天记录、shell 历史、journald 或浏览器 URL；
- 服务器上的 Git 凭据只允许读取 `KODU16/namerena-cards`；
- 运行 `cards-backend` 的 `cards` 用户不应拥有不受限 sudo；仅允许重启 `cards-backend` 和运行受控的部署脚本；
- 不再设置 GitHub Actions 的 `CARDS_DEPLOY_*` 写入密钥，避免与服务器主动拉取并发写同一目录。

## 2. 管理员一次性准备

以下命令以 Debian/Ubuntu 为例；执行前管理员确认目标主机就是 `shenjack.top:10007` 背后的 Cards 服务主机。

```bash
sudo useradd --system --create-home --shell /bin/bash cards 2>/dev/null || true
sudo install -d -m 0750 -o cards -g cards /srv/namerena-cards
sudo install -d -m 0750 -o root -g cards /etc/namerena-cards /run/namerena-cards
sudo install -d -m 0750 -o cards -g cards /var/lib/cards
```

安装并确认运行依赖。必须使用项目当前所需的 Node.js 版本及 Python 环境；不要把 `npm`、`sops` 或 `age` 安装到临时用户目录。

```bash
git --version
node --version
npm --version
python3 --version
sops --version
age --version
```

为 `cards` 创建仅只读仓库权限的 deploy key，再 clone：

```bash
sudo -u cards ssh-keygen -t ed25519 -f /home/cards/.ssh/id_ed25519 -N '' -C 'namerena-cards-production'
# 管理员把 /home/cards/.ssh/id_ed25519.pub 添加为 GitHub 仓库的只读 Deploy key。
sudo -u cards git clone git@github.com:KODU16/namerena-cards.git /srv/namerena-cards
sudo -u cards git -C /srv/namerena-cards remote -v
```

> 若仓库为私有仓库且 deploy key 不能访问，先修正 Git 权限；不要改用个人账号 token。

## 3. 密钥和密文配置

执行 [SECURE-AUTO-DEPLOY.md](SECURE-AUTO-DEPLOY.md) 的 SOPS + age 初始化。必须由管理员保存 age 私钥，推荐路径为：

```bash
sudo install -m 0640 -o root -g cards age.key /etc/namerena-cards/age.key
sudo rm -f age.key
```

仓库只提交 `secrets/cards-production.env.enc` 和 `.sops.yaml`。密文解开后至少包含：

```dotenv
CARDS_SECRET=<高熵随机值>
DATABASE_PATH=/var/lib/cards/cards.sqlite3
DIST_DIR=/srv/namerena-cards/dist
PLATFORM_SESSION=https://shenjack.top/api/cards/session
DEPLOY_SECRET=<高熵随机值，仅在确需 webhook 时保留>
```

不要使用仓库样例中的 `CARDS_SECRET=CHANGE_ME`。运行配置文件必须在 `/run` 生成，服务停止或机器重启后自动消失。

## 4. 让服务器 Agent 实施的仓库内改动

在首次上线前，服务器 Agent 必须在分支中实施并经代码审查合入以下行为；不要只复制本仓库当前的旧版 `deploy.sh`：

1. `server/deploy.sh` 先执行 `git fetch --depth=1 origin main`，并取得 `HEAD..origin/main` 的文件列表；
2. 只要命中下列任一运行路径，才构建并重启：`js/`、`css/`、`index.html`、`data/`、`assets/`、`vendor/`、`server/`、`tools/`、`package.json`、`package-lock.json`；
3. 无差异时立即成功退出；仅文档或 CI 文件变化时执行 `git reset --hard origin/main` 更新工作树后成功退出，不执行 `npm ci`、构建或重启；
4. 命中运行路径时：更新至 `origin/main` → 重启 `cards-decrypt-env` 解密配置 → `npm ci` → `npm run build:site` → 重启后端；
5. 每条日志必须带部署目标 SHA 与命中文件数；失败时以非零退出，让 systemd 留下失败状态；
6. 构建成功后写入 `dist/DEPLOY_REVISION`，内容为目标 Git SHA。该文件用于远程验收，不能含密钥。

Agent 应把路径匹配写成固定白名单，不能使用“任意文件变化均部署”的模糊规则。Agent 完成修改后，管理员只合入审查过的提交。

## 5. 安装 systemd 单元

先从已验证的 `main` 工作树安装单元：

```bash
sudo cp /srv/namerena-cards/server/cards-backend.service /etc/systemd/system/cards-backend.service
sudo cp /srv/namerena-cards/server/cards-pull.service /etc/systemd/system/cards-pull.service
sudo cp /srv/namerena-cards/server/cards-pull.timer /etc/systemd/system/cards-pull.timer
```

管理员必须创建一个 root 权限的 `cards-decrypt-env.service`，负责生成 `/run/namerena-cards/cards.env`。后端再通过 drop-in 依赖此服务并读取该文件：

```ini
# /etc/systemd/system/cards-decrypt-env.service
[Unit]
Description=Decrypt namerena-cards runtime configuration
Before=cards-backend.service

[Service]
Type=oneshot
User=root
ExecStart=/usr/local/sbin/cards-decrypt-env
RemainAfterExit=yes
```

```ini
# /etc/systemd/system/cards-backend.service.d/production.conf
[Unit]
Requires=cards-decrypt-env.service
After=cards-decrypt-env.service

[Service]
EnvironmentFile=/run/namerena-cards/cards.env
```

`/usr/local/sbin/cards-decrypt-env` 必须：创建 `/run/namerena-cards`、以 `sops --decrypt --age /etc/namerena-cards/age.key` 解密仓库密文、设置 `root:cards` 与 `0640` 权限。它不得 `echo` 文件内容，并在解密失败时返回非零。不要以 `ExecStartPre` 生成该文件：systemd 读取 `EnvironmentFile` 的时机不保证在该前置命令之后。

若 `cards` 无权重启后端，管理员仅授予一条 sudo 规则：

```sudoers
cards ALL=(root) NOPASSWD: /bin/systemctl restart cards-decrypt-env, /bin/systemctl restart cards-backend
```

加载并首次启用：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now cards-decrypt-env.service
sudo systemctl enable --now cards-backend.service
sudo systemctl enable --now cards-pull.timer
sudo systemctl start cards-pull.service
```

## 6. 一次性验收

管理员和 Agent 按顺序执行，不满足任一步都不要宣布上线完成：

```bash
systemctl is-enabled cards-pull.timer
systemctl is-active cards-pull.timer
systemctl status cards-pull.service --no-pager
journalctl -u cards-pull.service -n 100 --no-pager
sudo -u cards git -C /srv/namerena-cards rev-parse HEAD
curl -fsS https://shenjack.top:10007/cards/DEPLOY_REVISION
```

然后开发者推送一个已审批的、只修改 `js/` 或 `css/` 的小改动。管理员等待不超过四分钟并核对：

```bash
journalctl -u cards-pull.service --since '10 minutes ago' --no-pager
curl -fsS https://shenjack.top:10007/cards/DEPLOY_REVISION
```

两处 SHA 必须等于 GitHub `main` 的 SHA。随后推送只改 `README.md` 的提交，日志应显示“非运行文件变更，跳过构建”，且 `cards-backend` 不重启。

## 7. 后续责任边界

- **开发者**：将 Cards 改动推到 `main`，不接触服务器密钥；
- **服务器 Agent**：仅按本手册维护 systemd、依赖与部署日志，不上传任何密钥到仓库；
- **管理员**：保管 age 私钥、审核一次性权限与服务状态；除密钥轮换、主机迁移或故障处理外，不需参与日常发布；
- **自动化**：`cards-pull.timer` 负责日常拉取、筛选、构建与重启。

## 8. 故障处理与回滚

部署失败时先查看日志，不要反复手工执行 `git reset --hard`：

```bash
journalctl -u cards-pull.service -n 150 --no-pager
journalctl -u cards-backend.service -n 150 --no-pager
```

确认失败提交后，开发者在仓库创建修复提交或回滚提交并推送 `main`；timer 会自动处理。仅在正式站不可用且需要紧急恢复时，管理员将服务器工作树固定到最近已知正常 SHA、重新构建并重启，并在恢复后把原因和目标 SHA 记录到变更单。
