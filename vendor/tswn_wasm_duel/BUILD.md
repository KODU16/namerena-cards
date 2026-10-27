# 引擎产物来源

`vendor/tswn_wasm_duel/` 里的 wasm 由下面这份源码编译而来：

- 仓库：https://github.com/KODU16/tswn-core
- 提交：3548b91
- 构建：

```powershell
$env:PATH = "$env:USERPROFILE\.cargo\bin;C:\Strawberry\c\bin;$env:PATH"
cargo build -p tswn_wasm --target wasm32-unknown-unknown --release
wasm-bindgen --target web --out-dir dist target\wasm32-unknown-unknown\release\tswn_wasm.wasm
```

改动清单见该仓库的 `FORK.md`。
