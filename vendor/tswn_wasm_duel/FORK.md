# 卡牌引擎接口说明

固定源码来自 KODU16/tswn-cards，提交 97c42bf536fac57b03bd5bae534da2c14909245b；完整构建与补丁基线见 BUILD.md。

## 构建

使用 GNU 工具链及 MinGW，安装 wasm32-unknown-unknown 和匹配的 wasm-bindgen-cli 后：

~~~powershell
cargo build -p tswn_wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir dist target/wasm32-unknown-unknown/release/tswn_wasm.wasm
node tools/test-forced.mjs dist
~~~

release 使用工作区的体积优化和符号裁剪。产物使用标准 .wasm 扩展名。

## 行动与暂停

battle_replay_forced(raw, new Uint32Array([actor, skill, packed, ...]), options) 只接收完整三元组。
skill 为主动技能公开编号 0..24，255 表示普通攻击；被动及非法编号报错。
packed 的低 8 位是 MP 消耗（0 表示现场掷值），高 8 位是药水编号：0 无药水、1..7 攻防速敏魔抗智、9 体力、10 MP；其它编号或溢出报错。
普通攻击 skill=255 独立于技能耗蓝分支，始终不检查或扣除 MP，也不掷技能费用骰；负 MP 同样可以提交和续行，行动结束后照常回复 MP。
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

## 持久战斗会话

网站实战创建 BattleSession 后持续持有同一运行时。每次出牌仅 submit_action，再调用 next_frame 取得新增战报；生命、MP、分身、状态和随机流从当前边界继续，等待出牌期间不推进。结算或退出时 free。battle_replay_forced 仅供离线回放与回归对照，不用于每次出牌。

批量兼容接口的队列可引用之后生成的分身，不能用开局实体表提前拒绝其 id；指令仅在 Runtime 实际调度该实体时消费。Rust 回归覆盖分身连续出牌以及持久会话与离线回放结果一致。

## 能力卡

受控 BattleSession 在首次推进前调用 set_abilities(Uint32Array)。三元组依次为技能编号、MP 减耗、独立效果倍率（万分比，10000 为原值）；编号顺序见 runtime/forced_action.rs 的 ABILITY_SKILLS。主动技能编号 0..24 与出牌编号一致，25..36 为被动、使魔自爆及附体。非法、重复或残缺封包报错。未配置能力的普通战斗保持原行为。

能力仅属于受控角色原始队伍及其派生单位，交错会话不共享。随机攻击强度在原掷骰后乘算，不增加 RNG 消耗；护盾、护身符、吞噬资源、垂死抗争和隐匿在各自数值结算入口乘算。MP 减耗在技能扣费边界生效，主动技能最低 1 MP，被动最低 0 MP。前端传原始费用，显示减耗后费用，避免扣减两次。

能力不写入技能表，不改变原始或有效熟练度、抽牌权重、技能发动概率；超过 106 的原始熟练度仍按既有有效 106 规则计算。覆盖高值与销毁由网站存档层管理，战斗只接收最终持有效果。

卡牌受控队伍及其派生单位的幻术发动概率按有效熟练度 5 封顶，吞噬获得更高原始值也不绕过；原始值不裁剪，敌方天然技能和未受控普通引擎对局保持原行为。前端在卡面、抽牌及初始战斗输入处使用相同的 5 上限。

## 网站遗物

BattleOptions 可选择开场疾走/迟缓、每次实际行动后的全队 3% 回复、独立护盾、敌对伤害最低 30 门槛以及 stat_relic_team。帮测贴为原始友方随机两项不同属性加 10（HP 加 30），增益保存在原角色模板的 opening_bonus 中，clone_build 与召唤蓝图不包含它。分身后原角色继续保留加成，子体及继承防抗的召唤物排除该增益。所有选项默认关闭，普通引擎对局不改变。

自制语言包通过 language_relic_team 开启；只在火、冰、毒、迟缓、诅咒、魅惑实际成功施加后附带一回合狂暴。未命中、免疫、净化与狂暴自身不触发，也不会递归叠加回合数。

## 多人存活模式

controlled_team=4294967295 表示控制双方原角色与分身，召唤单位仍自动行动。set_initial_hp 接收实体编号/当前生命的二元组数组，只允许首次推进前调用；整个封包先校验再应用，拒绝重复编号、零生命、超过原最大生命及非原始实体，原 max_hp 不变。会话开始或暂停后均不可修改开局生命。

## 扩展遗物

BattleOptions 的 debuff_relic_team、clone_relic_team、positive_status_relic_team、thanks_relic_team、inequality_relic_team、assassinate_relic_team 分别启用属性修改器、说和做、红内裤、拜谢、不等式与背刺遗物。各选项默认关闭，只对指定持有方生效。拜谢在状态解除后向敌方返还两回合同类状态，不经免疫与命中判定；不等式在真实死亡链中只处理一次。背刺遗物保留第一次有效受击后的潜行，第二次识破，背刺倍率由 4 提升至 6。

合作模式使用 BattleSession.set_auto_actors(Uint32Array) 永久将指定根角色及其派生单位交回 tswn 原生选招。暂停时调用可继续推进；无效或敌方实体整包拒绝，不修改随机流或跨会话状态。

混沌爬塔为单人专用：submit_chaos_action(actor, JSON程序, packed) 在校验完整操作列表与 MP 后提交一次行动。包含38项版本化操作，名称和简短描述从固定配方投影，不以文案决定执行。验证：node tools/verify-chaos.mjs。

混沌战报复用原生伤害/回复/状态/召唤文本，静默操作补入对应原技能词片段，不再输出通用效果提示。混沌新牌池排除 Boss 专用操作，旧存档按配方定向迁移；普通与混沌战斗均使用扩展卡面。

混沌召唤按类别使用幻影、使魔、丧尸、分身名称，战报与快照一致。混沌商店不出售能力卡；角色技能标签和详情按实际混沌配方显示，并提供描述悬浮提示。

尖塔受控战斗统一限制双方七围外显值不超过255，体力保持独立范围。药水只记录实际增量以便正确还原，混沌多段增益在每个操作后应用上限。验证：node tools/verify-stat-limits.mjs。
