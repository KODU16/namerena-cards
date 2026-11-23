# Cards Toy 版

这是独立静态构建，普通 Cards 发布方式保持原样。

## 功能

- 从官方 Toy SDK 的 getUserProfile 获取 Bilibili nickname。初始角色为“用户名@用户名”，队伍为用户名，不截断或替换昵称；多人天梯组别使用同名角色的独立卡牌槽位。
- 无自由名字输入、开局重抽、名字工坊、抽签、大逃杀、合作联机、外部登录、存档文本导入或下载。
- 电脑节点保留系统生成前缀测号，不提供自由输入。
- 天梯使用内置快照；本机存档与普通 Cards 隔离。
- 完整通关后向官方 submitScore({board:1,score:run.score}) 上报本局最终天梯总分。全部组别、难度及混沌模式共用榜位 1，平台保留个人历史最高成绩。中途退出、逃跑和失败不上传。
- 排行榜通过 getRankList / getMyRank 读取全时榜；无后台轮询。上传失败可重试，平台限流后至少等待一分钟。
- 平台成绩范围为 -16777216～16777215；超出时不截断、不伪造分数，显示无法上传。

## 重新打包

在 namerena-cards 目录运行：

~~~powershell
node tools/build-toy.mjs
node tools/verify-toy-play.mjs
node tools/verify-toy-rank.mjs
~~~

输出为父目录 exports/cards-toy/cards-toy.zip；ZIP 根目录包含 index.html，资源使用相对路径。测试用 SDK 替身只注入测试服务器，不会打入正式包。

## 本地预览与发布

在 exports/cards-toy 目录运行 start.ps1，打开 http://127.0.0.1:8131/；停止用 stop.ps1。本地可以检查页面，真正的用户名与排行榜能力需在 Bilibili Toy 容器内验证；本地没有平台身份时会提示重试，不使用假用户名。

1. 前往 https://www.bilibili.com/toy/publish ，申请或确认发布权限。
2. 上传 cards-toy.zip，填写标题、简介、封面与页面地址。
3. 先生成预览，检查用户名角色、1A/2A/3A 开局、移动端、战斗、通关后上报与榜单。
4. 人工检查后提交审核；可先选择“链接访问”，确认后再公开。
5. 正式分享使用平台提供的完整地址，包括 index.html。

SDK 来自 https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js 。不需开发者在包中嵌入腾讯云审核密钥。现版本不存在自行创建昵称的入口。

浏览器回归使用 SDK 替身验证业务流程，并不等于平台真实账号调用已成功；SDK 的预览环境可能拒绝成绩写入，应在平台允许写入的测试发布中核验。纯前端上报不能杜绝改分作弊。

发布前仍需按平台要求核对素材授权；引擎和 Boss 图标出处见 NOTICE.md。GitHub 推送不等于 Toy 已发布。

官方规则与 SDK 文档：
- https://www.bilibili.com/opus/1241171666570051585
- https://www.bilibili.com/toy/publish/sdk
