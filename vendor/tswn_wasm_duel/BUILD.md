# 引擎产物来源

源码仓库：https://github.com/KODU16/tswn-cards

固定源码提交：49e8fa5b0584f0d7b056de559bbd5d0396d05f46

本目录的 JS、标准 WASM 和类型声明由该提交构建，网站与多人运行时复用同一份 WASM。

Boss 固定像素图与 namerena 原站对应；同阵营同名角色按输入顺序逐条恢复遭遇状态。实际验证见 verify-rare-boss-honor.mjs、verify-toy-same-name.mjs。

## 复现构建

使用与 Cargo.lock 相匹配的 wasm-bindgen-cli（本版 0.2.129），并安装 wasm32-unknown-unknown target：

~~~powershell
git checkout 49e8fa5b0584f0d7b056de559bbd5d0396d05f46
cargo build -p tswn_wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir dist target/wasm32-unknown-unknown/release/tswn_wasm.wasm
~~~

也可在基线 5237f2b30a46b6658c6aefd49b2c4e97a2b81080 上应用 source.patch；补丁包含构建所需的完整源码，含 runtime/forced_action.rs。

## 验证

Rust：cargo test -p tswn_core -p tswn_wasm；cargo +nightly fmt --check。

Cards：node tools/verify-engine.mjs vendor/tswn_wasm_duel、node tools/verify-relics.mjs、node tools/verify-abilities.mjs、node tools/verify-clone.mjs、node tools/verify-progression.mjs、node tools/verify-rare-boss-honor.mjs、node tools/verify-new-run.mjs、node tools/verify-construct.mjs。

逃跑、掉落数量、场外药水与遭遇恢复：node tools/verify-escape-drops.mjs。分身负面状态加总另有 Rust 实际召唤回归；地图横向分布由 node tools/verify-growth-map.mjs 验证。

发布构建：npm run build:site。构建结果使用内容指纹引用 JS 和 WASM，遗物独立图标随构建发布。

## 遗物与会话

17 件遗物的前端获取、存读档、销毁和战斗选项已接通。运行时支持语言包、状态延长、分身衰减减免、拜谢返还、不等式阵亡吞噬与背刺两次受击和增伤。帮测贴的独立加成只保留于原角色。

保留双方受控、开局逐角色当前生命、负 MP 普攻、持久战斗会话、独立能力乘区及交错会话隔离。具体接口见 FORK.md。

合作模式使用 BattleSession.set_auto_actors(Uint32Array) 永久将指定根角色及其派生单位交回 tswn 原生选招。暂停时调用可继续推进；无效或敌方实体整包拒绝，不修改随机流或跨会话状态。

混沌爬塔为单人专用：submit_chaos_action(actor, JSON程序, packed) 在校验完整操作列表与 MP 后提交一次行动。包含38项版本化操作，名称和简短描述从固定配方投影，不以文案决定执行。验证：node tools/verify-chaos.mjs。

混沌战报复用原生伤害/回复/状态/召唤文本，静默操作补入对应原技能词片段，不再输出通用效果提示。混沌新牌池排除 Boss 专用操作，旧存档按配方定向迁移；普通与混沌战斗均使用扩展卡面。

混沌召唤按类别使用幻影、使魔、丧尸、分身名称，战报与快照一致。混沌商店不出售能力卡；角色技能标签和详情按实际混沌配方显示，并提供描述悬浮提示。

尖塔受控战斗统一限制双方七围外显值不超过255，体力保持独立范围。药水只记录实际增量以便正确还原，混沌多段增益在每个操作后应用上限。验证：node tools/verify-stat-limits.mjs。
