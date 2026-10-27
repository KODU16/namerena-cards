# 名字竞技场 · 卡牌对决

> 在线试玩：https://kodu16.github.io/namerena-cards/
> 源码：https://github.com/KODU16/namerena-cards

把「名字竞技场」（namerena）的角色构建结果做成卡牌，再打一场回合制卡牌对决。

- **名字即卡牌**：卡面上的八围、技能、熟练度、头像全部由 [`tswn-core`](https://github.com/shenjackyuanjie/tswn-core) 的官方 WASM 现算，同名同阵营永远得到同一张卡。
- **纯静态**：没有后端、没有构建步骤，`index.html` + ES Module + 1.5 MB wasm，直接丢 GitHub Pages 就能跑。
- **战斗交给引擎**：行动顺序、伤害、状态、召唤、随机数全部由打过补丁的 `tswn_wasm` 执行；玩家只在轮到自己单位时出牌。
- **对手来自真实天梯**：开局抓取 `shenjack.top:10007` 的 1A 榜，从最底下第一个正分成员开始，沿排名向上打 8 场。
- **奖励二选一**：随机技能卡（进锻造，可叠加熟练度）或随机角色卡（直接进卡组）。

> 这是非官方同人作品。引擎与角色数据来自 tswn-core，卡牌玩法、界面与战斗规则是本仓库自己实现的。

## 直接玩

**双击 `start.cmd`**：它会起一个本地静态服务器并自动打开 `http://127.0.0.1:8123/`。

或者手动：

```powershell
python -m http.server 8123 --bind 127.0.0.1
# 名字竞技场 · 卡牌对决

> 在线试玩：https://kodu16.github.io/namerena-cards/
> 源码：https://github.com/KODU16/namerena-cards
```

> 不要直接双击 `index.html`。浏览器对 `file://` 页面禁止加载 ES Module 和 `.wasm`，
> 引擎会一直停在「正在唤醒引擎」。页面对这种情况会给出提示，但只有 http(s) 才能跑。

## 目录

```text
index.html            单页入口
css/style.css         全部样式（tswn 蓝灰白 + Twemoji 图标）
js/main.js            启动、导航、战斗流程
js/engine.js          tswn_wasm 封装：名字 → 卡牌、头像
js/combat.js          回合制战斗核心（能量、手牌、被动、状态、AI）
js/game.js            爬塔流程、卡组、奖励、存档、天梯抓取
js/ui.js              DOM 渲染与战斗动画
js/skills.js          35 个技能的元数据
js/emoji.js           表情映射（Twemoji 17.0.2）
data/cards.json       40 张预生成角色卡（含 1v1 循环赛胜率与费用分档）
data/tactics.json     20 张战术卡
data/ladder.json      天梯 1A 快照（8 个对手）
vendor/tswn_wasm/     官方发行包 wasm 0.5.6 / core 0.7.0
assets/emoji/         本地 Twemoji PNG（与论坛同版本）
tools/                数据生成与调试脚本
docs/                 引擎笔记、玩法设计、部署说明
```

## 常用命令

```powershell
node tools/fetch-ladder.mjs     # 重新抓天梯 1A，更新 data/ladder.json
node tools/build-cards.mjs      # 重新生成卡池（需要 vendor/tswn_wasm）
node tools/fetch-emoji.mjs      # 重新下载表情（FORCE=1 覆盖）
node tools/sim-test.mjs         # 无浏览器跑 200 场，检查战斗核心是否崩
node tools/cdp.mjs <url> <out.png> [waitMs] [js]   # 无头 Chrome 截图 + 控制台报错
```

## 部署到 GitHub Pages

1. 新建仓库，把整个目录推到默认分支：
   ```powershell
   git init
   git add .
   git commit -m "namerena cards"
   git remote add origin https://github.com/<you>/namerena-cards.git
   git push -u origin main
   ```
2. 仓库 **Settings → Pages**：Source 选 `Deploy from a branch`，Branch 选 `main` / `/ (root)`。
3. 等 1~2 分钟，访问 `https://<you>.github.io/namerena-cards/`。

细节（CORS、天梯快照自动刷新、自定义域名）见 [docs/deploy.md](docs/deploy.md)。

## 版权与致谢

- 引擎、角色构建规则、头像渲染：[`shenjackyuanjie/tswn-core`](https://github.com/shenjackyuanjie/tswn-core)（Rust / WASM，官方 v0.7.0 发行包）。
- Twemoji 图形：CC-BY 4.0，版权归 Twitter/X 与贡献者，版本 17.0.2（与论坛 `shenjack.top:10008` 同款）。
- 天梯数据：`shenjack.top:10007` 的公开成员分数排名。
- 本仓库的卡牌规则、界面与代码：见 [NOTICE.md](NOTICE.md)。
