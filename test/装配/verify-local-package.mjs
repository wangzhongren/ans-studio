#!/usr/bin/env node
// 本地打包校验（Phase 5A/5B 本地验证专用；**不参与发布配方**）。
//
// 用法：node test/装配/verify-local-package.mjs [输出目录]（默认 release-output/local）
//
// 与发布侧 release-verify.mjs 的区别：
// - 不读取 release-provenance.json、不做 overlay 来源绑定、不上传、不生成
//   manifest-<platform>-<arch>.json / SHA256SUMS-*（避免与发布产物混淆）；
// - 只读当前工作树的本地打包 ZIP，做内容断言 + 隔离 HOME 的 packaged smoke，
//   并把证据写到 <输出目录>/local-smoke.json。
//
// 平台：与 release-verify 一致，只在打包目标平台本机运行（darwin/win32）。
// 零第三方依赖：仅 Node 内置模块 + 系统解包工具（ditto / tar）。
import { readdir, readFile, mkdtemp, mkdir, writeFile, access, realpath } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const output = path.resolve(process.argv[2] ?? path.join(repoRoot, "release-output", "local"));
const expectedArch = process.arch;

if (process.platform !== "darwin" && process.platform !== "win32") {
  throw new Error("verify:local 只在打包目标平台（darwin/win32）本机运行");
}

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const exists = async (target) => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

const files = await readdir(output).catch(() => {
  throw new Error(`输出目录不存在或不可读：${output}（先运行 npm run package:local）`);
});
const archives = files.filter((name) => name.endsWith(".zip"));
if (archives.length !== 1) {
  throw new Error(`输出目录应恰好一个 ZIP，实际 ${archives.length} 个：${files.join(", ") || "(空)"}`);
}
const archive = path.join(output, archives[0]);

const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
const dependencies = Object.keys(packageJson.dependencies ?? {});
const devDependencies = Object.keys(packageJson.devDependencies ?? {});

const temp = await mkdtemp(path.join(os.tmpdir(), "ans-local-smoke-"));
const extracted = path.join(temp, "extracted");
await mkdir(extracted);
if (process.platform === "darwin") execFileSync("ditto", ["-x", "-k", archive, extracted]);
else execFileSync("tar", ["-xf", archive, "-C", extracted]);

const rootNames = await readdir(extracted);
const appBundle = rootNames.find((name) => name.endsWith(".app"));
const resources = process.platform === "darwin"
  ? path.join(extracted, appBundle ?? "", "Contents", "Resources")
  : path.join(extracted, "resources");
const executable = process.platform === "darwin"
  ? path.join(extracted, appBundle ?? "", "Contents", "MacOS", "ANS Studio")
  : path.join(extracted, "ANS Studio.exe");
const application = path.join(resources, "app");

const failures = [];
const content = {
  mustExist: {},
  mustNotExist: {},
  devDependenciesNotPackaged: [],
  productionDependenciesPresent: [],
};

async function requirePath(relativePath) {
  const ok = await exists(path.join(application, relativePath));
  content.mustExist[relativePath] = ok;
  if (!ok) failures.push(`缺少必需文件：${relativePath}`);
  return ok;
}

// —— 包内必含（Phase 5B）——
// 5B：旧渲染器/vendor/旧测试已删除，源入口为 app/renderer/index.html，构建产物为 dist/index.html。
await requirePath("app/main.ts");
await requirePath("app/preload.cjs");
await requirePath("package.json");
await requirePath("LICENSE");
await requirePath("app/renderer/dist/index.html");

// —— 包内必无（5B）：旧渲染器文件、经典脚本、vendor 与旧 dist/src 产物 ——
const removedRendererFiles = [
  "app/renderer/renderer.js",
  "app/renderer/styles.css",
  "app/renderer/markdown.js",
  "app/renderer/engine-selector.js",
  "app/renderer/role-status.js",
  "app/renderer/runtime-ui.js",
  "app/renderer/tool-rows.js",
  "app/renderer/ui-labels.js",
];
content.removedRendererAbsent = {};
for (const rel of removedRendererFiles) {
  const absent = !(await exists(path.join(application, rel)));
  content.removedRendererAbsent[rel] = absent;
  if (!absent) failures.push(`旧渲染器文件仍在包内：${rel}`);
}
const removedLegacyDirs = ["app/renderer/vendor", "app/renderer/dist/src"];
content.removedLegacyDirsAbsent = {};
for (const rel of removedLegacyDirs) {
  const absent = !(await exists(path.join(application, rel)));
  content.removedLegacyDirsAbsent[rel] = absent;
  if (!absent) failures.push(`旧渲染器目录仍在包内：${rel}`);
}

// dist 资产：至少一个 JS、一个 CSS；不得含 sourcemap（electron-builder 已排除 *.map）。
const distAssetsDir = path.join(application, "app", "renderer", "dist", "assets");
const distAssets = await readdir(distAssetsDir).catch(() => []);
content.mustExist["app/renderer/dist/assets"] = distAssets.length > 0;
if (!distAssets.length) failures.push("dist/assets 为空或不存在");
if (!distAssets.some((name) => name.endsWith(".js"))) failures.push("dist/assets 缺少 JS");
if (!distAssets.some((name) => name.endsWith(".css"))) failures.push("dist/assets 缺少 CSS");
if (distAssets.some((name) => name.endsWith(".map"))) failures.push("dist/assets 含 sourcemap");

// —— 包内必无：私有运行数据与构建噪声 ——
let forbiddenCount = 0;
async function scanForbidden(dir, relative = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = path.join(relative, entry.name);
    const forbiddenName =
      entry.name.startsWith(".env") ||
      entry.name === ".ans" || entry.name === ".git" ||
      entry.name === "settings.local.json" ||
      entry.name.endsWith(".log") || entry.name.endsWith(".map");
    if (forbiddenName) {
      forbiddenCount += 1;
      failures.push(`包内出现禁止项：${rel}`);
    }
    if (entry.isDirectory()) await scanForbidden(path.join(dir, entry.name), rel);
  }
}
await scanForbidden(application);
const testDirsPresent =
  (await exists(path.join(application, "test"))) ||
  (await exists(path.join(application, "tests"))) ||
  (await exists(path.join(application, "app", "test"))) ||
  (await exists(path.join(application, "app", "tests")));
content.mustNotExist = {
  "私有数据与构建噪声(.env*/.ans/.git/settings.local.json/*.log/*.map)": forbiddenCount === 0,
  "test/tests 目录": !testDirsPresent,
};
if (testDirsPresent) failures.push("包内出现 test/tests 目录");

// —— devDependencies 不得重复携带（渲染库由 Vite 打进 dist）——
const packagedNodeModules = path.join(application, "node_modules");
for (const dep of devDependencies) {
  const present = await exists(path.join(packagedNodeModules, dep));
  content.devDependenciesNotPackaged.push({ dep, present });
  if (present) failures.push(`devDependency 被重复打包：${dep}`);
}

// —— 生产依赖必须仍在（主进程运行所需）——
for (const dep of dependencies) {
  const present = await exists(path.join(packagedNodeModules, dep, "package.json"));
  content.productionDependenciesPresent.push({ dep, present });
  if (!present) failures.push(`缺少生产依赖：${dep}`);
}

// —— 隔离 HOME 的 packaged smoke ——
let smoke = null;
let smokeProcess = null;
if (failures.length === 0 && !(await exists(executable))) {
  failures.push(`缺少可执行文件：${executable}`);
}
if (failures.length === 0) {
  const home = path.join(temp, "home");
  await mkdir(home);
  const userData = path.join(home, "userdata");
  await mkdir(userData);
  const resultFile = path.join(temp, "smoke.json");
  const env = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "TMPDIR", "LANG", "LC_ALL", "DISPLAY"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  env.HOME = home;
  env.USERPROFILE = home;
  env.APPDATA = path.join(home, "AppData", "Roaming");
  env.LOCALAPPDATA = path.join(home, "AppData", "Local");
  await mkdir(env.APPDATA, { recursive: true });
  await mkdir(env.LOCALAPPDATA, { recursive: true });

  // Phase 5B：生产入口已切到包内 dist/index.html；仍传 smoke-only 入口覆盖，
  // 使 smoke 明确锁定构建产物入口（而非依赖主进程默认值）。
  // 用 realpath 消解 macOS /var → /private/var 符号链接：主进程 validateSmokeRendererEntry
  // 以 app.getAppPath() 的路径做包含判断，未解析的 /var 路径会被误判为越界。
  const smokeEntryRaw = path.join(application, "app", "renderer", "dist", "index.html");
  const smokeEntry = await exists(smokeEntryRaw) ? await realpath(smokeEntryRaw) : smokeEntryRaw;
  const hasSmokeEntry = await exists(smokeEntry);
  const run = await new Promise((resolve, reject) => {
    const args = ["--ans-packaged-smoke", resultFile, "--user-data-dir=" + userData];
    if (hasSmokeEntry) args.push("--ans-renderer-entry=" + smokeEntry);
    const child = spawn(executable, args, {
      env,
      cwd: home,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout = (stdout + data).slice(-32000); });
    child.stderr.on("data", (data) => { stderr = (stderr + data).slice(-32000); });
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("packaged smoke 超时（90s）"));
    }, 90000);
    child.on("error", (error) => { clearTimeout(timeout); reject(error); });
    child.on("exit", (code, signal) => { clearTimeout(timeout); resolve({ code, signal, stdout, stderr }); });
  }).catch((error) => {
    failures.push(`packaged smoke 启动失败：${error.message}`);
    return null;
  });
  smokeProcess = run;
  if (run) {
    if (run.code !== 0) failures.push(`packaged 可执行文件退出码 ${run.code}（signal=${run.signal}）`);
    smoke = await readFile(resultFile, "utf8").then(JSON.parse).catch(() => null);
    if (!smoke) failures.push("packaged smoke 未产出结果 JSON");
    else {
      if (smoke.ok !== true) failures.push(`packaged smoke ok !== true：${JSON.stringify(smoke)}`);
      if (smoke.isPackaged !== true) failures.push("packaged smoke isPackaged !== true");
      if (smoke.arch !== expectedArch) failures.push(`packaged smoke arch 不一致：${smoke.arch} !== ${expectedArch}`);
      if (smoke.platform !== process.platform) failures.push(`packaged smoke platform 不一致：${smoke.platform}`);
    }
  }
}

const archiveBytes = await readFile(archive);
const hashPackaged = async (relativePath) => {
  try {
    return hash(await readFile(path.join(application, relativePath)));
  } catch {
    return null;
  }
};
const evidence = {
  kind: "local-smoke",
  note: "本地验证证据；非发布 manifest，不得用于发布/上传。",
  createdAt: new Date().toISOString(),
  archive: { file: archives[0], size: archiveBytes.length, sha256: hash(archiveBytes) },
  packagedHashes: {
    "app/main.ts": await hashPackaged("app/main.ts"),
    "app/preload.cjs": await hashPackaged("app/preload.cjs"),
    "app/renderer/dist/index.html": await hashPackaged("app/renderer/dist/index.html"),
  },
  environment: {
    platform: process.platform,
    arch: expectedArch,
    node: process.version,
    npm: execFileSync("npm", ["--version"], { encoding: "utf8", shell: process.platform === "win32" }).trim(),
    electronBuilder: JSON.parse(await readFile(path.join(repoRoot, "node_modules", "electron-builder", "package.json"), "utf8")).version,
    packageVersion: packageJson.version,
  },
  content,
  smoke,
  smokeProcess,
  failures,
};
await writeFile(path.join(output, "local-smoke.json"), JSON.stringify(evidence, null, 2) + "\n");

if (failures.length) {
  console.error("verify:local FAILED");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    archive: evidence.archive,
    distEntry: "app/renderer/dist/index.html",
    devDependenciesPackaged: content.devDependenciesNotPackaged.filter((item) => item.present).map((item) => item.dep),
    productionDependenciesPresent: content.productionDependenciesPresent.length,
    smoke: { ok: smoke?.ok, isPackaged: smoke?.isPackaged, arch: smoke?.arch, platform: smoke?.platform },
    evidence: path.join(output, "local-smoke.json"),
  }, null, 2));
}
