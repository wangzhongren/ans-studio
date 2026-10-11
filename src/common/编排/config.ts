// src/common/编排/config.ts
// 编排角色的共享常量与配置取值。
//
// 契约 §6：默认演示配置（projectRoot / skillRoot / roles / 任务 scope）属**配置数据**，
// 其**单一来源**在装配入口（src/index.ts）——装配经冻结签名 runRoleCommand(argv, deps)
// 的**超集字段** deps.project / deps.scope 以纯值注入。编排**不自备**第二份演示配置副本：
// 有注入即用注入值，缺注入即以清晰错误结束（见 requireProjectConfig / requireTaskScope
// 与 src/interface/cli/run.ts），避免 doctor 显示装配那份、role run 实际生效另一份的分裂。

import type { ProjectConfig } from "../../model/role.ts";
import type { TaskScope } from "../../model/decision.ts";

// 注：治理会话（ans govern）**不再**用固定常量表示治理角色——其主体是**内置治理角色**，id 由门禁引擎的
// `listProject` 枚举（`builtIn===true`）得到（见 pipeline/orchestration/govern-session.ts）。编排**不硬编码**
// 引擎常量 "su"（权限以数据表达）。旧版此处曾定义 `GOVERNANCE_ROLE_ID = "门禁引擎"`（已被上述机制取代、删除）。

// 从注入的 deps 取 project；缺注入即抛清晰错误。
// 编排**不**回退到演示配置副本——配置数据单一来源在装配（契约 §6）。
export function requireProjectConfig(value: ProjectConfig | undefined): ProjectConfig {
  if (!value) {
    throw new Error(
      "缺少 project 配置：runRoleCommand 需由装配入口经 deps.project 注入默认演示配置" +
        "（编排不持有配置副本；契约 §6 配置数据单一来源在装配）。"
    );
  }
  return value;
}

// 从注入的 deps 取任务 scope；缺注入即抛清晰错误。
export function requireTaskScope(value: TaskScope | undefined): TaskScope {
  if (!value) {
    throw new Error(
      "缺少 scope 配置：runRoleCommand 需由装配入口经 deps.scope 注入任务写集" +
        "（编排不持有配置副本；契约 §6 配置数据单一来源在装配）。"
    );
  }
  return value;
}
