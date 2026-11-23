# 版权与出处

## 本仓库代码

`js/`、`css/`、`index.html`、`tools/`、`docs/` 下的卡牌规则、界面与脚本为本项目原创。
卡牌数值不是手写的，而是由 tswn-core 的 WASM 从名字计算得到（见 `data/cards.json` 的 `meta.method`）。

## tswn-core

- 仓库：<https://github.com/shenjackyuanjie/tswn-core>
- 使用部分：修改版 KODU16/tswn-cards 的浏览器 WASM，位于 `vendor/tswn_wasm_duel/`；固定源码提交、构建方法和完整补丁见该目录 BUILD.md。
- 本项目修改了受控战斗、遗物、逃跑等引擎行为。上游授权以其仓库声明及权利人许可为准，不因附带补丁而扩大授权。
- 固定 Boss 像素图修复移植自 tswn-core 提交 e376bc37b9669b395987c1c74a20c5a28fc195d1，对应原站 https://github.com/namerena/namerena.github.io 的图标；素材权利归原权利人所有。

## 当前像素图标

技能、属性和原有物体图标由云端图像生成工具制作，风格参考用户提供的像素图；整理为透明 32×32 PNG 后使用共享调色板压缩。宝箱开合及武器商人图标使用同一调色板逐像素绘制，源稿为 `tools/build-merchant-icons.py`。战术卡复用技能或属性图案，并由界面绘制羊皮纸底。药水共用瓶形，仅液体颜色不同。

## 历史 Twemoji 资源

- 版本 17.0.2，图形版权归 Twitter/X 及贡献者所有，许可 CC-BY 4.0：<https://creativecommons.org/licenses/by/4.0/>
- 本作把 74 个表情以 72×72 PNG 的形式打包在 `assets/emoji/`（与论坛 `shenjack.top:10008` 同款）。

## 天梯数据

- 来源：<https://shenjack.top:10007/>（沙冰鱼分部，民间天梯）。
- `data/ladder.json` 保存多个组别的公开排名、分数与阵容字符串，用于生成对手。
- 普通网页优先抓取实时数据，失败则使用快照；Toy 版只使用随包快照。

## 字体

不打包字体，直接使用系统字体栈（Microsoft YaHei / Consolas 等），与 tswn 展示页一致。
