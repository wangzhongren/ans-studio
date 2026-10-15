// Public ANS JSON Schema and descriptions. No SDK imports. Owner: 运行时核心.
/** describeTool 的返回：Pi 侧参数 schema、说明与可选的提示/执行模式（均按工具名分派）。 */
export interface ToolDescription {
  parameters: Record<string, unknown>;
  description: string;
  /** 仅该工具激活时进系统提示的准则条目（SDK types.d.ts:455-456 的 promptGuidelines）。 */
  promptGuidelines?: string[];
  /** 每工具执行模式覆盖（SDK types.d.ts:497-499）：交互工具 = "sequential"（设计 A-6）。 */
  executionMode?: "sequential" | "parallel";
}

/**
 * 每个受治理工具的 JSON-Schema 与说明（按名分派；run_shell 的 input 是 `{command}`，**没有 path**，见 §7.7）。
 * run_shell **不接受**任何 token 参数——票据机制已废（§7.1 第 3 条），审核在 execute 内、spawn 之前完成。
 *
 * 导出供**接线实测**使用（test/pi-adapter 的 executionMode/交互工具用例；本函数不调 SDK、纯数据）。
 */
export function describeTool(name: string): ToolDescription {
  if (name === "run_shell") {
    return {
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "One program and its arguments, reviewed before execution as argv without a shell. Shell operators (&&, ;, |, redirection), variable expansion and command substitution are not interpreted. Use separate tool calls for multiple commands." },
        },
        required: ["command"],
        additionalProperties: true,
      },
      description: "受治理的程序执行工具。每次调用只执行一个程序及其参数，按 argv 直接启动，不经 shell。`&&`、`;`、`|`、重定向、变量展开和命令替换不会按 shell 语法执行；多条命令请分开调用。执行前必须过 ShellGate 审核；未获明确 allow 绝不执行。",
    };
  }
  if (name === "request_confirmation") {
    // 交互工具族（设计 A-1/A-2）：请求客户确认（可带预览——如角色卡 + 边界摘要）。
    // 已授权项目任务可推进；扩张治理边界仍须客户确认。
    // executionMode:"sequential"（A-6）：防止同批的 write_file 抢跑于确认（Pi 缺省同批并行执行工具）。
    return {
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "One-line summary of what you ask the customer to confirm" },
          preview: {
            type: "string",
            description:
              "Optional full content shown to the customer (e.g. the complete role card + boundary summary) so they can review before agreeing",
          },
          detail: { type: "string", description: "Optional extra detail shown with the request" },
        },
        required: ["title"],
        additionalProperties: true,
      },
      description:
        "向客户请求确认并**挂起等待其回应**（前端渲染成交互卡）。已接受项目边界内、已授权任务的普通操作无需逐次确认。" +
        "真正新建或扩张角色边界、治理写集时，须由 su 把变更呈给客户确认（角色卡全文与边界摘要放进 preview），" +
        "仅当返回「客户已确认」时才落盘。未获同意（拒绝/超时/通道不可用）→ **不要写盘**，如实告知客户，不得假设同意。" +
        "**preview 必须列出将要写出的具体路径**（项目内相对路径，如 `角色卡/示例/role-card.md`）——写盘许可依 preview 所列路径发行；" +
        "**未列出的路径不会获得许可，写入会被门禁拒绝**。注意：列出路径**不等于**获准——获准的唯一凭据是 `confirmed:true`。",
      promptGuidelines: [
        "已接受项目边界内、已授权任务的普通写入和检查无需逐次确认；新建或扩张角色边界、治理写集须由 su 经 request_confirmation 取得客户的**明确同意**。未获该变更同意 → 不执行治理变更，不得假设同意。",
        "新建角色或扩张角色边界时：先把**角色卡全文 + 边界摘要**放进 request_confirmation 的 preview 请客户预览，同意后才写入治理变更。",
        "request_confirmation 的 preview **必须列出将要写出的具体路径**（每个待写文件一行，相对项目根、含目录，如 " +
          "`角色卡/示例/role-card.md`）——系统只对 preview 中**列出过**的路径发行写盘许可；**未列出的路径会被门禁拒绝**。" +
          "列出路径只是「已让客户看到要写什么」，**不等于获准**——是否获准**只看**返回的 `confirmed:true`。",
      ],
      executionMode: "sequential",
    };
  }
  if (name === "request_choice") {
    // 交互工具族（设计 A-1/A-2）：请求客户单选/多选（勾选）。同样 sequential（A-6）。
    return {
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short heading of the choice you ask the customer to make" },
          question: { type: "string", description: "Optional question text" },
          options: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable option id returned in the selection" },
                label: { type: "string", description: "Text shown to the customer" },
                description: { type: "string", description: "Optional extra explanation" },
              },
              required: ["id", "label"],
              additionalProperties: true,
            },
            description: "Non-empty list of options; each id must be unique within this request",
          },
          multiple: { type: "boolean", description: "true = multi-select (checkboxes); default false = single-select" },
          preview: { type: "string", description: "Optional preview content shown to the customer (markdown)" },
        },
        required: ["title", "options"],
        additionalProperties: true,
      },
      description:
        "向客户请求选择（单选或多选勾选）并**挂起等待其回应**（前端渲染成交互卡）。" +
        "返回客户已选中的选项 id。**未获明确选择（拒绝/超时/通道不可用）→ 不要据此写盘，也不得擅自代选**；如实告知客户。" +
        "若 preview 里展示将要写出的内容，**必须列出具体路径**（相对项目根、含目录）——但注意：" +
        "**选择≠写盘同意**或扩张写权。已接受项目边界内的已授权任务无需重复确认；真正新建或扩张角色边界、治理写集仍由 su 请求客户确认，仅 confirmed:true 才执行该治理变更。",
      promptGuidelines: [
        "需要客户在若干选项中做选择时用 request_choice；未获明确回答 → 不要据此写盘，也不得假设客户的选择。",
        "request_choice 的回答**不构成写盘同意**或扩张写权；已接受边界内的已授权任务无需重复确认，新建或扩张角色边界、治理写集仍由 su 经 request_confirmation 请求确认。",
      ],
      executionMode: "sequential",
    };
  }
  if (name === "submit_report") {
    // 交报告工具（设计 C-1）：无 path、无写权；说明写死「完成/确认无法完成时**必须**交报告，
    // 不得只在正文里说」，并**不得**暗示它有写权或改变写盘权限（它不写盘、不做治理判定）。
    return {
      parameters: {
        type: "object",
        properties: {
          status: {
            type: "string",
            enum: ["completed", "blocked"],
            description: "completed = this turn's task is done; blocked = you have confirmed it cannot be done",
          },
          summary: {
            type: "string",
            description: "Your own one-paragraph report of what you changed / produced (honest)",
          },
          evidence: {
            type: "array",
            items: {
              type: "string",
              description: "One piece of evidence: an artifact path, a change, or a test conclusion",
            },
            description: "Key evidence: artifact paths / changes / test results",
          },
        },
        required: ["status", "summary"],
        additionalProperties: true,
      },
      description:
        "向编排交回本轮任务报告（**回交给 su 汇总**，前端渲染成回交卡）。" +
        "**本轮任务完成——或你确认无法完成——时，必须先调用本工具交回报告**：`summary` 用一句话写清" +
        "**改了什么 / 产出了什么**，`evidence` 逐条给关键证据（产物路径 / 变更 / 测试结论）。" +
        "**不得只在正文里说而不交报告**。本工具**不写盘、不做治理判定、不改变任何写盘权限**——" +
        "写入仍须经 write_file/edit_file 与门禁；它只是把你写好的报告交回。",
      promptGuidelines: [
        "本轮任务完成前（或你确认无法完成时），**必须**调用 submit_report 交回报告：" +
          "一句话结论 + 改了哪些文件 / 产出了什么 + 关键证据（产物路径、变更、测试结论）。**不得只在正文里说而不交报告**。",
        "submit_report 只是**交报告**的通道：它不写盘、不做治理判定，也**不改变你的写盘权限**——" +
          "写入仍须经 write_file / edit_file 过门禁；报告内容要如实（做没做、通过没通过，照实写）。",
      ],
    };
  }
  if (name === "dispatch_task") {
    // 派发任务工具（设计 H-1，只给 su）：无 path、无写权。文案写死三条——派发≠授权 / 任务自足 / 返工带证据。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Target project role id (must be a project role, not su itself)" },
          task: {
            type: "string",
            description:
              "Self-contained task text: what to do, which document to follow, and the acceptance criteria " +
              "(the target role cannot see your context); for rework, restate the requirements and include the evidence",
          },
          reason: { type: "string", description: "Optional: why you are dispatching this task" },
        },
        required: ["roleId", "task"],
        additionalProperties: true,
      },
      description:
        "向目标角色**派发任务**（经编排路由成对方会话的一条输入；前端负责自动开会话/排队/去重）。" +
        "**派发 ≠ 授权**——你只能转移「任务与上下文」，**不能**授予或改变对方的写权：对方写入仍只来自它自己的" +
        "已接受边界和已授权任务；普通操作无需逐次确认，新建或扩张边界、治理写集仍由 su 请求客户确认。任务文本必须**自足**（对方看不到你的上下文）：" +
        "写清要做什么、依据哪份文档、完成标准；**返工**时把要求与证据一并写进任务文本。" +
        "roleId 必须是本项目角色（不能是你 su 自己）；本工具**不写盘、不做治理判定、不改变任何角色的写权**。",
      promptGuidelines: [
        "派发的是**任务与上下文**；**派发 ≠ 授权**——目标角色只在自己的已接受边界内执行已授权任务，普通操作无需逐次确认；" +
          "不得在任务文本里代授写权；真正新建或扩张边界、治理写集仍由 su 请求客户确认。",
        "dispatch_task 的任务文本要**自足**：目标角色看不到你的上下文——写清要做什么、依据哪份文档、完成标准。",
        "返工时把**要求与证据**一并写进任务文本（复述返工要求 + 相关证据/路径），避免对方凭猜返工。",
      ],
    };
  }
  if (name === "report_shell_verdict") {
    // 审读结论工具（R-1，只给审读会话）：结构化结论（三值枚举）；**不得**暗示它授予任何权限。
    return {
      parameters: {
        type: "object",
        properties: {
          verdict: {
            type: "string",
            enum: ["allow", "deny", "unsure"],
            description:
              "allow = allow execution; deny = deny; unsure = not sure (the existing gate chain decides how to escalate)",
          },
          reason: { type: "string", description: "Optional short reason (for audit/display)" },
        },
        required: ["verdict"],
        additionalProperties: true,
      },
      description:
        "交回对当前 shell 命令的**结构化审读结论**（结论以**本工具调用**为准——**不要**只在正文里写结论）。" +
        "**本工具本身不执行、不放行任何命令，也不改变任何权限**：它只是把你的结论（allow / deny / unsure）" +
        "交给编排，由既有审读链决定后续（unsure 按其既有规则升级）。verdict 三值之一必填；理由可选。",
      promptGuidelines: [
        "审读结论**必须**以 report_shell_verdict 工具调用交回（verdict: allow / deny / unsure）；在正文里写结论不算数。",
        "本工具不授予任何权限、也不构成对任何命令的放行——它只记录你给出的结论；实际放行由编排的既有审读链决定。",
      ],
    };
  }
  if (!["write_file", "edit_file", "read_file"].includes(name)) throw new Error(`未知 ANS 工具：${name}`);
  const parameters = {
    type: "object",
    properties: {
      path: { type: "string", description: "Target file path (relative or absolute)" },
      content: { type: "string", description: "Content to write (write_file)" },
      old_string: { type: "string", description: "Text to replace (edit_file)" },
      new_string: { type: "string", description: "Replacement text (edit_file)" },
    },
    required: name === "write_file" ? ["path", "content"] : name === "edit_file" ? ["path", "old_string", "new_string"] : ["path"],
    additionalProperties: true,
  };
  const description =
    name === "write_file"
      ? "受治理的文件写入工具。写入前会向门禁引擎请求判定；被拒绝时不落盘。"
      : name === "edit_file"
        ? "受治理的文件编辑工具。编辑前会向门禁引擎请求判定；被拒绝时不落盘。"
        : "读取文件内容。读取不受写边界约束（写边界只约束「能否改」，不约束「能否看」）。";
  // executionMode（设计 W-1，真机「同轮丢写」修复）：
  // Pi **缺省同批并行**执行工具（pi-agent-core agent.js:145，A-6 已实测；批级规则：任一工具为
  // sequential ⇒ 整批顺序执行）。`write_file`/`edit_file` 具**读改写竞态**（尤其 edit = 读→改→写）：
  // 同批对同一文件 write+edit（或两次 edit）并行时，后者的读发生在先前写落盘之前 ⇒ 结果被覆盖=**丢写**
  // （离线 A/B 复现：无本字段时 5/5 丢；加后 5/5 全保）。故写类工具一律钉 sequential。
  // `read_file` **不加**：纯读无写可竞争；且「读+写/编辑」混批已因写类工具 sequential 而**整批顺序**
  // （批级规则），单独加它只影响纯读批（无意义），反增串行开销。
  const executionMode = name === "write_file" || name === "edit_file" ? ("sequential" as const) : undefined;
  return { parameters, description, ...(executionMode !== undefined ? { executionMode } : {}) };
}
