// app/desktop/session/shared/clock.ts
// B1（2026-11-13，session.ts 重构；方案 §3.2 / §5 B1 提交 2/2）：时钟（L0）。
// 类方法 `now` 自 app/desktop/session.ts **逐字搬移**；注入时钟（`deps.now`）语义逐字一致
// （缺省 `Date.now()`——与会话时间戳、投递入队时间同源）。
// 依赖规则：shared 只可依赖 contracts 与外部 src；不得导入 barrel/feature。

/** 时钟（注入以便单测；缺省 Date.now——与会话时间戳、投递入队时间同源）。 */
export function now(deps: { now?: () => number }): number {
  return deps.now ? deps.now() : Date.now();
}
