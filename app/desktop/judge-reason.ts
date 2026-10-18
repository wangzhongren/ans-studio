// app/desktop/judge-reason.ts
// 判断回落 reason → 人话的**共享小件**（只在桌面主进程目录内使用，不跨层）。
//
// 背景（2026-10-18 客户反馈）：判断 agent 失败回落时，手动确认卡只写「所需项目文件无法读取」，
// 客户看不懂。根因是 shell 通道（operator-channel.ts::judgeManualHumanReason）与治理通道
// （customer-input.ts::judgeHumanReason）的 `read-denied` 分支都把 driver 已给出的具体 `reason` 丢了。
//
// 编排新增约定：`read-denied` 的 `reason` 形如
//   `判断读取被拒：.ans/sessions/x.json（应用私有数据，判断侧不开放）、src/foo.txt（敏感文件），
//    无法保证无损判断，已转手动确认。`
// 本模块只做**展示映射**（不参与任何判定）：提取冒号后的具体内容、去尾、限长，拼成
// `读取被拒：<具体内容>`；无具体记录时如实说明「未记录具体路径」。

/** 编排约定的 `read-denied` 具体原因标记（全角冒号）。 */
const READ_DENIED_MARKER = "判断读取被拒：";
/** 映射输出的人话前缀。 */
const READ_DENIED_DETAIL_PREFIX = "读取被拒：";
/** 映射输出的长度上限（Unicode 码点；与既有 reason 默认分支的 200 边界同口径）。 */
const MAX_REASON_CHARS = 200;
/** 无具体记录时的兜底（不再只说笼统一句）。 */
const READ_DENIED_FALLBACK = "所需项目文件无法读取（未记录具体路径）";
/** driver 已在 reason 里写过的收尾语——提取具体内容时去掉，避免卡片重复。 */
const READ_DENIED_TAIL = "，已转手动确认。";

/**
 * 拼接前的收尾标点归一（2026-10-18 真机文案瑕疵）：人话 reason 以 `。`/`；`/`.` 结尾时**去掉一个**，
 * 避免卡片出现「。；已转你手动确认」/「。。规则判定」。非句末标点结尾时逐字不变。
 */
export function stripTrailingSentencePunct(reason: string): string {
  return reason.replace(/[。；.]$/u, "");
}

/**
 * `read-denied` 的人话映射（两通道同解）。
 *  - `reason` 含 `判断读取被拒：` ⇒ `读取被拒：<冒号后的具体内容>`（去尾、≤200 码点）；
 *  - 其余（空/无该前缀/冒号后为空）⇒ `所需项目文件无法读取（未记录具体路径）`。
 */
export function readDeniedHumanReason(reason?: string): string {
  const text = typeof reason === "string" ? reason.trim() : "";
  const at = text.indexOf(READ_DENIED_MARKER);
  if (at < 0) return READ_DENIED_FALLBACK;

  let detail = text.slice(at + READ_DENIED_MARKER.length).trim();
  if (detail.endsWith(READ_DENIED_TAIL)) detail = detail.slice(0, -READ_DENIED_TAIL.length).trim();
  if (detail.endsWith("。")) detail = detail.slice(0, -1).trim();
  if (detail === "") return READ_DENIED_FALLBACK;

  const budget = MAX_REASON_CHARS - READ_DENIED_DETAIL_PREFIX.length;
  const bounded = Array.from(detail).slice(0, budget).join("");
  return `${READ_DENIED_DETAIL_PREFIX}${bounded}`;
}
