// app/desktop/renderer-entry.ts
// 渲染入口的唯一路径事实源（Phase 5A/5B，PM 评审 §17.2/§17.1）。
//
// 只含路径与解析函数：不 import Electron、不碰 IPC、不读文件系统、不含业务。
// `app/main.ts`、`test/桌面应用/e2e/main.mjs` 与 packaged smoke 一律经本模块解析，
// 不得在其它文件再写死渲染入口字符串。
//
// 5B：最终入口收敛为 `renderer/dist/index.html`（旧 `renderer/index.html` 已删除；
// 不再保留 dist/src 过渡常量）。
import path from "node:path";

/** 唯一生产入口（相对 app/ 目录）：Vite 构建产物。 */
export const RENDERER_RELATIVE = ["renderer", "dist", "index.html"] as const;

/** 相对 app/ 目录解析唯一生产入口。 */
export function resolveRendererEntry(appDir: string): string {
  return path.join(appDir, ...RENDERER_RELATIVE);
}
