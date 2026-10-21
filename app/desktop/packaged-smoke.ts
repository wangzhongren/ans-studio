import path from "node:path";

/** Host-only verification arguments; no renderer capability or model task is introduced. */
export interface PackagedSmokeRequest {
  resultPath: string;
  userDataPath: string;
  /** Smoke-only renderer entry override (absolute .html); validated against the packaged dist root in main. */
  rendererEntryPath?: string;
}

export function parsePackagedSmokeArguments(argv: readonly string[]): PackagedSmokeRequest | undefined {
  const index = argv.indexOf("--ans-packaged-smoke");
  if (index < 0) return undefined;
  const resultPath = argv[index + 1];
  const switchValue = argv.find(value => value.startsWith("--user-data-dir="))?.slice("--user-data-dir=".length);
  const separate = argv.indexOf("--user-data-dir");
  const userDataPath = switchValue ?? (separate >= 0 ? argv[separate + 1] : undefined);
  if (!resultPath || !path.isAbsolute(resultPath) || !userDataPath || !path.isAbsolute(userDataPath)) {
    throw new Error("Packaged smoke requires absolute result and isolated userData paths.");
  }
  // Phase 5A（PM §17.3）：仅冒烟模式可有入口覆盖；普通启动没有这条参数。
  const entrySwitch = argv.find(value => value.startsWith("--ans-renderer-entry="))?.slice("--ans-renderer-entry=".length);
  const entrySeparate = argv.indexOf("--ans-renderer-entry");
  const separateEntryRaw = entrySeparate >= 0 ? argv[entrySeparate + 1] : undefined;
  if (entrySeparate >= 0 && entrySwitch === undefined && (separateEntryRaw === undefined || separateEntryRaw.startsWith("--"))) {
    throw new Error("Packaged smoke renderer entry requires a value.");
  }
  const entryRaw = entrySwitch ?? separateEntryRaw;
  if (entryRaw !== undefined) {
    if (!path.isAbsolute(entryRaw) || path.extname(entryRaw).toLowerCase() !== ".html") {
      throw new Error("Packaged smoke renderer entry must be an absolute .html path.");
    }
  }
  return {
    resultPath,
    userDataPath,
    ...(entryRaw !== undefined ? { rendererEntryPath: path.resolve(entryRaw) } : {}),
  };
}

/**
 * Smoke-only entry override must stay inside the packaged renderer dist tree.
 * `appRoot` is `app.getAppPath()` (the packaged repository root containing `app/`).
 */
export function validateSmokeRendererEntry(entryPath: string, appRoot: string): string {
  const resolved = path.resolve(entryPath);
  if (path.extname(resolved).toLowerCase() !== ".html") {
    throw new Error("Packaged smoke renderer entry must be an .html file.");
  }
  const distRoot = path.resolve(appRoot, "app", "renderer", "dist");
  const relative = path.relative(distRoot, resolved);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Packaged smoke renderer entry must be inside app/renderer/dist.");
  }
  return resolved;
}

const STRICT_CSP_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
];

/** Runs against the actual packaged window's DOM, preload and existing IPC, without importing a project or saving. */
export function packagedSmokeScript(expectedEnvPath: string, expectedEntryUrl: string): string {
  return `(async () => {
    const expectedEnvPath = ${JSON.stringify(expectedEnvPath)};
    const expectedEntryUrl = ${JSON.stringify(expectedEntryUrl)};
    const expectedCsp = ${JSON.stringify(STRICT_CSP_DIRECTIVES)};
    const waitFor = async (predicate, timeoutMs) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        try { if (predicate()) return true; } catch (_error) { /* keep waiting */ }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };
    const normalizedPath = (value) => {
      try { return decodeURIComponent(new URL(value).pathname).replace(/\\\\/g, "/"); } catch (_error) { return ""; }
    };
    const root = document.getElementById('root');
    const ready = await waitFor(
      () => !!root && !!root.firstElementChild && !!window.__ansRenderer && typeof window.__ansRenderer.loadProject === 'function',
      5000,
    );
    const bridge = window.desktop;
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const cspDirectives = (cspMeta && cspMeta.getAttribute('content') ? cspMeta.getAttribute('content') : '')
      .split(';').map((part) => part.trim()).filter(Boolean);
    const csp = cspDirectives.length === expectedCsp.length && expectedCsp.every((directive) => cspDirectives.includes(directive));
    const cspViolations = !window.__ansCspViolations || window.__ansCspViolations.length === 0;
    const entry = ready && normalizedPath(location.href) === normalizedPath(expectedEntryUrl);
    const rootMounted = !!root && !!root.firstElementChild;
    const driver = !!window.__ansRenderer
      && typeof window.__ansRenderer.loadProject === 'function'
      && typeof window.__ansRenderer.selectRole === 'function'
      && !!window.__ansRenderer.state;
    const dom = !!document.querySelector('.app') && !!document.getElementById('runtime-select');
    const preload = !!bridge && typeof bridge.getRecoveryState === 'function' && typeof bridge.getRuntimeConfig === 'function';
    const checks = { entry, rootMounted, driver, csp, cspViolations, dom, preload, ipc: false, importDisabled: false, missingConfiguration: false, settingsEntryDisabled: false, envPathMatches: false };
    if (!preload) return { checks, missingKeys: {}, entryUrl: location.href };
    const recovery = await bridge.getRecoveryState();
    const configs = await Promise.all(['pi','codex','claude'].map(runtime => bridge.getRuntimeConfig(runtime)));
    checks.ipc = !!recovery && configs.every((view,index) => view.runtime === ['pi','codex','claude'][index] && Array.isArray(view.missingKeys));
    const runtimeSelect = document.getElementById('runtime-select');
    checks.importDisabled = recovery.projectRoot == null && !!runtimeSelect && runtimeSelect.disabled === true;
    checks.missingConfiguration = configs.every(view => view.missingKeys.length > 0);
    checks.envPathMatches = configs.every(view => view.path === expectedEnvPath);
    // 4A 起设置入口按项目启用（PM §12.3 #2 / §13.4）：无项目时如实为禁用 + 抽屉保持关闭。
    const tabPi = document.getElementById('tab-pi');
    const drawer = document.getElementById('right-drawer');
    checks.settingsEntryDisabled = !!tabPi && tabPi.disabled === true && !!drawer && drawer.getAttribute('aria-hidden') === 'true';
    return { checks, missingKeys: Object.fromEntries(configs.map(view => [view.runtime,view.missingKeys])), entryUrl: location.href };
  })()`;
}
