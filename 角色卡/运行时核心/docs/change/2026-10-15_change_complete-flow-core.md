---
id: complete-flow-core-implementation
type: change
title: 受保护的工具详情与报告历史实施记录
created: "2026-10-15"
updated: "2026-10-15"
timezone: Asia/Shanghai
status: verified
related: [runtime-tool-display-contract-a, runtime-report-provenance-contract-c]
---

# 让工具详情和报告历史可核对

CORE-A/C-1正式派发按客户批准总r2、A4、C2文本补充1实施；批准设计和PM review-manifest不修改。实施开始前13份设计SHA256全部匹配。原工作区治理/其他角色资料改动作为基线保留。

固定运行时核心只修改Model/runtime、Service/runtime/session、Provider/runtime/tools与session-store、新增自己common/tool-display及report-provenance、自有test/runtime-core与自身资料。适配器、Pipeline、app、B Model、边界、环境与p-limit成果均只读。先A专项再C串行，实际门槛与原始日志补在本记录，不把已批准方案冒称测试结果。

实施开始时尚未通过新候选验证。以下记录最终核心自验，消费者整合与部署不在此verified范围；受控factory实现真实required/profile协议，不放松生产断言。

## 最终核心候选与实际边界

Core A4/C2.tp1已实现并在本角色范围验证完成。最终14份源码/测试组合SHA256为 `9395a1807e5af6248572bd04856adb959dbec5c01101669154803957bd55e7dc`，逐文件指纹及完整日志在[final-manifest.json](2026-10-15-complete-flow-core-evidence/final-manifest.json)。发布后只更新本角色说明，不再并发改代码；消费者发现问题须带证据回原固定Core角色。

实际源码为Model/runtime、Service/runtime/session、Provider/runtime/tools及session-store、两份私有common/tool-display/report-provenance。实际测试写集为新tool-display、legacy-history-projection、report-provenance，以及原tools/session/prompt-start-acknowledgement；额外实际维护fixtures.ts和effective-timeouts.test.ts，让旧controlled factory明确断言required-v1并注册真实空profile。该必要协议接线位于已授权test/runtime-core目录，已列报PM，生产门槛/原断言没有删除或放松。原session-store测试直接复用，无无谓修改。

唯一必要兼容补已经PM裁定并实施：live-only inputPresentation可选deliveryId/attemptId/target，三齐且匹配才有新receipt/progress/seen保护，全缺保旧live不造ID，部分INVALID。已知attempt即便被不完整新输入再次提到，也保留原执行事实；不能因为验证/读盘失败把已执行倒退为未执行。不新增durable源报告身份、不把live报告对象写盘、不改边界或批准proposal。

## 分层与行为结果

Node v24.14.0、macOS arm64。命令 `node --test 'test/runtime-core/*.test.ts'` 最终75/75、0失败、0skip；`npm run typecheck` exit0；`git diff --check` exit0。模型/Provider/Service的证据分别为：

- Model与纯投影：精确字段和阶段、真实别名选择、custom同名不猜rule、native text/unsupported fallback、身份不经redactor、profile登记与缺失拒绝、UTF-8及JSON双预算、legacy纯桥/锚点token/最近连续后缀/独立省略计数。
- Provider：真实Node shell退出7/stdout/stderr、spawn失败无exit、旧1MiB软阈值上的实际丢弃标记；原返回message和执行流程不变。真实临时目录的报告原子文件、读取未知版本、已知尾段恢复和损坏/外来记录拒补均通过实际Core/store接缝运行。
- Service与持久能力：实际store决定mode；source最终报告幂等/冲突/失败冻结及保存重试单在途；target安全显示副本与原model text/images分离、metadata剥离；ACK后user/boundary失败Provider0次，Provider后index/历史失败Provider1次，保存恢复不再prompt；finalreceipt跨handle、无final不猜outcome；disabled无目录/legacy不造身份；16MiB FIFO失效、128详细回执/最小seen护栏、dispose expired。

上述使用受控Provider替身和真实本地工具/FS，不冒充真实在线SDK或最终Electron。源保存成功后的第一次续投由Window唯一owner负责，Core只发状态，不能以本75项证明Window已唯一入队。

## 原失败与修复

原始失败不覆盖为成功，保留同目录日志：首专项的control字符测试将合同要求的可见替代符误认为UTF-8破损，已把控制符与纯多字节边界分别断言；随后的独立JSON字节断言发现追加omissions标记后display可能超56KiB，修为追加后再检查，原字节断言保留。C第二轮128详细回执测出disabled提前返回绕过淘汰，修相同收口；之后partial输入夹具复用了已执行attempt，分开新partial输入与已知attempt事实不倒退断言，均有实际Provider次数保护。

root独立[真实后置故障红](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/c-after-provider-independent.json)发现replay变目录后重复attempt错误回执退回providerMayHaveStarted:false。Core把已知内存事实/seen查重移到source重验证和读盘前，保原turn/outcome/可能已执行；同一原断言已[独立转绿](../../../测试/docs/change/2026-10-15-p1p7-implementation-evidence/c-after-provider-green.json)，并加入本角色实际目录替换回归。之后补齐完整但回执抛错的幂等确认、未知版本、source/target投影侧车白名单与live-only无final时按真实同turn用户记录识别inputSaved。

中途联合tsc的Window在建B文件及root自有新测试错误已各原属主修复，Core没有越改其源码/测试；原阶段日志不作为最终pass。最终批准manifest的13份设计重新复算全匹配，无批准资料、.env或目标p-limit成果改写。

## 下游状态与限制

PM可按此候选释放三适配器/编排/Window/UI接线，当前API已写入[公开说明](../../api-spec.md)。root早期A/C独验已证实际Core事实，但其Window display与boundary/receipt显示失败属于尚未接线的消费依赖，留作完整集成的原红，不由本角色代修。

不承诺跨文件事务、多进程exactly-once、崩溃自动发送队列、通用日志修复或所有未知秘密DLP。新C仅对可信交接的ANS/IPC显示副本保护，SDK原文、普通chat及旧/native转录不被泛清；原shell收集器仍是既有软阈值。无自动commit/push或部署。整合与独立真实桌面结果由PM和测试角色另行回交。
