import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

// 渲染层构建配置（仅覆盖 app/renderer；主进程与 preload 保持无构建）。
//
// 生产 CSP（由渲染层源码 app/renderer/src/index.html 的 meta 提供，本构建不改写）：
//   default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:
// 因此构建必须关闭 modulePreload polyfill（它会注入内联脚本/动态预取），且 base 用相对路径，
// 保证 Electron `loadFile` 的 file:// 场景下资源可加载。
const DEV_CSP =
  "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: http:";

// 仅开发服务器放宽 CSP：React Refresh 前导脚本与样式热注入需要 inline，HMR 需要 ws/http。
// 若源码 HTML 已带生产 CSP meta，则替换它；否则注入一个。build 不经过此插件。
function devCspPlugin(): Plugin {
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${DEV_CSP}" />`;
  return {
    name: "ans-dev-csp",
    apply: "serve",
    transformIndexHtml(html) {
      const existing = /<meta\s+http-equiv=["']Content-Security-Policy["'][^>]*>/i;
      if (existing.test(html)) return html.replace(existing, metaTag);
      if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `  ${metaTag}\n  </head>`);
      return metaTag + html;
    },
  };
}

const rendererSrc = fileURLToPath(new URL("./app/renderer/src", import.meta.url));

export default defineConfig({
  root: "app/renderer",
  // Electron loadFile 走 file://，所有资源引用必须相对，不能用绝对路径。
  base: "./",
  plugins: [react(), tailwindcss(), devCspPlugin()],
  resolve: {
    alias: {
      "@": rendererSrc,
    },
  },
  build: {
    // Electron 44.7.0 内置 Chromium 152.0.7977.130（2026-10-21 实测：
    // ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron -e "console.log(process.versions.chrome)"），
    // 只跑在打包的 Electron 里，无需向下兼容更旧浏览器。
    target: "chrome152",
    // outDir 相对 root → app/renderer/dist。
    outDir: "dist",
    emptyOutDir: true,
    // 生产 CSP 禁止内联脚本；Vite 默认注入的 modulepreload polyfill 会在严格 CSP 下被拦截。
    modulePreload: { polyfill: false },
    rollupOptions: {
      // Phase 5B：旧渲染器已删除，源入口移到 app/renderer/index.html（root 内），
      // 产物为 dist/index.html；仍显式指定，避免依赖 root 默认入口的隐式行为。
      input: fileURLToPath(new URL("./app/renderer/index.html", import.meta.url)),
    },
  },
  server: {
    port: 5199,
    strictPort: true,
  },
});
