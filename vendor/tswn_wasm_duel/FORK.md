# 卡牌引擎补丁说明

以 shenjackyuanjie/tswn-core 的 5237f2b30a46b6658c6aefd49b2c4e97a2b81080 为基线。卡牌改动与审查修复通过 cards 仓库中的 source.patch 归档；本次不再提交引擎分支。

## 构建

使用 GNU 工具链及 MinGW，安装 wasm32-unknown-unknown 和匹配的 wasm-bindgen-cli 后：

~~~powershell
cargo build -p tswn_wasm --target wasm32-unknown-unknown --profile release-wasm
wasm-bindgen --target web --out-dir dist target/wasm32-unknown-unknown/release-wasm/tswn_wasm.wasm
node tools/test-forced.mjs dist
~~~

release-wasm 独立设置体积优化和符号裁剪，不影响 workspace 的普通 release。产物使用标准 .wasm 扩展名。

## 行动与暂停

battle_replay_forced(raw, new Uint32Array([actor, skill, packed, ...]), options) 只接收完整三元组。
skill 为主动技能公开编号 0..24，255 表示普通攻击；被动及非法编号报错。
packed 的低 8 位是 MP 消耗（0 表示现场掷值），高 8 位是药水编号：0 无药水、1..7 攻防速敏魔抗智、9 体力、10 MP；其它编号或溢出报错。
药水与同一条行动绑定，属性药水按实体分别保存，到该实体下次行动前还原，暂停等待指令不提前消耗药效。
合法技能无法生效时，回放明确记录退化为普通攻击；无可攻击目标时保留行动并暂停。

controlled_team 指定 runtime 队伍编号（取自 initial_states）。该队伍本体和分身等待指令，幻影、使魔、丧尸自动行动。潜行背刺等引擎强制动作优先。
暂停返回 stop_reason="paused"、paused_actor，status 仍为 running，不能视为终局。
BattleSession 的同名选项同样生效，调用 paused_actor() 取实体，再 submit_action(actor,skill,packed) 后调用 next_frame() 继续。
暂停会还原准备阶段的随机流、行动条和药水状态，续行与一次性批量回放一致。会话交错推进不会共享控制或药水状态。

start_hp_pct 必须是正的有限倍率且同时指定 controlled_team，支持 0.5 等小于 1 的值，仅修改该队伍开局 HP；max_hp 不变。
BattlePlayerState.skills 是技能导出名与当前熟练度的二元组数组。TypeScript、Python DTO 与 C 的 paused 枚举已同步；C V1 options 保持原 ABI，以默认值填充新增选项。

## 验证

Rust 行为回归覆盖封包校验、角色药水交叠与失效、流式和批量回放一致、交错会话隔离、开局 HP 边界。
tools/test-forced.mjs 对编译后的真实 WASM 执行相应验证。默认不指定 controlled_team 的战斗不执行卡牌专用潜行修复。
