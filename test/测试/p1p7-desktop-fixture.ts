import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

/** Independent desktop operator fixture; local clone only, no sessions or credentials copied. */
export function createP1P7DesktopFixture(sourceRoot: string) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "ans-p1p7-desktop-")));
  execFileSync("git", ["clone", "--local", "--no-hardlinks", sourceRoot, root], { stdio: "pipe" });
  const candidateFiles = ["index.js", "test.js", "index.d.ts", "package.json"];
  for (const relative of candidateFiles) fs.copyFileSync(path.join(sourceRoot, relative), path.join(root, relative));
  for (const relative of ["角色卡", "docs"]) {
    fs.cpSync(path.join(sourceRoot, relative), path.join(root, relative), { recursive: true });
  }
  const config = JSON.parse(fs.readFileSync(path.join(sourceRoot, ".ans/project.json"), "utf8"));
  config.projectRoot = root;
  fs.mkdirSync(path.join(root, ".ans"));
  fs.writeFileSync(path.join(root, ".ans/project.json"), JSON.stringify(config, null, 2) + "\n");
  fs.symlinkSync(path.join(sourceRoot, "node_modules"), path.join(root, "node_modules"), "dir");

  const docs = path.join(root, "角色卡/测试/docs/change");
  fs.mkdirSync(docs, { recursive: true });
  const samples = {
    "p1p7-unicode.md": Buffer.from("\uFEFF# 桌面文档阅读\n\n这是独立测试夹具：中文、emoji 🧪、`inline code`。\n\n- 只读正文\n- 返回原卡\n", "utf8"),
    "p1p7-oversize.md": Buffer.alloc(262145, "A"),
    "p1p7-invalid-utf8.md": Buffer.from([0xc3, 0x28]),
    "p1p7-long-display.md": Buffer.from("# Long display probe\n\n" + "x".repeat(20480) + "\n", "utf8"),
    "p1p7-static-render.md": Buffer.from([
      "# 静态文档测试", "",
      "<script>document.title='P1P7-UNSAFE-SCRIPT'</script>",
      "![本地阻止加载探针](http://127.0.0.1:9/p1p7-image)",
      "[危险协议](javascript:document.title='P1P7-UNSAFE-LINK')", "",
      "以上内容必须静态显示，不能执行脚本或自动加载图片。", "",
    ].join("\n"), "utf8"),
  };
  for (const [name, bytes] of Object.entries(samples)) fs.writeFileSync(path.join(docs, name), bytes);
  fs.mkdirSync(path.join(docs, "p1p7-directory"));
  fs.writeFileSync(path.join(root, ".env"), "P1P7_FIXTURE_MARKER=FAKE_NON_CREDENTIAL\n");

  const sha = (file: string) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  const manifest = {
    projectRoot: root,
    sourceRoot,
    sourceCommit: execFileSync("git", ["-C", sourceRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceFiles: Object.fromEntries(candidateFiles.map(file => [file, sha(path.join(sourceRoot, file))])),
    candidateFiles: Object.fromEntries(candidateFiles.map(file => [file, sha(path.join(root, file))])),
    documents: Object.fromEntries(Object.keys(samples).map(file => [file, { bytes: samples[file as keyof typeof samples].length, sha256: sha(path.join(docs, file)) }])),
    pins: config.governanceBoundary.acceptance.pin.map((pin: { path: string; sha256: string }) => ({ path: pin.path, matches: sha(path.join(root, pin.path)) === pin.sha256 })),
    sessionsCopied: fs.existsSync(path.join(root, ".ans/sessions")),
  };
  if (manifest.sessionsCopied || manifest.pins.some((pin: { matches: boolean }) => !pin.matches)) {
    throw new Error("Independent fixture must have no sessions and must retain exact accepted pins");
  }
  return manifest;
}
