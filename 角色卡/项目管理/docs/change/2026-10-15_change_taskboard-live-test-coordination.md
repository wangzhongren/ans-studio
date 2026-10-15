---
id: taskboard-live-test-coordination
type: change
title: 发布包内离线任务看板真实开发测试环境协调
created: "2026-10-15"
status: authorized
---

用户已要求实际使用软件开发项目做全流程测试，选择离线任务看板。本轮不是新产品实现；看板业务/测试必须全部由ANS桌面内角色编写，外部agent不得代写。root固定测试负责公开已验证运行包的CUA及自身证据。

root已在公开v1.0.0真正下载包导入空Git项目/private/tmp/ans-real-taskboard-sf0tuykb，App /private/tmp/ans-taskboard-release-kn7tg1vm/extracted/ANS Studio.app，macarm64ZIP SHA92118718ae34b1194c615d2c94c78b37d0324bce0b0ac9e31529431c0bc59270。当前idle，Pi配置缺席。用户未专门授权保存秘密到新配置，因此装配窄辅助优先读取现repo.env，以单一readEnvFile实现严格取Pi必要三键注入App child env，秘密仅进程内存，不复制/打印/持久化。

ASSEMBLY-TASKBOARD-ENV-1窄包交root忠实转原固定readme_rewrite_assembly：仅自有test/装配或/tmp辅助及own资料；先read/prep，等root通过CUA退出idle App并明确给启动信号才spawn。原.env/用户当时原配置/项目配置不变，日志只键是否齐全及来源不值。标准--user-data-dir需实际确认app.getPath隔离，不以参数存在推定；若不成立报告root，不覆盖默认用户文件，root可仅补非秘密model，token仍不保存。不得写他角色生产/测试或root证据，不起新角色/会议。

当前为预留包已交root，未假记成功followup或启动。后续按实际ACK/GUI交接/受限进程启动结果记证据，不因测试授权扩张凭据持久权限。

## 首次bootstrap阻点只读分类

PM实读测试角色first-bootstrap-finding.json与first-runtime-problems.json：模型生成实现者boundary.yaml的purpose包含未加引号的type: module，YAML Nested mappings错误；UI明示跳过，dispatch_task向模型返回“角色未枚举/未受理”，不是成功。测试者有效且已受理，su后续排查轮timed_out，尚无业务代码。首因归模型治理产物错误；parser拒绝/角色不生效/dispatch失败是安全failclosed正确表现，不是缓存结论。不能以本轮测试放宽解析、写权限或超时，外部agent不得代修项目。

现有dispatch结果已提供未受理事实，但不含解析文件行列完整原因，可能是后续A阶段错误反馈优化候选；尚不能据此断言必须产品修复才能继续（su已能读治理文件）。只有错误上下文缺失确实阻碍读取定位/恢复，才升级为实证产品缺陷。单次su超时不能证明bootstrap deadline政策不适合，须结合实际执行/等待/IO时间线，不能延时掩盖。

root已通过正常软件内用户消息要求su在原已确认范围、原confirmation流程内仅给含冒号scalar引号，修后先验证枚举再实现者→测试者；继续由软件内角色完成业务开发。PM只读分类，无GUI/项目文件操作/编码/外部修复派发。
