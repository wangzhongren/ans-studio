# entry-role-minimal 批次 F 变更记录（门禁引擎）

- 日期：2026-10-28｜任务：`2026-10-28-entry-role-minimal`｜批次：F（验收与收尾）｜风险档位：**T3**
- 提交：F 代码/测试 `e008187`。
- 交接材料：`docs/scheduling/2026-10-28-entry-role-minimal-change-F.md`。

## 范围

- `src/common/门禁引擎/governance-roles.ts`（−12 行）：删除 `governanceWriteOwnerGuidance` 的旧 `liaison` boundarySource 来源与过时 `DeprecatedLiaisonRoleSpec` 注释；六角色注册表、写区、能力矩阵、卡文本不变。
- 无运行期行为变化：liaison 在 D 批已不在注册表；本批仅清理 A 批只读别名遗留的指向。

## 验证

- `test/测试/entry-role-minimal-d.test.ts` 5/5（`governanceRoleOf("liaison")=undefined`、工具面不注册）；`test/门禁引擎/list-project.test.ts` 全过（保留 id 目录跳过为旧目录防御，非别名）。
- 规范全量 2908/2878/12/18；`npm run typecheck` exit 0；F-05 `rg` 0 命中。
