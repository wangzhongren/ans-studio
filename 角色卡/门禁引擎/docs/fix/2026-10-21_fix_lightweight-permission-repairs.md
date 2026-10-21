# 轻量修复真实写入目标与显式命令免审批

日期：2026-10-21。角色：门禁引擎。状态：D3 R1/R2/R3 已实现并完成窄测；跨角色集成和独立验收待其属主提供。

本记录落实客户已确认并要求实施的 [ANS-PERMISSION-REPAIR D3](../../../项目管理/docs/design/2026-10-21_design_permission-boundary-repairs.md)。统筹已通知“标准已就绪，开始实施”，依据[独立验收标准](../../../独立验收/docs/design/2026-10-21_design_d3-acceptance-criteria.md)完成本角色工作；本记录不代替独立验收结论。用户后续排除 UI 实施，不影响本角色范围。

## 问题与原因

角色只有 `allowed/` 写权时，其中的目录链接可以把写入导向未授权的 `private/`。`resolveWrite` 已验证真实目标未离开受治理根，却仍只使用输入路径检查角色边界和任务写集。

显式 `./cat` 等程序会被 `programName` 取 basename 后命中只读白名单；`rg --pre helper` 能启动预处理程序，也仍被整体判为只读。本轮只处理 D3 选定的显式入口，保留裸命令 PATH、隐式配置、环境预加载和恶意并发替换的已声明剩余风险。

## 精确实施范围

本角色生产与测试写集：

- `src/service/gate/resolve-write.ts`
- `src/common/门禁引擎/classify-shell.ts`
- `test/门禁引擎/resolve-write.test.ts`
- `test/门禁引擎/classify-shell.test.ts`

追加精确授权：统筹针对当前治理变更授权 `test/门禁引擎/role-group-metadata.test.ts`，角色数量从 13 更新为 14，并新增独立验收只含六项自身工作文档的精确断言。运行时组和归档断言保留，不改变生产解析逻辑。

本角色必要文档写集：本记录、[文件写入授权](../feature/write-authorization.md)、[命令分类](../feature/shell-classification.md)、`角色卡/门禁引擎/feature-map.md`、`角色卡/门禁引擎/api-spec.md`、`角色卡/门禁引擎/memo.md`。当前流程、导航和接口说明已同步。

不需要新增生产辅助文件。rg 参数小辅助留在既有私有分类文件中。不改 Model、公开再导出、运行时核心、编排、共享路径原语、角色卡、边界或 changelog；不提交 Git。

## 已实施行为

### R1：同一根内分别授权输入与真实目标

保留接受证据、根归属及根外逃逸前置检查。复用原有相对路径判定规则，分别检查输入相对路径和真实目标相对于其所属真实根的路径：两者都必须命中该根的有效角色边界；scope 存在时，两者都必须精确命中同一任务 writeSet。project 与 skill 根均适用，条件目录也分别检查。

不解析边界条目以扩大其授权。没有路径变化时继续原判定与原拒绝文案；真实目标额外拒绝时明确标注输入、实际目标与失败原因。保留原 F4/F6 兼容文案和旧快照线索，不自动补发写权。核心写前复核由核心角色调用相同门禁完成，本角色不复制落盘逻辑。

### R2：只收紧原 allow 候选

复用现有程序 token 去引号，识别正反斜杠路径、Windows 盘符绝对或相对路径和 `.cmd/.bat/.ps1` 后缀。仅在原本会返回 allow 的位置增加资格复核，失格返回带明确 reason/ruleId 的 review。包含窄只读 re-shell 的原 allow 分支；不把原 deny/risky 改成 review。裸 `.exe` 及其他原有命令分类保持。

### R3：识别显式 rg 预处理参数

只将参数位置上的 `--pre`、`--pre=...` 原 allow 候选改为 review。识别 `--` 结束选项及 `-e`/`--regexp` 等带值选项，不把其模式文本或结束选项后的路径当成预处理选项；含该文本的普通参数不按子串命中。必要的参数消耗表仅服务该项识别，不引入通用 shell 解析器、文件系统读取或新公共类型。

分类返回四态契约不变；审计与各档审批由编排原逻辑处理。明确批准后仍按既有执行机制运行，不宣称 shell 文件副作用受 write_file 边界控制。

## 验证计划

先运行 `node --test test/门禁引擎/resolve-write.test.ts test/门禁引擎/classify-shell.test.ts`。随后运行本角色测试目录与 `npm run typecheck`，必要时按统筹安排运行相关编排回归，不并发运行全量测试。

- 写路径：project/skill 各自的根内链接越界、新建尾部、已存在文件、仅词法路径在 writeSet、仅真实路径在 writeSet、两处完全授权、真实目标条件未激活、合法链接根和原根外逃逸。
- shell：相对/绝对/Windows 盘符相对/UNC 路径；脚本后缀；裸 `.exe`；原 deny/risky 不能降级；窄 re-shell 白名单原有行为。
- rg：两个显式预处理形式；`--` 后文件；`-e`/`--regexp` 模式值；包含文字的普通模式；普通搜索保持原基线。
- 各审批模式和真实 handler 的文件副作用由固定测试角色联调，不以纯分类测试冒充端到端验证。

## 实际结果

环境：macOS arm64、Node v24.14.0、npm 11.9.0；HEAD 为 `fc1a39c14e119faccf442fc8e22bbbbd978d1a04`，本轮为未提交工作区差异，不能仅凭 HEAD 识别候选。原始临时日志可能被系统清理，交接时附源码/测试摘要。

- `node --test test/门禁引擎/resolve-write.test.ts test/门禁引擎/classify-shell.test.ts`：80 项，79 通过、0 失败、1 Windows 大小写专属跳过。日志 `/tmp/ans-d3-gate-narrow.log`。
- `npm run typecheck`：exit 0；只有既有 npm 用户配置警告。日志 `/tmp/ans-d3-gate-typecheck.log`。
- `node --test test/门禁引擎/*.test.ts` 初跑：298 项，295 通过、2 失败、1 跳过，exit 1。日志 `/tmp/ans-d3-gate-role.log`。失败来自实际角色增加到 14 但旧测试仍断言 13，以及治理改动使运行时核心的展示 `groupDuty` 缺失；未修改失败断言来掩盖差异。
- 获精确追加测试授权后，角色数量及独立验收边界断言已更新。首次定向运行还发现新增断言使用了未规范化的目录尾斜杠，按解析器公开输出改为无尾斜杠，保留六项精确匹配；原始失败日志 `/tmp/ans-d3-gate-metadata.log`。组字段断言保持，等待团队组建恢复元数据后复测。
- 最终候选窄测再次运行：80 项、79 过、0 失败、1 Windows 跳过，exit 0，约 93 ms；日志 `/tmp/ans-d3-gate-narrow-final.log`。追加边界断言按 `node --test --test-name-pattern='新增独立验收' test/门禁引擎/role-group-metadata.test.ts` 独立验证：1/1 通过，exit 0，约 108 ms；日志 `/tmp/ans-d3-gate-metadata-boundary.log`。
- 追加测试后的 `npm run typecheck` exit 0，日志 `/tmp/ans-d3-gate-typecheck-final.log`；授权路径的 `git diff --check` exit 0。

最终候选源码/测试 SHA-256（文档不参与行为身份）：

| 文件 | SHA-256 |
| --- | --- |
| `src/service/gate/resolve-write.ts` | `e662417ad0dd331d7b818b5b4783499df3134c887541c0688059ae0f6599ca35` |
| `src/common/门禁引擎/classify-shell.ts` | `65706e7d26bb1b99f59e2a9eafbf993a2b16a782b510fa68d5b36ee7a9126163` |
| `test/门禁引擎/resolve-write.test.ts` | `96750ddfa97f6d8bbf07ec7a29392a2756a0577a12c635121399a77e6cf28cbd` |
| `test/门禁引擎/classify-shell.test.ts` | `c0a0edcb58e1c9763806e24a319dc132fd928ba86d8b3bbd7d0b4e761b24360a` |
| `test/门禁引擎/role-group-metadata.test.ts` | `09e6090cd032e1ad1d0da16a8b3bb589c3c45c22d8fe572a1777fa7a051a9fc0` |

源代码仅两个锁定文件变化，无新 import、无 Model 或公开签名变化；rg 小辅助仍在角色私有文件内。没有修改治理文件、共享实现或其他角色文件，没有运行全量测试、没有提交或发布。Windows 原生 junction 和各审批模式真实执行副作用仍须由对应测试角色提供，不以本角色单测替代。
