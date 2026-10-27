# 版权与出处

## 本仓库代码

`js/`、`css/`、`index.html`、`tools/`、`docs/` 下的卡牌规则、界面与脚本为本项目原创。
卡牌数值不是手写的，而是由 tswn-core 的 WASM 从名字计算得到（见 `data/cards.json` 的 `meta.method`）。

## tswn-core

- 仓库：<https://github.com/shenjackyuanjie/tswn-core>
- 使用部分：官方 v0.7.0 发行包中的浏览器 WASM（`vendor/tswn_wasm/`，wasm 包装层 0.5.6 / core 0.7.0）。
- 该仓库未声明开源许可证（`license: null`）。本作把它作为同人作品依赖使用，未修改其代码；如果上游后续补充许可证，以upstream为准。

## Twemoji

- 版本 17.0.2，图形版权归 Twitter/X 及贡献者所有，许可 CC-BY 4.0：<https://creativecommons.org/licenses/by/4.0/>
- 本作把 74 个表情以 72×72 PNG 的形式打包在 `assets/emoji/`（与论坛 `shenjack.top:10008` 同款）。

## 天梯数据

- 来源：<https://shenjack.top:10007/>（沙冰鱼分部，民间天梯）。
- `data/ladder.json` 只保存 1A 列最底部 8 位成员的公开排名、分数与阵容字符串，用于生成对手。
- 站点没有开放 CORS，页面会优先尝试实时抓取，失败则使用这份快照。

## 字体

不打包字体，直接使用系统字体栈（Microsoft YaHei / Consolas 等），与 tswn 展示页一致。
