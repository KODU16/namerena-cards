# 给 tswn-core 加「指定出招」接口

## 结论先行

要做到「每个技能的结果完全与 tswn 相同」，前端重写公式是做不到的——必须让引擎自己执行。
上游的 Runtime 是「输入阵容 + seed → 自动打完」，没有任何注入玩家选择的入口，所以给
`tswn-core` 加了一组最小改动：**按单位排队强制技能**。

改动位置：`C:\Program Files (x86)\360\360PT\namerena-ladder\tswn-core`（上游 main 的副本）。

## 改了什么

| 文件 | 改动 |
| --- | --- |
| `crates/tswn_core/src/runtime/forced_action.rs` | 新增：线程内 `(实体 id, 技能 id)` 队列 |
| `crates/tswn_core/src/runtime/mod.rs` | 注册模块 |
| `crates/tswn_core/src/runtime/combat/round.rs` | `prepare_plain_action` 开头消费队列；新增 `prepare_forced_builtin_skill`、`public_builtin_skill` |
| `crates/tswn_wasm/src/lib.rs` | 新增导出 `battle_replay_forced` |

### 队列语义

- 队列元素是 `(actor_id, skill_id)` 对。
- 轮到某个实体行动时，取走**属于它的第一条**；没有就恢复原来的熟练度概率选择。
- `skill_id` 用 overlay 的公开编号 `0..34`；`255` 表示**普通攻击**（跳过技能扫描，直接走基础攻击）。
- `25..34`（防御/守护/反弹/护身符/蓄盾/反击/吞噬/亡灵/垂死/隐匿）是触发类技能，
  不能主动出招，传入会回落到自动选择。

### 为什么公开编号要单独映射

overlay 里写 `sklfire` 等 0..34，但 Runtime 内部的 `SkillId` 是**注册顺序**：
前 5 个是召唤物/附体用的自定义技能，所以实测 `内部 id = 公开 id + 5`。
代码里没有依赖这个偏移，而是用 `public_builtin_skill` 把公开编号映射到
`BuiltinActiveSkill` 变体，再按变体找 loadout 槽位。

### WASM 导出

```text
battle_replay_forced(raw_input, actions: Vec<u32>, options?) -> BattleReplay
```

`actions` 是扁平的 `[actor, skill, actor, skill, ...]`。

```js
const replay = wasm.battle_replay_forced(
  '明月几时有@白\n\n木桩@test\nseed:z@!',
  [0, 10, 0, 10, 0, 255],   // 玩家(0) 先放两次狂暴术，再普通攻击
  { max_rounds: 20000 },
);
```

## 已验证

```text
[same input, 3 次排队]
[0,10, 0,10, 0,10]  → 日志出现 3 次「明月几时有使用狂暴术」
[0,255,0,255,0,255] → 玩家只有普通攻击
[]                  → 与未打补丁的自动对局一致
```

玩家实体的 id 在 1v1 里是 `0`（第一行输入）。

## 构建

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;C:\Strawberry\c\bin;$env:PATH"
cd "C:\Program Files (x86)\360\360PT\namerena-ladder\tswn-core"
cargo build -p tswn_wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir dist target\wasm32-unknown-unknown\release\tswn_wasm.wasm
```

工具链：Rust 1.99.1 `stable-x86_64-pc-windows-gnu`（本机没有 MSVC，用 Strawberry 自带的
MinGW gcc 作为 host linker）、`wasm32-unknown-unknown`、`wasm-bindgen-cli 0.2.129`。

产物：`namerena-cards/vendor/tswn_wasm_duel/`（release wasm 1.5 MB，与官方同尺寸）。

## 剩下的工作

1. **前端切到引擎驱动**：`DuelView` 负责把 replay 的 `rows/clips` 渲染成战报，
   在每个「玩家单位即将行动」的时刻发手牌（3 选 1，单位一次行动 = 一张卡）。
2. **克隆单位**：分身/幻影/使魔各自有实体 id，队列已经支持按单位排队；
   手牌来源暂用本体技能表（克隆的技能衰减由引擎执行，不归前端管）。
3. **定位「下一个该谁行动」**：用两次模拟做差分（基线 vs 给某单位插入一个哨兵技能，
   第一个不同的帧就是它的下一次行动），不需要再改引擎。
4. **能量**：单位一次行动只出一张卡，能量改为「这张卡能不能打」的门槛。

## 引擎暂停（玩家操控的唯一入口）

卡牌玩法要求「玩家角色的每一个动作都由玩家发出」。早期前端用「哨兵动作 + 差分帧」去猜行动点，
遇到「玩家本就会出同一招」时猜不出来，会出现引擎替玩家行动的情况。现在改为引擎侧暂停：

```js
const replay = wasm.battle_replay_forced(input, [actor, skill, ...], {
  max_rounds: 20000,
  controlled_team: playerTeam,   // 玩家队伍编号（从 initial_states 里取）
});
// replay.paused_actor === 某个实体 id  → 这个单位在等玩家下指令，回放到此为止
// replay.paused_actor === null        → 战斗已经打完，看 winner_team_indices
```

规则：

- `controlled_team` 指定后，该队的**本体**与**分身**在轮到行动时，如果队列里没有它们的指令，
  `prepare_plain_action` 会记录暂停并让该单位本回合不行动，回放截断在暂停点；
- 幻影 / 使魔 / 丧尸（`core.kind.shadow|summon|zombie`）不属于受控单位，仍由引擎自动行动；
- 前端每次拿到 `paused_actor` 就为它抽手牌、写回队列、重新模拟，直到 `paused_actor` 为空；
- `stop_reason` 新增 `paused`，`status` 为 `running`，不当作终局。

验证过的四种情况：单单位、双单位（2B，两个 id 交替暂停）、分身（clone id 也暂停）、
召唤物（shadow 自动行动、从不出现在 `paused_actor` 里）。
