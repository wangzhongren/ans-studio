// Model 层：边界条目与 Section 1 的共享类型
// 门禁引擎为唯一主属主，跨层共享，其他角色只读引用。
// 冻结契约：角色卡/项目管理/docs/design/2026-10-11_design_ans-cli-v1-prototype.md §2
// 只用可擦除语法：禁 enum / namespace / 构造函数参数属性 / declare 字段。

export type Root = "skill" | "project";

// F5：条目要能表达内置边界里的 Conditional directory 条件语义
export type EntryKind = "file" | "directory" | "conditional-directory";

export interface BoundaryEntry {
  root: Root;
  path: string; // 相对该根的路径
  kind: EntryKind;
  // kind === "conditional-directory" 时必填：固定格式 slug（^[a-z][a-z0-9-]*$，如 role-restructuring），
  // 供 resolveWrite 机械判定；边界文档里的散文说明不参与判定。格式不合法视为解析失败。
  condition?: string;
  purpose: string;
}

// 条件 slug 的固定格式（客户端裁决）：小写字母开头，后接小写字母/数字/连字符
export const CONDITION_SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;

/** 校验条件 slug 是否合法；非法则为解析失败，不放行 */
export function isValidConditionSlug(value: unknown): value is string {
  return typeof value === "string" && CONDITION_SLUG_PATTERN.test(value);
}

// F6：accepted 必须有证据来源，不得由程序自授权。
// 证据分两级：
//  - source（配置自称）：文本说明，如"客户已确认"——可被任何人自填，是弱证据；
//  - pin（可验证证据）：把被接受的边界文件钉到固定 SHA-256——篡改即失效（fail-closed）。
// pin 的形状选**逐文件的 (path, sha256) 列表**：
//  * 逐文件而非单个项目级 hash——一个项目的边界文件不止一份（每角色一份 + 治理边界），
//    单个 hash 表达不了"接受的是哪几份、各自的 hash 是什么"；
//  * 列表而非映射——每条证据自述"哪个文件 → 哪个 hash"，与顺序无关，且能对同一证据来源
//    逐条给出可读的失败定位（哪条 pin 不符）。
// 硬约束：只要声明了 pin，accepted === true 就必须能追到某个固定 hash（见 boundary-core 的校验）；
// pin 缺省（undefined）时沿用旧的 source 自称来源（向后兼容，不放松也不加严既有路径）。
export interface PinEntry {
  path: string; // pin 指向的文件：相对项目根，或绝对路径
  sha256: string; // 该文件的 SHA-256（十六进制，大小写不敏感）
}

export interface Acceptance {
  accepted: boolean; // 证据充分且已接受时为 true
  source: string; // 必填（accepted 为 true 时）：证据说明，如客户 pin 或配置来源
  // 可选：可验证证据（SHA-256 pin）。存在时 boundary-core 强制校验；缺省 = 仅凭 source 自称。
  pin?: PinEntry[];
}

export interface BoundarySection1 {
  entries: BoundaryEntry[];
  boundarySource: string; // 实际使用的边界文件路径
  acceptance: Acceptance;
  // 边界解析失败时的原因（YAML 严格校验失败、读取失败等）；存在时 resolveWrite 拒绝一切写入
  parseError?: string;
  // 归档标记（客户 2026-10-14 约定）：边界 YAML 顶层 `archived: true` 时置 true——该角色目录为
  // **冻结归档**（拆分/退役的角色原位留档，如桌面应用拆分为桌面UI/桌面窗口后留档）。语义：
  //  · listProject **静默跳过**（不枚举该角色、不产生任何警告——归档对枚举不可见）；
  //  · 按 id 解析/开启角色的入口（resolveRole，CLI role run 与桌面开启皆经此）**fail-closed 拒绝**。
  // 仅在边界文件解析成功且声明为 true 时出现；不带该键的角色行为完全不变。
  archived?: boolean;
}
