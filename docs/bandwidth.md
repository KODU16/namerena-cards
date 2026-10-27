# 流量与体积（GitHub Pages 100GB/月）

GitHub Pages 只统计**实际被请求的字节**，仓库里放着但没人下载的文件不占流量。
但首屏会下载的东西必须压缩，下面这些是已经做过的优化。

## 首屏实际下载（约 1.18MB raw / 405KB gzip）

| 文件 | raw | gzip |
| --- | --- | --- |
| `vendor/tswn_wasm_duel/tswn_wasm_bg.wasm` | 942 KB | 326 KB |
| `vendor/tswn_wasm_duel/tswn_wasm.js` | 65 KB | 10 KB |
| `css/style.css` | 44 KB | 10 KB |
| `js/*.js`（8 个模块） | 97 KB | 33 KB |
| `assets/emoji-sprite.png` | 19 KB | 20 KB（PNG 已压缩） |
| `data/tactics.json` | 3 KB | 1 KB |

按 405KB/次计算：100GB ≈ **24.6 万次首屏**；即使 Pages 不给 wasm 做 gzip（按 1.18MB 算）也有约 **8.4 万次**。
浏览器的 `max-age=600` 缓存会让回访几乎不产生流量。

## 做过什么

1. **wasm 瘦身**：`opt-level = "z"` + `strip = "symbols"`，1.52MB → 942KB（gzip 472KB → 326KB）；
2. **图标雪碧图**：74 个 PNG（62KB、74 次请求）合成一张 19KB 的 `assets/emoji-sprite.png`，请求数 74 → 1；
3. **删掉未使用的官方 wasm 构建**（`vendor/tswn_wasm/`，1.5MB）；
4. **不再下载 `data/cards.json`**（卡池改为按名字现算）与 `data/ladder.json`（改为实时接口失败时才按需下载）；
5. **删掉废弃的 `js/combat.js`**，把 `drawChances` 内联进 `ui.js`。

## 没有做的

- `wasm-opt -Oz` 能再小 13%，但产物在 Chrome 里报 `unknown import kind`，已放弃；
- Pages 不允许自定义 `Cache-Control`，只能靠 600 秒默认缓存。

## 想再省可以做

- 把 `tswn_wasm.js` 和 `style.css` 内联进 HTML，减少 2 个请求（对流量影响很小）；
- 给 `index.html` 加 `<link rel="preload" as="fetch" href="...wasm">` 提前开始下载（不减少字节）；
- 如果将来支持多语言/多页面，把大图放进子目录避免被误爬。
