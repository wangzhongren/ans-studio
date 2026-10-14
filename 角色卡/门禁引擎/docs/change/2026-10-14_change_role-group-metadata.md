---
id: gate-role-group-metadata-change
type: change
title: 项目角色结果带回角色卡声明的协作组
created: "2026-10-14"
updated: "2026-10-14"
timezone: Asia/Shanghai
status: verified
related: [gate-role-group-metadata, gate-role-group-metadata-design, multi-runtime-integration-v2]
events:
  - date: "2026-10-14"
    kind: implemented
    summary: 共享类型与两处角色解析结果透传可选组字段
  - date: "2026-10-14"
    kind: verified
    summary: 新公开契约测试、门禁全套和完整类型检查通过
---

# 项目角色结果带回角色卡声明的协作组

桌面导入项目时，门禁引擎以前只返回角色卡正文和边界；现在 `listProject` 的角色摘要带回卡中声明的 `group` / `groupDuty`。按 id 开启角色前的 `resolveRole` 也返回同源信息，桌面消费方无需自己解析正文。

当前功能及完整过程见[读取角色协作组摘要](../feature/role-group-metadata.md)，设计来源见[同范围设计](../design/2026-10-14_design_role-group-metadata.md)与项目管理 [ANS-RUNTIME-V2 revision 1](../../../项目管理/docs/design/2026-10-14_design_multi-runtime-integration.md)。该必要范围已有客户实施授权，项目管理核对了本角色独立设计。

## 前后差别与代码位置

- [`src/model/role.ts`](../../../../src/model/role.ts) 新增单一共享 `RoleGroupMetadata`，`ResolvedRole` 继承可选只读字符串；既有替身可继续省略字段。
- [`resolveRole` 与 `listProject`](../../../../src/service/role/resolve-role.ts) 从已读取的角色卡正文调用同一[私有解析器](../../../../src/common/门禁引擎/role-card-metadata.ts)，在原结果中透传存在的值。
- 旧卡缺值时不增加属性、不新增 warning。运行时核心、Pi/Codex/Claude 适配器的实际组卡以及项目管理已有声明如实返回；归档角色仍不可见/不可开启，内置角色仍无组字段。

只有独立字段行会成为组信息，第一条非空值生效，首尾空白去掉，未知组名/职责和 HTML 字符原样返回。它们不改变边界、角色 kind、接受来源或写权。没有修改 gate、边界、角色卡、构建配置或他人源码。桌面映射和渲染由对应属主完成，本角色未验证该界面路径。

## 当前候选与检查

验证环境为 2026-10-14、macOS/arm64、Node `v24.14.0`，已有安装依赖；HEAD 为 `906abd3ee275cba82b2f9e54ceef1cd9473c2d5c`，与其他属主并行工作区一起验证，没有真实模型或认证调用。静态核对写集均在已授权 Section 1；新增依赖仅 Service → 本角色私有纯解析器 → Model，无新跨角色私有依赖。

下列四个源码/测试文件构成本角色可复核候选。将每行 `路径<TAB>sha256` 加换行按表顺序拼接后计算 SHA-256，组合候选为 `d9bd2a97bcfd47f658974cc626564557260112e1f26495febdaec12fc61803e8`。

| 文件 | SHA-256 |
| --- | --- |
| `src/model/role.ts` | `5b41531de6e01fb93781a03127b2d54e1ca863687bc41b4b202c65bc2817f616` |
| `src/service/role/resolve-role.ts` | `5e2d4d7e21c8dcbc6cc60b45f135c85f31d64e9a37efb207134de053a23b5ef5` |
| `src/common/门禁引擎/role-card-metadata.ts` | `16d24d35e4568e2212f751b567aa40b2d636dd7e84aafc8f23fcc2de212e7f96` |
| `test/门禁引擎/role-group-metadata.test.ts` | `88bdf2b4e31992753e9ae135d48a78e28e5dc612fabe5f3ea91b559925e371fc` |

| 命令 | 当前结果 |
| --- | --- |
| `node --test test/门禁引擎/role-group-metadata.test.ts` | exit 0；8 通过、0 失败 |
| `node --test "test/门禁引擎/**/*.test.ts"` | exit 0；169 个用例、168 通过、0 失败、1 跳过 |
| `npm run typecheck` | exit 0；完整 src/test/app 检查通过 |
| `git diff --check -- src/model/role.ts src/service/role/resolve-role.ts` | exit 0 |

唯一跳过是既有“Windows 大小写不敏感”用例，仅适用 win32；同环境基线也是 1 跳过。此前门禁基线 161 个用例、160 通过、0 失败，本次增加 8 个公开入口用例，既有断言保持原样。类型检查只出现现有 npm 镜像配置提示，没有 TypeScript 错误。

用例验证实际项目 13 个活角色、4 份运行时组卡、项目管理既有组声明、无组旧卡/内置、重复与空字段、单字段、英文模板、未知字符串、JSON 保真、组长声明不变更 `resolveWrite` 结果，以及带组信息的归档卡静默排除/拒绝开启。首次自测发现两项自有夹具前提错误：误把已有项目管理卡视作无组、未使用既有接受配置加载项目边界；纠正为实际声明的正向断言和真实接受契约后通过，没有放松断言或修改权限逻辑。

本角色未跑全仓完整回归，也未证明桌面呈现。Model/Service 变更使消费方旧证据需刷新；已把实际字段和 API 交给项目管理，后续由桌面窗口、桌面UI与固定测试属主补齐各自链路。
