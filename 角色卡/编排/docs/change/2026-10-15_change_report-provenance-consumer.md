---
id: orchestration-c-1-evidence
type: change
title: C 最终报告与安全历史消费实施记录
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: implemented
related: [task-handback, orchestration-report-provenance-consumer-c]
---

# 最终报告按真实会话保存，恢复不重跑模型

ORCHESTRATION-C-1，固定编排角色；客户批准总方案revision2、A4、C2.tp1、[编排consumer2](../design/2026-10-15_design_report-provenance-consumer-c.md)，root作为已授权trusted operator转发，PM已预留本角色范围。实施前独立复算批准manifest13项、Core final14项均0 mismatch；批准方案/manifest未修改。功能现状见[任务回交](../feature/task-handback.md)。

## 实际改变

- `src/common/编排/handback.ts`：纯终局判断、origin与清理，不调用Service；A4新display仅accepted/result/oktrue/已知write/edit、path完整且未redacted/truncated时记为定位证据，非法展示不退rawalias，旧无display的路径/旧无phase摘要保持兼容。
- `src/pipeline/orchestration/run-role.ts`：Pipeline外层消费最终handback再调用实际 `session.persistence.recordFinalReport`；source失败转安全未保存态并继续真实settled，disabled/unknown原live不暗建目录。公开实际persistenceMode及Model原union保存/查询/通知代理，disposed失效，Core负责单在途/快照仓，Pipeline不造第二仓、不enqueue/dispatch。公开history安全读取context和纯projectRoleLegacyHistory桥接，沿Service而非私有实现。
- `src/pipeline/orchestration/govern-session.ts`：同RoleSessionSendOptions与五个持久代理透明转发，治理仍不自我回交。

source事件实际字段为 `report?:RuntimeReportSnapshotV1`、`liveReport?:RuntimeLiveReportViewV1`、`reportPersistence:{state,reportId?,code?,retryAvailable}`。event.summary是安全文本，`handback`原对象仅可信Window内部模型render，不得原样IPC。Window要按同reportId归并状态且唯一入队；source保存恢复成功可以首次继续原投递，target补存绝不再调用Provider。

typed provenance/live可选三身份按实际Core all/all-none验证；原SDK modeltext逐字/图片数组原引用保持，新metadata不进SDK。新C受保护ANS用户记录/输入事件/summary/恢复材料只存冻结安全副本，flags明确modelInputRecorded:false。新A4写入产物只记录事件事实，不改变B文件读取权限或独立验收结论。

## 精确写集与验证

本阶段实际生产仅上述三件；实际测试仅 `test/编排/handback-lifecycle.test.ts`、`test/编排/runtime-orchestration.test.ts`、新增 `test/编排/report-provenance-consumer.test.ts`。其余批准测试未需修改。runtime-orchestration自有controlled factory补actual required-v1 profile登记，原门禁断言保留，不绕过Core协议、不代改peer fixture。同步自身api-spec/feature-map/memo/changelog/任务回交feature及本记录/证据。

macOS arm64 / Node v24.14.0，临时项目、真实Core+store、受控provider，不联网模型：

| 检查 | 结果 |
| --- | --- |
| `node --test 'test/编排/*.test.ts'` | 256/256，0失败/跳过 |
| `npm run typecheck` | exit 0 |
| 本角色源码/测试/docs `git diff --check` | exit 0 |
| 批准13文件与Core14文件哈希复查 | 0 mismatch |

原始日志与精确候选SHA见[证据目录](2026-10-15-report-provenance-consumer-evidence/manifest.json)。新增8个Core消费行为测试覆盖：终态后保存及origin/未知task、源保存失败+并发两retry只有一次save/一次模型调用、真实disabled无目录、govern目标原SDK文本/图片不变且安全历史/补存Provider仍1、ACK后user失败Provider0、legacy纯投影及可信custom key、disabled目标live三身份all-none、custom unknown-live及UNSUPPORTED。另在原lifecycle增加A4写证据实际表驱动，完整路径去重、隐藏/截断/raw诱饵和旧路径兼容。

## 尚未覆盖与下游要求

本证据不证明Window新归并/IPC/固定批次/恢复按钮已接线，不证明UI消费或真实Pi/Codex/Claude/桌面全链验收。Window须消费安全字段，raw业务对象和原modeltext仅内部；保留Core错误receipt，未知/可能Provider已开始不自动重投。未知adapter的proxy入口虽存在，实际能力模式为unknown-live、保存返回UNSUPPORTED，支持按钮不得仅按函数存在性判断。环境当前known values/模式保护不等于未知旧secret全DLP；没有追溯改写旧native转录。

未改Core/Model/适配器/app/边界/.env/p-limit/peer测试；未提交Git、未打开真实桌面、未部署。新保存/来源依赖的跨角色证据须由PM核查后放行下游。
