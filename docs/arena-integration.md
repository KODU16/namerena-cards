# 多人模式生产接入

正式站是静态 dist + 主站 Flask/PostgreSQL；静态更新不会自动部署本仓库的独立 server/app.py。

一次性接入主站 cards/arena-backend-integration 分支的网关、数据库适配和公房时钟后，加载器会自动跟随 dist/arena-server。兼容的玩法、物品、事件、Python 规则及 Node/WASM 随 cards main 和原 cards-pull 自动生效，无需重复人工更新服务器。协议 3/存储结构 1 不兼容的升级才需另行部署。开启前维护者应审核 cards main 规则代码在主站权限下自动执行的信任范围。

完整交接文件位于主站 PR [#1](https://github.com/1cy3ish/namerena-platform/pull/1) 的 docs/cards-arena-integration.md，亦单独交付维护者。不要启用历史 8800/SQLite 服务，不要将规则路径指向正在构建的源码目录。

构建 npm run build:site 生成 dist/arena-server 清单、规则、Node 和标准 WASM。部署验收：node tools/check-arena-deployment.mjs https://shenjack.top:10007。检查真实 API、协议、引擎、公房及时钟，CI 构建成功不能代替后端验收。

本地回归：python server/arena_smoke_test.py；python server/arena_world_test.py。浏览器回归先启动 python server/arena_ui_test_server.py，再运行 node tools/verify-arena-ui.mjs。手机横屏采用 844×390 或 740×360，竖屏显示旋转提示。
