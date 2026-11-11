# 引擎产物来源

源码仓库：https://github.com/KODU16/tswn-cards

固定源码提交：929d0dbedd03ca55e4854227d2e27479f74758a2

本目录的 JS、标准 WASM 和类型声明由该提交构建，网站与多人运行时复用同一份 WASM。

## 复现构建

使用与 Cargo.lock 相匹配的 wasm-bindgen-cli（本版 0.2.129），并安装 wasm32-unknown-unknown target：

~~~powershell
git checkout 929d0dbedd03ca55e4854227d2e27479f74758a2
cargo build -p tswn_wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir dist target/wasm32-unknown-unknown/release/tswn_wasm.wasm
~~~

也可在基线 5237f2b30a46b6658c6aefd49b2c4e97a2b81080 上应用 source.patch；补丁包含构建所需的完整源码，含 runtime/forced_action.rs。

## 验证

Rust：cargo test -p tswn_core -p tswn_wasm；cargo +nightly fmt --check。

Cards：node tools/verify-engine.mjs vendor/tswn_wasm_duel、node tools/verify-relics.mjs、node tools/verify-abilities.mjs、node tools/verify-clone.mjs、node tools/verify-progression.mjs、node tools/verify-rare-boss-honor.mjs、node tools/verify-new-run.mjs、node tools/verify-construct.mjs。

发布构建：npm run build:site。构建结果使用内容指纹引用 JS 和 WASM，遗物独立图标随构建发布。

## 遗物与会话

17 件遗物的前端获取、存读档、销毁和战斗选项已接通。运行时支持语言包、状态延长、分身衰减减免、拜谢返还、不等式阵亡吞噬与背刺两次受击和增伤。帮测贴的独立加成只保留于原角色。

保留双方受控、开局逐角色当前生命、负 MP 普攻、持久战斗会话、独立能力乘区及交错会话隔离。具体接口见 FORK.md。
