# tswn-core 是怎么运作的（查验笔记）

写这份笔记的目的：在动手做卡牌之前，先把「名字竞技场」的引擎拆开看一遍，确认哪些东西可以复用、哪些必须自己实现。
所有结论都来自 `shenjackyuanjie/tswn-core` 的 `main` 分支（core 0.7.0）与官方 v0.7.0 发行包里的 WASM 0.5.6。

## 1. 输入长什么样

```text
名字@阵营+武器+ol:{...}

名字2@阵营
seed:abc@!
```

- **连续行 + 空行** 决定分组：一段连续名字是一队，空行分隔两队或多队。
- `@阵营` 参与名字构建（同一个名字换阵营会得到不同八围）。
- `+武器` 走武器加成；`+ol:{...}` / `+diy[...]` 是显式覆盖。
- `seed:` 行提供本场初始化的随机种子，决定行动顺序和 RNG 流。
- 没有空行时，每一行各自成一队（1v1v1...）。

## 2. 名字 → 角色

构建链路（`crates/tswn_core/src/namerena/`）：

```text
raw 文本
  → 解析名字/阵营/武器/overlay
  → RC4 处理名字与阵营字节，得到名字基底
  → 八围 + 技能表 + 技能等级
  → 武器修正、团队强化、名字系数（name_factor）
  → PreparedPlayer → Runtime
```

关键点：

- **完全确定性**：同一个 `名字@阵营+武器` 每次构建结果完全一样，没有随机。
- **八围**：`[atk, def, spd, agi, mag, res, wis, maxhp]`。`ol.attrs` 的文本编码是「前七围 + 36，HP 原样」；实测速度在内部再带 160 的基础值，所以 `真实速度 = attrs[2] + 124`（40 张卡全部核对过）。
- **技能**：固定 0..34 号槽位（`sklfire`…`sklhide`），35 为空槽。
- **熟练度**：`to_diy` 导出三种写法 —— `5`（普通 5 级）、`"40+30"`（基底 40 再 +30）、`"2*46"`（最后一次加成 → 92）。
- **`name_factor`**：名字评估（`eval_name`）得到的缩放系数；`ol.name_factor_enabled:false` 可以关掉，让属性完全按覆盖值走。本作的卡牌全部关掉它，保证卡面数值与战斗数值一致。

## 3. 战斗 Runtime

- 行动条：每个 tick 取一个 RC4 字节的低两位作为步长（0~3），`step = 有效速度 × roll`，累加到 2048 就获得一次行动。
- 一回合 = 调度出一个行动者 → 智慧判定 → 技能尝试（按 loadout 顺序）→ 攻击/状态分支 → 效果队列结算。
- 伤害：`atp = median(r127,r127,r127,attr+64,attr) × median(r63+64,r63+64,attr+64) × at_boost`，物理除 `defense+64`、法术除 `resistance+64`，向上取整。
- hook 分 8 个阶段：`PRE_ACTION / POST_ACTION / PRE_DAMAGE / POST_DAMAGE / PRE_DEFEND / POST_DEFEND / DIE / KILL`。
- 护盾：`sklshield` 在 `PRE_ACTION` 自动累积（`max(1, 1+level×3/4)+1`），不是主动技；受击时在 `POST_DEFEND` 吸收。
- 铁壁、苏生、蓄力等是主动技能；反击、伤害反弹、护身符是条件触发的被动。
- 召唤物：血祭（使魔）、分身、幻术（幻影）、亡灵（丧尸），各有 owner / root_owner 与伤害分摊规则。

## 4. 官方 WASM 接口（本作实际用到的）

`vendor/tswn_wasm/tswn_wasm.js` 是 wasm-bindgen 的 web 目标产物，`initSync(bytes)` 可以在 Node 里直接跑，也可以用默认的 `init()` 从页面同目录拉 `.wasm`。

| 函数 | 用途 |
| --- | --- |
| `to_diy(name, old?, minions?)` | 名字 → `name@阵营+ol:{...}`，含 attrs 与 skills |
| `name_to_png_base64(name)` | 名字 → 16×16 像素头像（data URL） |
| `battle_replay(input, {include_icons, max_rounds})` | 一次性跑完整局，返回 `frames[].rows[].clips[]` 回放 |
| `BattleSession` | 逐帧推进的正式会话 API |
| `version()` / `core_version()` | 0.5.6 / 0.7.0 |

本作**只用了前两个**：卡牌的八围、技能、熟练度、头像都来自 `to_diy` 与 `name_to_png_base64`。战斗本身由 `js/combat.js` 以回合制重写，原因见下。

## 5. 为什么战斗要自己写

tswn 的 Runtime 是「全自动、不可中断」的：给它一份阵容和一个 seed，它就把整场打完，中途不接受玩家输入；`BattleSession` 只能一帧一帧读，不能注入行动。

要做「每回合抽 3 张技能卡、玩家点一张打出」，只有两条路：

1. 改 Rust 引擎，暴露“暂停 / 注入行动”的接口，再重新编 WASM —— 需要 Rust 工具链，且要动上游 Runtime；
2. 复用引擎的**构建结果**，在网页侧实现一套回合制规则。

本作选了第 2 条，并明确标注：**八围、技能、熟练度、头像是 tswn 的真值；战斗节奏与技能结算是本作的近似实现**，不是逐位对齐的移植。
具体的差异记录在 [design.md](design.md#与-tswn-runtime-的差异)。

## 6. 名字 → 卡面的实际代码

```js
const diy = wasm.to_diy(`${name}@${clan}`);
const ol = JSON.parse(diy.slice(diy.indexOf('ol:') + 3));
const stats = {
  atk: ol.attrs[0] - 36, def: ol.attrs[1] - 36,
  spd: ol.attrs[2] + 124, agi: ol.attrs[3] - 36,
  mag: ol.attrs[4] - 36, res: ol.attrs[5] - 36,
  wis: ol.attrs[6] - 36, hp: ol.attrs[7],
};
```

战斗时再把卡还原成引擎可读的一行：

```text
名字@阵营+ol:{"attrs":[...],"skills":{...},"name_factor_enabled":false}
```

这样卡面数值和引擎构建结果永远一致；战术卡（+攻击、+技能等级）也只是往这份 `ol` 上做加法。
