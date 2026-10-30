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

游戏仓库内验证：node tools/verify-engine.mjs vendor/tswn_wasm_duel。

药水使用后立刻更新面板，在本次技能或普攻执行前应用相同加成；属性药水持续至该角色下一次行动前。完整接口语义见 FORK.md。
