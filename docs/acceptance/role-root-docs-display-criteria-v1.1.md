# 验收完成标准修订：角色根文档在详情面板展示（role-root-docs-display，T2）——标准 v1.1（P5 POSIX 子项按客户范围收窄）

- 任务 ID：`2026-10-23-role-root-docs-display`
- 产品 flowId：`role-root-docs-display`
- 风险档位：**T2（跨角色/接口/契约变更）**；目标版本 **v1.7.0**
- 标准版本：**v1.1**；日期：**2026-10-24**
- 性质：**对标准 v1 的修订（amendment）**，不重写 v1。v1 原文保留为历史标准：`docs/acceptance/role-root-docs-display-criteria-v1.md`（**784 行**；SHA-256 `12981ed44ee1786d4a73d9441b823075b6ed88a23ae10b95d928afb225f6efcb`；blob `c0239c051be301c96aa07df1ab33ffc12cbbad33`）。本文件只修订 P5 的 POSIX 实读子项；P1–P4、P6–P10、G1/G2 与 P5 的 Windows 子项仍按 v1 原文执行。
- 判定依据：客户范围收窄确认记录 `docs/communication/2026-10-23_intent_role-root-docs-display.md` 的「范围收窄确认（2026-10-24）」（当前 **94 行**；SHA-256 `0cefaf94ac172ad347b33f6015ee98c1ab65f696bc29f5ab9f53636dd431acb5`；blob `46fcac1963a26e18d9ba8c41dd804c16ff189e56`）+ 同记录闸门 0/1/2 与实施授权 + 客户闸门 1 确认的方案 v1（1023 行；SHA-256 `9b69a786…`）+ 标准 v1 + 技能 `references/testing.md` 的 T2 定义。
- 客户原话：「确认 v1.7.0 范围为 Windows 只列名，POSIX 正文实读留待后续；请更新标准/验收按此重判 P5。」
- 候选：分支 `v1.7.0-work`，HEAD `d64590f35c0531d0e41acd1be32be9f415a06a2b`（tree `6bb0d018cdf9983d96016f75b977d594aee26b69`；父提交 `6407d637…`）；17 个产品/测试候选（15 改 + 2 新增）；整体清单 `f2decbb95ff1e9ca24deb1da9fd00de699e3b7e4377a6bdcec7b4b4eaba8e288`。
- 标准状态：**v1.1 已写盘；不是验收报告，不预判通过/返工/证据不足**。验收结论只写在另写的 `docs/acceptance/role-root-docs-display-report-v1.1.md`。

---

## 一、修订原因与范围

### 1.1 客户确认的范围收窄

客户于 2026-10-24 确认：

> 确认 v1.7.0 范围为 Windows 只列名，POSIX 正文实读留待后续；请更新标准/验收按此重判 P5。

对应口径（沟通记录同节）：

- v1.7.0 只验收 Windows 上“列出三个根文档文件名 + 点开显示既有 `UNSUPPORTED_ENVIRONMENT` 结构化提示、不读正文/不建 scope/不铸 refs”。
- **POSIX（macOS/Linux）正文实读不在本轮范围**，留待后续独立变更。
- 不伪造 POSIX 证据，也不把 Windows 结果冒充 POSIX 可读。
- 不改代码/测试/候选；只更新验收标准与报告版本；独立验收按当前候选 `d64590f` 重判 P5。

### 1.2 修订边界

- **只修订 P5 的 POSIX 实读子项**：由 v1 的“必须执行/无环境则 insufficient evidence”改为“本轮 **N/A/延后**（客户书面收窄范围）”。
- **不修改** P5 的 Windows 子项：仍要求 Windows 实测“列名 + 既有 `UNSUPPORTED_ENVIRONMENT` + 不读字节/不建 scope/不铸 refs + fixture 字节/mtime 不变”。
- **不修改** P1–P4、P6–P10、G1/G2：仍按 v1 原文执行；v1 的验收表、证据要求、判定规则、成功/失败边界继续有效。
- **不改变**方案 v1、团队计划 v1、候选代码/测试、角色卡/边界、T2 档位；不新增产品要求，不弱化 Windows fail-closed，不把 POSIX 结果写成已读。
- 后续如客户要求恢复 POSIX 正文实读/符号链接/竞态验证，须另立标准版本（v1.2+）或独立变更标准/报告，不能沿用本 v1.1 的 N/A 结论，也不得用 Windows 结果替代。

---

## 二、修订后的 P5

### 2.1 P5 标准（v1.1）

1. **Windows（本轮必须）**：索引仍可列出实际存在的三个根文档文件名；点击后 `DocumentView` 显示既有“当前环境暂不支持安全读取项目文档”（`UNSUPPORTED_ENVIRONMENT`）结构化提示；不建立 scope、不铸造 refs、不返回正文/不读字节；fixture 字节/mtime 前后不变；不伪造正文、不把错误吞成空成功。
2. **POSIX（本轮 N/A/延后）**：macOS/Linux 真实正文读取、`byteLength`、只读且不改 mtime、`not-applicable` 普通文本、符号链接/根替换/竞态错误码，**不在 v1.7.0 验收范围**，标记为 `not applicable`（依据：客户 2026-10-24 书面范围收窄确认）。不要求本轮执行，也不以 Windows 结果替代；后续变更另立标准/验收。
3. **分平台诚实**：Windows 与 POSIX 证据仍分开记录；本轮不得声称“全平台正文可读”，不得把 Windows 列名/文件存在当 POSIX 实读；POSIX 的 N/A 只表示“本轮不做”，不是“已验证可读”。
4. **Provider 零改动**：`src/provider/project-document/**` 仍零改动；不新增 Windows 读取路径/旁路/第二次内容来源；不把本变更升 T3。

### 2.2 P5 判定

- **pass**：Windows 子项按 §2.1.1 实测通过，且 POSIX 子项按客户确认记录为 `not applicable`（N/A 依据写入报告）；无伪造/合并/替代。
- **fail**：Windows 声称可读/返回正文/建立 scope/铸造 refs；旁路读取/吞错误；修改 Provider/放宽安全；把 POSIX N/A 写成“可读/已验证”；用 Windows 结果替代 POSIX 实读。
- **insufficient evidence**：Windows fail-closed 缺失，或 N/A 无客户书面依据；仅给 Windows“文件存在/列名”而无结构化错误/字节/mtime 断言。
- POSIX 的 N/A **不**使 P5 成为 insufficient evidence；这是客户明确收窄本轮范围的结果，与“无环境且未收窄”不同。

---

## 三、其余标准与判定规则

- P1–P4、P6–P10、G1/G2 的条目、最低证据、判定与失败/证据不足条件**完全沿用标准 v1**（§3.2–§3.13、§五、§六、§七），不因 v1.1 放宽或加严。
- 报告仍按 v1 §2.1 的四种判断（`pass`/`fail`/`insufficient evidence`/`not applicable`）；v1.1 只新增 P5 POSIX 子项的 N/A 依据。
- 总体结论仍按 v1 §7.2：全部适用行 pass → 通过；任一行 fail → 返工；无 fail 但有 insufficient evidence → 证据不足。v1.1 下 P5 的 POSIX 子项是 N/A，不计入 insufficient evidence。
- 证据复用、失效、Windows/POSIX 分开、候选哈希、S1 基线隔离、管理记录与产品候选分离等规则不变。
- 全量回归仍按 T2：默认 N/A；不得以 N/A 跳过受影响检查、跨层与真实 Electron。

---

## 四、报告与授权

- 验收报告另写 `docs/acceptance/role-root-docs-display-report-v1.1.md`；v1 报告 `docs/acceptance/role-root-docs-display-report-v1.md` 保留为历史，不重写。
- 报告须写清：标准 v1.1、客户范围收窄原话/记录、当前候选 `d64590f`、17 候选哈希、复用的 v1/S6 证据、P5 Windows pass + POSIX N/A、其余行沿用 v1 报告并复核候选未变、残余/证据边界。
- **通过只表示当前候选在标准 v1.1 与 Windows 只列名范围内满足标准**；不授权 commit、push、合并、发布或任何对外操作；不声称 POSIX 正文可读，不声称目标项目已修复/已迁移。

---

**状态声明**：本文件是标准 v1 的修订（v1.1），已写盘冻结；不是验收报告，不判定候选，不授权实施/提交/推送/发布。v1 原文与历史报告保持不变；v1.1 只把 P5 POSIX 实读子项按客户 2026-10-24 范围收窄确认标记为 N/A/延后。
