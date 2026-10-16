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
    // 2026-10-16 客户裁定（su 写 `docs/su/**` 与 `docs/contracts/**` 免逐次审批；编排预置进 su
    // 会话初始 writeSet、门禁引擎同步 su 卡「确认制要点」）：本工具文案补「唯一例外（仅内置治理
    // 角色 su）——写盘许可已预置、免逐次确认、开会话与重建后均生效」；G-4（2026-10-16 批准）后
    // 预授权再增 `docs/skills/**`、扩为**三棵**（与门禁引擎新卡文本同口径）；其余一切写盘仍逐条
    // 确认，非 su 角色语义不变（例外不做 su 限定即会把普通角色带歪）。
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
        "向客户请求确认并**挂起等待其回应**（前端渲染成交互卡）。已接受项目边界内、已授权任务的**读取与检查**" +
        "无需逐次确认；**写盘一律先经本工具确认**——把将写出的路径列入 preview，客户返回 `confirmed:true` 后系统才为这些路径发行写盘许可。" +
        "**唯一例外（仅内置治理角色 su）**：`docs/su/**`（su 自己的工作笔记）、`docs/contracts/**`（跨角色契约文档）与 `docs/skills/**`（su 给角色安装的技能文档）的写盘许可**已预置**——" +
        "写入这三棵目录树**无需逐次确认**、直接写即可（开会话与重建后均生效）；三棵树之外的一切写盘仍须逐条确认。" +
        "真正新建或扩张角色边界、治理写集时，须由 su 把变更呈给客户确认（角色卡全文与边界摘要放进 preview），" +
        "仅当返回「客户已确认」时才落盘。未获同意（拒绝/超时/通道不可用）→ **不要写盘**，如实告知客户，不得假设同意。" +
        "**preview 必须列出将要写出的具体路径**（项目内相对路径，如 `角色卡/示例/role-card.md`）——写盘许可依 preview 所列路径发行；" +
        "**未列出的路径不会获得许可，写入会被门禁拒绝**。注意：列出路径**不等于**获准——获准的唯一凭据是 `confirmed:true`。",
      promptGuidelines: [
        "已接受项目边界内、已授权任务的**读取与检查**无需逐次确认；**写盘（write_file / edit_file 等）一律先经本工具确认**——" +
          "把将写出的路径逐条列入 preview，客户返回 `confirmed:true` 后系统才会为这些路径发行写盘许可；对话里的口头同意不是凭据。" +
          "**唯一例外（仅内置治理角色 su）**：`docs/su/**`、`docs/contracts/**` 与 `docs/skills/**` 的写盘许可已预置——写这三棵目录树无需逐次确认、直接写即可（开会话与重建后均生效）；三棵树之外的一切写盘仍须逐条确认。" +
          "新建或扩张角色边界、治理写集须由 su 经 request_confirmation 取得客户的**明确同意**。未获该变更同意 → 不执行治理变更，不得假设同意。",
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
        "若本轮产出较长（连续长文本 / 大量工具输出 / 长报告），请在**输出被截断前**优先调用 submit_report 交回简短报告" +
          "（一句话结论 + 关键证据），再继续剩余工作——回复一旦达到输出上限被截断，后续输出（含 submit_report 调用本身）" +
          "会一起丢失，报告将无法交回，只能降级为缺失报告。",
        "submit_report 只是**交报告**的通道：它不写盘、不做治理判定，也**不改变你的写盘权限**——" +
          "写入仍须经 write_file / edit_file 过门禁；报告内容要如实（做没做、通过没通过，照实写）。",
      ],
    };
  }
  if (name === "dispatch_task") {
    // 派发任务工具（设计 H-1，只给 su）：无 path、无写权。文案写死三条——派发≠授权 / 任务自足 / 返工带证据。
    // G-1/A4（设计 2026-10-16_design_contract-workflow-dispatch.md §四；PM 派发 V1 最小闭环 2026-10-16）：
    // 增两条——多角色/跨角色协作「先落盘再派发」（契约 docs/contracts/<name>-v<N>.md、工作流 docs/workflow.md）、
    // 任务文本「按地址引用」（不内嵌契约全文；「必读（按序）」块由投递系统附上、sha256 投递时算，su 不手算/不转抄）。
    // 与门禁引擎 su 卡文本（规划落盘契约/工作流、派发引用地址）同口径；既有必备语义（H-1 三条 + 不代授权 +
    // 反向断言面）逐字保留——test/pi-adapter/dispatch-task.test.ts 与 test/runtime-core/tools.test.ts 双向钉住。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Target project role id (must be a project role, not su itself)" },
          task: {
            type: "string",
            description:
              "Self-contained task text: what to do, which document to follow (give the project path, " +
              "e.g. docs/contracts/<name>-v1.md or docs/workflow.md — don't paste the document's full text; " +
              "the delivery attaches a required-reading block), and the acceptance criteria " +
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
        "多角色/跨角色协作时**先落盘再派发**：先把冻结契约落盘到 `docs/contracts/<name>-v<N>.md`" +
        "（写盘许可已预置、直接写即可），工作流落盘到 `docs/workflow.md`（写盘经确认制：把路径列入规划确认的 preview），**再**派发任务。" +
        "任务文本**按地址引用**契约与工作流——「依据哪份文档」给项目内路径即可（如 `docs/contracts/<name>-v1.md`），**不内嵌契约全文**；" +
        "投递时系统会据此自动附上「**必读（按序）**」块（先读完再动手），其中的 sha256 由投递系统在投递当刻计算——**不要自己算或转抄哈希**。" +
        "引用的契约文件不存在时投递会被**拒绝**（回执如实报错；补落盘后重派）；`docs/workflow.md` 缺失（旧项目过渡期）不拒投、必读块如实标注「未提供」。" +
        "roleId 必须是本项目角色（不能是你 su 自己）；本工具**不写盘、不做治理判定、不改变任何角色的写权**。",
      promptGuidelines: [
        "派发的是**任务与上下文**；**派发 ≠ 授权**——目标角色只在自己的已接受边界内执行已授权任务，普通操作无需逐次确认；" +
          "不得在任务文本里代授写权；真正新建或扩张边界、治理写集仍由 su 请求客户确认。",
        "dispatch_task 的任务文本要**自足**：目标角色看不到你的上下文——写清要做什么、依据哪份文档、完成标准。",
        "**多角色/跨角色协作先落盘再派发**：契约落盘到 `docs/contracts/<name>-v<N>.md`（预置写盘目录、直接写即可）、" +
          "工作流落盘到 `docs/workflow.md`（路径列入规划确认的 preview），**再**派发。" +
          "任务文本**按地址引用**契约与工作流（给项目内路径），**不内嵌契约全文**——投递时系统会自动附上「**必读（按序）**」块并计算其中的 sha256；" +
          "**不要自己算或转抄哈希**。引用的契约文件不存在时投递会被**拒绝**（如实回执），补落盘后重派。",
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
  if (name === "role_status") {
    // 看护只读工具（G-2/R1，只给 su 注入）：读取主进程权威快照的结构化文本。文案纪律：只读/8 KiB 截断如实/
    // 失败不编造/不做任何恢复（「注入才注册」由 tools.ts 结构性保证；本处只写语义与取用口径）。
    // 与设计 §3.3 告警文案口径联动：su 收 `[系统·看护]` 后先核对（role_status→必要时 session_tail），
    // 确认卡死才 propose_recovery（需客户一键确认）。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Optional target role id; omit for a whole-project overview" },
          includeDiagnostics: { type: "boolean", description: "true = also append that role's recent diagnostics tail (≤20 entries; metadata whitelist fields only)" },
        },
        required: [],
        additionalProperties: true,
      },
      description:
        "**只读**状态查询（看护工具，只注入给治理角色 su）：读取本项目**权威状态快照**——各角色忙/闲、" +
        "投递队列积压、会话开合、最近一轮结果、待确认数与看护告警状态；includeDiagnostics=true 时附该角色近日志尾部（≤20 条元数据）。" +
        "**纯读：不写盘、不入队、不改任何状态、不改变任何权限**；本工具本身不做任何恢复。输出为结构化文本，" +
        "超 **8 KiB** 会截断并如实标注 `truncated`；数据不可用（如诊断写盘故障）时如实给出「不可用＋原因」，**绝不编造状态**。",
      promptGuidelines: [
        "roleId 缺省＝全项目概览；给出＝单角色详情。输出超 8 KiB 会被截断（truncated）——需要更多事实时收窄查询。",
        "收到 `[系统·看护]` 告警时：先用 role_status 核对卡点事实（必要时再用 session_tail 看会话尾部），再决定处理——" +
          "告警仅告知、不改变任何判定；仅在确认卡死时提议恢复（propose_recovery，需客户一键确认后由应用执行）。",
      ],
    };
  }
  if (name === "session_tail") {
    // 看护只读工具（G-2/R1，只给 su 注入）：角色会话文件尾部规范化行（受保护投影链上产出）。
    // 文案纪律：只读/脱敏如实（内容可能含此前会话原文要点，已过投影）/行数上限/无历史与读坏如实不猜。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Target role id (required)" },
          lines: { type: "number", description: "How many tail lines to return; default 40, cap 200" },
        },
        required: ["roleId"],
        additionalProperties: true,
      },
      description:
        "**只读**会话尾线（看护工具，只注入给治理角色 su）：返回该角色 ANS 会话文件的**尾部规范化行**" +
        "（每行形如 `<时间> [user|assistant|tool] 一行文本`，超长行截断标注；头部如实给来源文件/总行数/跳过坏行数）。" +
        "内容已经**受保护投影与脱敏管线**（凭据清洗、显示保护）——但仍可能含该角色此前会话原文要点，按排查最小必要读取。" +
        "**纯读：不写盘、不改任何状态、不扩大任何写权**；无会话历史、文件读坏等如实报告，**不抛、不猜、不编造**。" +
        "缺省 40 行、上限 200 行（超上限按上限取并如实标注）。",
      promptGuidelines: [
        "session_tail 只读现有落盘会话的尾部——它不重放、不恢复、不修改任何会话；需要核对某角色近期在做什么时按其尾部按需读取。",
        "行列内容来自受保护投影（已脱敏），但仍是会话原文要点：只用于排查，不要转抄敏感细节，不要据此假设任何写权。",
      ],
    };
  }
  if (name === "propose_recovery") {
    // 恢复提议工具（G-2/R2，只给 su 注入）：只交载荷、如实转达三态回执。文案纪律（沿 dispatch_task 先例）：
    // 提议 ≠ 执行 / 无客户确认＝零执行 / 三态如实（executed/declined/failed）/ 不得承诺 / evidence 必填 /
    // 不放行任何命令、不改变任何权限或写权；动作集恰三值（客户批准，§6.3）。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Target project role id (must be a project role, not su itself)" },
          action: {
            type: "string",
            enum: ["abort-turn", "rebuild-session", "redeliver"],
            description:
              "abort-turn = stop the target's current turn (same as the UI's stop-turn); " +
              "rebuild-session = dispose and reopen the target's session (refused while a turn is running); " +
              "redeliver = retry the target's delivery queue now",
          },
          evidence: { type: "string", description: "Facts supporting the proposal (state snapshot / timeline / session lines); required" },
          reason: { type: "string", description: "Optional: why you propose this recovery" },
          itemId: { type: "string", description: "Optional, redeliver only: the specific queued item id to retry" },
        },
        required: ["roleId", "action", "evidence"],
        additionalProperties: true,
      },
      description:
        "**提议**一次恢复动作（看护工具，只注入给治理角色 su）：把 {roleId, action, evidence} 交给应用路由" +
        "→ 生成**客户一键确认卡** → 客户确认后**由应用执行** → 结果**回执如实**（executed / declined / unsupported / error——后三值一律**未执行**）。" +
        "`action` 恰为三值：`abort-turn`（停止目标角色当前轮次，＝UI「停止本轮」）/ `rebuild-session`（作废并重开其会话；" +
        "在跑轮次不打断、会被拒绝）/ `redeliver`（触发其投递队列立即重试；可用 itemId 指单条）。" +
        "你**只能提议**：**提议 ≠ 执行**——无客户确认＝零执行；本工具**不执行任何动作、不放行任何命令、不改变任何权限或写权**，" +
        "也**不得承诺**执行或其结果。`evidence` **必填**——无证据不提议；仅在确认卡死（据 role_status / session_tail 的核对结论）时提议。" +
        "回执如实转达：executed＝客户已确认且已执行；declined＝未获确认（零执行）；unsupported＝运行时不支持（未执行）；error＝执行失败/前提不满足（未执行）——**未获执行不得当成功**。",
      promptGuidelines: [
        "propose_recovery 只用于**确认卡死**的恢复；提议前先核对（role_status，必要时 session_tail），并把核对结论写进 evidence。",
        "**提议 ≠ 执行**：无客户一键确认＝零执行；不得用本工具承诺任何执行或写权、不得替客户决定、**不得把未获执行当成功**。",
      ],
    };
  }
  if (name === "install_skill") {
    // 技能安装工具（G-4/I1，只给 su 注入；客户 2026-10-16 批准）。文案纪律（沿 dispatch_task 先例）：
    // 仅客户明示时安装（不自主发起）/ 先落盘再激活 / 工具只校验+激活+回执、**不写盘** /
    // **安装不改变任何角色写边界**（技能是必读资料不是权限）/ 失败文案枚举沿产品设计 §3.3
    // （含护栏拒绝 not-customer-turn）/ 不得暗示任何授权。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Target project role id (must be a project role, not su itself)" },
          name: { type: "string", description: "Skill name (stable short slug matching docs/skills/<name>/)" },
        },
        required: ["roleId", "name"],
        additionalProperties: true,
      },
      description:
        "向目标角色**安装技能**（只注入给治理角色 su；激活＝重建目标会话，使其新会话系统提示带「已安装技能」指针）。" +
        "**仅客户明示时安装**——客户在会话中指令你安装才执行；**不得自主发起**；非客户消息发起的轮次调用会被**拒绝**（not-customer-turn：`本动作仅可在客户消息发起的轮次执行——未执行。`）。" +
        "**先落盘再激活**：技能内容与登记先由你经 write_file 落盘到 `docs/skills/<name>/SKILL.md` 与 `docs/skills/<name>/install.md`（登记须含适用角色），**再**调本工具；" +
        "本工具**不写盘、不做治理判定**——只**校验**（登记存在、含目标角色）、**激活**并**如实回执**。" +
        "**安装不改变任何角色的写边界**——技能是必读资料，不是权限；目标角色的写权完全不变。" +
        "回执三态如实：`effective:\"rebuilt\"`＝目标会话已重建、即刻生效；`effective:\"next-session\"`＝目标正在跑轮次、不打断——新会话起生效（如实延迟态，不是错误）；" +
        "失败（`ok:false`）一律**未执行、零副作用**，如实报因（枚举）：技能未登记＝`技能未登记：docs/skills/<name>/install.md 不存在——先落盘再安装；未执行。`；" +
        "登记未含目标角色＝`登记中未包含角色「<roleId>」——未执行；如确要安装请先更新登记。`；角色不存在或为 su 自身＝`角色「<roleId>」不是本项目项目角色（或为治理角色 su）——未执行。`。" +
        "**不得**把失败或延迟说成已生效。",
      promptGuidelines: [
        "安装技能**仅限客户明示**（客户在会话中说「给<角色>装技能<name>」）：不得自主发起、不得把派发/看护等其它轮次的意图当许可；非客户消息发起的轮次会被拒绝（not-customer-turn）。",
        "**先落盘再激活**：先 write_file 落盘 `docs/skills/<name>/SKILL.md`（技能内容）与 `docs/skills/<name>/install.md`（登记，含适用角色），再调 install_skill——本工具只校验/激活/回执，**不写盘**，也不放宽任何写权。",
        "安装**不改变任何角色的写边界**（技能是必读资料，不是权限）；回执如实转达：rebuilt＝已重建、即刻生效；next-session＝在跑不打断、新会话起生效；失败＝未执行、零副作用，如实报因。",
      ],
    };
  }
  if (name === "uninstall_skill") {
    // 技能卸载工具（G-4/I1，只给 su 注入；客户 2026-10-16 批准）。文案纪律：仅客户明示时卸载 /
    // **先改登记再卸载**（防「工具说撤了、登记没变」）/ 工具不写盘 / 文件保留（「效果已撤」与
    // 「文件仍在」如实二分）/ 不改变任何角色写边界 / 失败文案枚举沿 §3.3（含 not-customer-turn 护栏）。
    return {
      parameters: {
        type: "object",
        properties: {
          roleId: { type: "string", description: "Target project role id (must be a project role, not su itself)" },
          name: { type: "string", description: "Skill name (stable short slug matching docs/skills/<name>/)" },
        },
        required: ["roleId", "name"],
        additionalProperties: true,
      },
      description:
        "向目标角色**卸载技能**（只注入给治理角色 su；激活＝重建目标会话，使其新会话系统提示不再带该技能指针）。" +
        "**仅客户明示时卸载**——客户在会话中指令你卸载才执行；**不得自主发起**；非客户消息发起的轮次调用会被**拒绝**（not-customer-turn：`本动作仅可在客户消息发起的轮次执行——未执行。`）。" +
        "**先改登记再卸载**：先由你用 edit_file 把该角色条目从 `docs/skills/<name>/install.md` 移除（或整份置 `status: uninstalled`），**再**调本工具；" +
        "本工具**不写盘**——只**校验登记确已撤销**（未撤销即拒绝：`登记仍含角色「<roleId>」——先改登记再卸载；未执行。`——防「工具说撤了、登记没变」）、**激活**并**如实回执**。" +
        "**文件保留**：卸载只撤登记语义，**不删** `docs/skills/<name>/` 文件本体——如实区分「效果已撤」与「文件仍在」。**卸载不改变任何角色的写边界**。" +
        "回执三态同 install_skill：`effective:\"rebuilt\"`＝已重建、即刻生效；`\"next-session\"`＝在跑不打断、新会话起生效；`ok:false`＝**未执行、零副作用**，如实报因。",
      promptGuidelines: [
        "卸载技能**仅限客户明示**；不得自主发起；非客户消息发起的轮次会被拒绝（not-customer-turn）。",
        "**先改登记再卸载**：先把该角色条目从 `docs/skills/<name>/install.md` 移除（edit_file），再调 uninstall_skill；登记未变会被拒绝（防「说撤了、实际没撤」）。",
        "卸载只撤**登记效果**、**不删文件**（文件保留于 `docs/skills/<name>/`）；回执如实二分陈述「效果已撤／文件保留」，且卸载**不改变任何角色的写边界**。",
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
