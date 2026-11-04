# 引擎产物来源

本目录为卡牌网站实际加载的审查修复版引擎，使用标准 .wasm，不生成 .bin。

源码基线：https://github.com/shenjackyuanjie/tswn-core/commit/5237f2b30a46b6658c6aefd49b2c4e97a2b81080

source.patch 包含基线之上的完整卡牌改动及审查修复；本次仅提交到 cards main，不更新引擎分支。复现时在基线 checkout 应用此补丁，再执行：

~~~powershell
git apply source.patch
cargo build -p tswn_wasm --target wasm32-unknown-unknown --profile release-wasm
wasm-bindgen --target web --out-dir dist target/wasm32-unknown-unknown/release-wasm/tswn_wasm.wasm
node tools/test-forced.mjs dist
~~~

游戏仓库内验证：node tools/verify-engine.mjs vendor/tswn_wasm_duel；node tools/verify-clone.mjs。
负 MP 普攻验证：node tools/verify-negative-mp.mjs（需本地网站运行于 8127）。原生回归另验证真实负 MP 会话继续行动、零费用和不掷技能耗蓝骰。

稀有技能、Boss 与皇冠验证：node tools/verify-rare-boss-honor.mjs。原生概率回归另覆盖玩家吞噬后的高原始幻术按 5 计算、敌方及普通引擎对局保持原值。

能力卡验证：node tools/verify-abilities.mjs，覆盖同效果高值替换、不同效果共存、存档和销毁、获取来源、真实减耗与伤害倍率、熟练度保持及 106 有效值。Rust 另验证独立随机乘区、嵌套作用域和敌方隔离、被动护盾熟练度不变。

实战通过 BattleSession 持久保存当前状态，仅提交新动作并取新增帧；不从开局重算历史行动。分身、随机流、HP/MP 与状态持续保存在同一运行时中。

药水使用后立刻更新面板，在本次技能或普攻执行前应用相同加成；属性药水持续至该角色下一次行动前。完整接口语义见 FORK.md。

遗物验证：node tools/verify-relics.mjs。覆盖六件遗物的获取、去重、存读档、销毁，残片一次性休息与稀有技能，真实开场增益、持续回复与护盾、戾气低伤害拦截和 Duel 注入。原生测试另外在 80 个种子中比较分身后的原角色与子体，并覆盖召唤物继承防抗的排除规则。

扩展遗物回归同时覆盖战力币的节点发分、各类扣款自动销毁，开箱器八项永久基础属性及熟练度不变，以及六种负面技能在真实 WASM 下的语言包附加狂暴。
