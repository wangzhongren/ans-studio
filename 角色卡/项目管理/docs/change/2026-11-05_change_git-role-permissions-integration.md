# Git角色权限整合 P6短合同

- 2026-11-05，固定项目管理；仅完成[唯一实施合同G-C1](../design/2026-11-05_design_git-role-permissions-contract.md)，不重写策划P2/G-T1，不实施Git。
- 变化入口：现runtime/trunk Model与严格工具请求拟加结构化Git查询/候选/发布；原O五参manifest CAS/二参readManifestAt兼容语义保留，Git单ref为新发布提交点。R/G/O/W具体职责与调用边见合同§1–2。
- 核心前置：同用户spawn/classify/postaudit不等于Git写隔离，R6 native事实不等于沙箱；无GitProtectionFacts与实际撤权同临界区实证，相关修改blocked。最小owner调查入口与精确delta要求见§3–4，未虚构已有授权锁/OS隔离。
- 双介质迁移、旧journal/旧pin兼容、提交未知恢复/后继链及OID绑定见§5；既有真8refs/creator-close/通知复用，不造新DAG/权限账本。
- 结论为同对象实施方向recommend approval，原owner实际Git实现/沙箱/授权串行与E2E均待证；普通同合同细化复用审结，新实质接口/权限差异精确再核。先已消息统筹消费签名，文档完释放。
- 候选HEAD77945d9加既存/在飞差异均保留。本人写集仅本合同、此change、api/memo/feature-map；不改根/他owner/源/i18n，不运行形式测试/应用/模型/Git，不commit/迁移/远端。
