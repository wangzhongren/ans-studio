---
id: restricted-document-read-implementation
type: change
title: B2受限文档读取分层实现
created: "2026-10-15"
status: implemented
---

# 原生导入后从已列引用阅读文档

按PM转发WINDOW-B-1和客户同版授权实施[批准B2](../design/2026-10-15_design_restricted-document-read.md)，开工时独立核对13份批准文档SHA256全部匹配；批准proposal、manifest、治理定义未修改。角色已按[治理记录](2026-10-15_change_restricted-document-boundary.md)精确覆盖8个新源码与1个新测试。当前[功能说明](../feature/restricted-document-read.md)区分窗口实现和真实UI待验收。

实现8个批准新src，按Model→Provider→Service→Pipeline→Interface逐步验证。既有产品改动仅app/main.ts、preload.cjs、desktop/interface.ts、project.ts：一条IPC、一个preload方法、原生pick成功授grant、listing投候选与接回opaque refs、关窗dispose。测试新增project-document.test.ts并在interface.test.ts补实际grant/跨窗口/读取/关闭行为；project.test.ts、diagnostics.test.ts只复跑未修改。未改session、runtime-history、session-history、request-anchor、任何C保存队列；无依赖/配置/.env/真实目标项目修改。

Service唯一拥有scope与引用registry；Provider负责O_NOFOLLOW、已固定root身份、每段lstat/realpath、普通文件、安全整数dev/ino、有界同句柄读和前后父目录/文件复核，finally关闭。Service做引用资格/预算/UTF8 fatal/NUL/迟到scope复核；Pipeline只Service public。Provider检查root与候选文件所在FS类型白名单，Windows、未知FS/无身份能力拒读；未引入Interface fs或common绕IO。

PROJECT_NOT_GRANTED是B2原生grant前置的固定机器原因（未原生选择、renderer直接列目录），不是额外读取权限。公开Model注释明确cardPath/changelogPath项目相对、docs.path角色卡目录相对，UI不应把旧索引path直接当读取请求。所有读取失败固定文案，无raw异常/部分正文；界面静态安全呈现仍由UI实现/验证。

实跑4文件36/36（project-document/interface/project/diagnostics），包含平台拒读、上限262144/262145、UTF8/NUL/BOM/空文档、路径/符号链接/目录/缺失、检查-打开-读取替换、父目录/root替换、增长、旧引用撤销/迟到scope、乱序listing、真实preload桥、原生取消/跨窗口/renderer重载与关闭。权限错误以契约Provider替身确定验证，未声称本机权限位可覆盖所有特权情形。实际磁盘夹具均临时文档，不读真实凭据。原始结果和精确候选哈希见[证据manifest](2026-10-15-restricted-document-implementation-evidence/manifest.json)。

最新全仓typecheck仍红，诊断仅Core并行src/common/runtime-core/report-provenance.ts两项implicit any（行44/45），未越权修改；B新源码未报类型错误。应待共同候选冻结后再运行全仓类型检查，不把它称已通过。root独立Pipeline→Service→Provider场景已通过，包含原文件hash/mtime不变；该结果不替代Interface或GUI。

未覆盖：UI阅读入口、安全Markdown和返回焦点/草稿/双宽真实Electron验证；真实Linux/Windows平台；恶意本地writer严格隔离（批准合同明确不保证）。现Provider local FS白名单与身份检查不等同对所有挂载的安全证明，未知FS failclosed；Linux实现分支未经本机真平台测试。后续测试角色需按批准验收框架记录共同候选，不读本轮禁止的真实p-limit/凭据。
