// D1 evidence: candidate identity and write-set closure check.
// Read-only: lists modified/untracked files under src/app/test, computes
// `git hash-object` + SHA-256, and compares against the hashes recorded by
// A1/A2/A3/allowlist/B1/C1/C2 implementation records.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const out = [];

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(path.join(root, file))).digest("hex");
}

// owner -> [path, expected git hash-object (prefix allowed), expected sha256 (prefix allowed)]
const expected = new Map();
function add(owner, file, gitHash, sha256Hash) {
  expected.set(file, { owner, gitHash, sha256Hash });
}

// A1 (6)
add("A1", "src/model/directive-marker.ts", "c0978df25b9431b5cec0b08a110ef19045900619", "7e522722b93a8815430b9c77e949ca5c1543683ecced8f23b8c29c8b584351c0");
add("A1", "src/model/directive.ts", "056fe6bb3f95f269514d5de4ec903d71031b9f82", "2172bdecd3648da3d1f4bd8c1b177db8b687b1e8ac2b07119c787c44bd652699");
add("A1", "src/model/runtime.ts", "b92891873eb9623f828b4dd17731469db0558c53", "911c617920e11bd2b61c851c9f39817fea4a4c59cfeab3366b640082bc4004c5");
add("A1", "src/model/project-state.ts", "0c4582e2cc87cf5cac8975ba879f8ffd5b10ce49", "7075d76b266699ae394062720534b277d9873f722ffe8144d86c1a07bafaa430");
add("A1", "test/runtime-core/directive-marker.test.ts", "8d506c8125909f0f66f26946b660003f538264d8", "d3d28fe9df246d5eb19d096a053ab4707c00c9824b2f00e388b928009af7658e");
add("A1", "test/runtime-core/directive-contract.test.ts", "4be84c2ada93578f25f359a259535ea678dc96c4", "f7f4db3071b11f23f6c1554dad7be73167708127cd120fc94d7f4b5e0c060e2f");

// A2/A3 (5) + allowlist (1, W-5 A amendment; blob prefix 7804092 recorded)
add("A2", "src/common/shared/jsonl-ledger.ts", "223d32c6e46bac41200406546e33e86767ac0d82", "c9fd3066f1985c1b8ae850ab9b67845dcf320e7f38779de4121687cdcdd62e5f");
add("A2", "test/项目管理/shared/jsonl-ledger.test.ts", "f879ebb5944bc255295c263b30c8479c39a6c63b", "3aa6154db2cd353b4ad924803113d3861cfb01fcba77acbd8050dc02972bbb8e");
add("A3", "src/common/shared/i18n/messages/zh-CN.ts", "7511b17bcd71b1e3a598f3fb864ba4c6ea0ea351", "6dafeb5983fac78336063e669aaba44434eabeae06c6c6a511f537d7eb3c3b6a");
add("A3", "src/common/shared/i18n/messages/en-US.ts", "b4d352513b4db535a1de8501efa883c63b255026", "8c0d15bd40d5bdbb629a75511dfb1b1fe284b1e7d8d8de86e3cea7e24c876602");
add("A3", "test/项目管理/shared/i18n.test.ts", "1de9f5a37e71454110384a3f74eed729bccd36c6", "62b04e8c42bf1548606e9412c981e42baca073324980e76d23c6eff220e1a80a");
add("A2/allowlist", "test/项目管理/shared/i18n-guard-allowlist.ts", "7804092", "f31c0b07c639c5bcb83ebe9780e1b6c155eca4eef62b341fc00b4a1a54d2180a");

// B1 (20)
add("B1", "src/provider/directive/abstract/directive-store.ts", "16d2252421c60f028b5687558ba13602d55eed53", "b083464aeeea60f1277c2b3dfb05571f6b4d4514ef6d7142236d3bd99253bea4");
add("B1", "src/provider/directive/impl/file-store.ts", "3760b1e9d4e04a1b0e901a67ccfeff713342859d", "4317b0617581e1c68e53e829ead7bf0f8ff0d6107d75971ff27dc9d5fa7b5325");
add("B1", "src/provider/directive/public/directive-store.ts", "f4d8e61c51a831068b5f8fd12d68a773017c92dd", "46d0396aa838b0d51b31b5a5a2d602eb7b2a7756e74267771c20836f69133bb4");
add("B1", "src/service/directive/abstract/directive-service.ts", "4ab939ff8a56f65af0c10d4174f7239239613706", "f10ae8cfc127b7c7f8f09423e162561b9739946e4d99a7ccbcbfe3841ea61364");
add("B1", "src/service/directive/impl/directive-service.ts", "0946afaaa7ad92f9c864399ca055b92bbe11efd0", "e7e183bd767679b43a14eef2f8a1c50d7fe7b7b0b53217ff6ece06b24425a661");
add("B1", "src/service/directive/public/directive-service.ts", "b7df6f622b07493778402c9642ea5bd125308547", "e80a407c3f9b555f771ac98defabce9471376c69117b3f32123527839d8cebed");
add("B1", "src/pipeline/orchestration/customer-directive.ts", "9202cec3eb3a7aec724ba825706a470b7fdaa522", "601cf960932a841282cc187008fd68b8f8e3e64a336db1d99c5ddd4b7321aeb8");
add("B1", "test/编排/customer-directive.test.ts", "40d0c2c8d368871d0f3fadd248122c35115a7465", "70da2871cf0ad5cce91b2852217908852b955bc188ea993a1a7e014b3b9b0889");
add("B1", "test/编排/customer-directive-gate.test.ts", "793d5d86cc3cf594cf1af514ace10bf60dfe2247", "446df4101efeb388542994410c201cbd6257c05278790be3b99262c3959131ed");
add("B1", "src/common/编排/task-state.ts", "ff22aebcab8fc99775f51b864d09b90105626339", "39f178d99f341c873dbadbca4eb8ad94a0b557775173405e5921bbb4db85d672");
add("B1", "src/common/编排/version-decision.ts", "c9d8482bd73be66e0f937c9d0e42dfc47a3529dc", "21505daab1e97e5687867b140d221fbbaa8aa1c964ca889be7c6323854d3b007");
add("B1", "src/common/编排/run-manifest.ts", "26d7df1c21c11f4ecc7a464e3d11fccc8dcec63c", "2a397ef4c80c7c9d33054128159f866cfb160e9c72183f7d1cdc1aad5f996f97");
add("B1", "src/common/编排/shell-gate.ts", "cc6487d1d620b76ee648c4347ba1083908b2f93c", "f3a6e74b2302d8e67a9031693b869e4b69e90449b26abbd6eab1be18d2c5496f");
add("B1", "src/common/编排/shell-audit.ts", "98f28dd204ad37015a374728673301fb96ef8d06", "cbeccbba670a39865e742d5bd7244ee0f2061099752b56c8070bf33fd7d05acd");
add("B1", "src/pipeline/orchestration/run-role.ts", "b7d3e1445a2b24f2b94d1efa455ed9f71ed4a146", "fae1c81f5ac8a97fd1c60db296d7cfe1a02653e1ab1c77283d84472da951fda6");
add("B1", "src/pipeline/orchestration/govern-session.ts", "ed2df874d26e4ac39572aa75c215abe3025f2dbd", "07f583998cce5398156a022e65dbaa3242b5a9d178e38f97799fcbb055ecb769");
add("B1", "src/pipeline/orchestration/shell-arming.ts", "6a4b48cb3357840ef47bb4dfde484f9a20871d49", "e53d6716fafbaf8c98c32f04716a412d1ed407a4eea698b0b28b6ec08c70e7a1");
add("B1", "test/编排/task-state.test.ts", "4d810681637d48c0516eb132758234ee84e33f0a", "cf586ef094dd2a2ab2b0fcf8032498ec9f2dd72dd84d35bb949f5039226200d6");
add("B1", "test/编排/version-decision.test.ts", "a2b02c71f9f871c338aa2839d88a29a2d2c85b17", "878cec0ae9b8fcc2e615f10c211ded5ee5fa659e3834aa593d1d1b8da7453251");
add("B1", "test/编排/run-manifest.test.ts", "863427bf96053f8b8eb977c44057d5374bdd46d9", "e11e6bf81f384f507355065a9aa9847381a4c04f21b0fe4671053f2576319754");

// C1 (11 actual; plan §4.3 lists 7 product + new/affected tests)
add("C1", "app/desktop/directive-input.ts", "9ef61de1d63c54525a7fa1d0aa818cbab9cc8fcc", "914868d83015e331b412fda9a6c86040fc20a6f1e5dbc22b75c706728d6f4caa");
add("C1", "app/desktop/interface.ts", "4114f9b228aea5c741c63fd9e0448ea8f4914c36", "6c3108e394acd9802b5445618b798d5865e55a0d5b5c0c07c585765aca547955");
add("C1", "app/desktop/session.ts", "706c0fe022c8e710fd3a8e0ae867b73df2d2dc4b", "7650676a91b426e8312e5bf4f24482f705c627eee7b045d559c58f12edbb0885");
add("C1", "app/desktop/customer-input.ts", "2c29c737bdf9f5135ce26d4e77064e62a8fb799a", "7cd7d8f844bab5dbd85ca9e3f79cde561741dfb988a60a0e2ce47c3577936c50");
add("C1", "app/desktop/requirement-change.ts", "8e4df19d81e3fd4bd24b07032a190f45cc37949a", "d0bb3ba7f467f89de79a8b492d84e308610392578ef74243ad19ac3fbbcc8787");
add("C1", "app/main.ts", "d6272b555aeaf0a706860421f7fca53e428ffac9", "c62da4560690d57ca043f2e75b14a011799ebdb844d762cf42c7dfcbea1c16d8");
add("C1", "app/preload.cjs", "6bfcb03be8c1f12e62519b5218d2867f208ec2e7", "684c0d96ab2bf870ac980c36147778f28e105d9c4a902738aa8349206cefabb0");
add("C1", "test/桌面应用/directive-input.test.ts", "2fc15f483fd9ec85be725a2d8c2e4bc8527b766c", "ffb3210e9ec575101b7669917cf489940520f7a7776da07cbdba53d83a6bb924");
add("C1", "test/桌面应用/directive-decision.test.ts", "b8c603d7acc1b1e2db69fdebd2f18c74db7e52fa", "1206365325c436a2fb88f27266a6b472543f0d92ac6fa60e2f33a2bdd5174478");
add("C1", "test/桌面应用/run-change.test.ts", "3b5a8d4a9aa58b9589ca0b85bee5a349a4976544", "3487dd55957b86dc1b47da87d00ebfd026f6de3bdd5f88e525c345086e1a60b9");
add("C1", "test/桌面应用/version-decision.test.ts", "c38801caa12c993b64b84de4da1f76a9a6c28348", "52fcd189386ba832807027e7d1c2858f3b9d3622937b5ddc68fd9c88a578fdb2");

// C2 (9)
add("C2", "app/renderer/src/chat/ipc.ts", "9696f0c28b6dcebc6fc3cb5afe86eebbf88e1641", "5d7ff9e66f7966554d9d23b0674a37d13b7124577ef7a89383f0d8b3cee518af");
add("C2", "app/renderer/src/shell/Composer.tsx", "9afe743b94393001aca9a2928b5adc60adacf928", "0a19060b49fcb33e2198e5cff81604dece660acdb9b7dc47f75cec4e6439d7b6");
add("C2", "app/renderer/src/shell/ConfirmCard.tsx", "ab01730e6a4e026b9bc7a6400e1b684503079f96", "e997aa3c44e2dd1f72a30e9167042682d57d4670be0b37248b4ec2e3d9e21011");
add("C2", "app/renderer/src/shell/shell.css", "3b873626ab9fa7444223d9e415f6647702e32c34", "a188012d0e0feaedc767de9f348afd03c8f8d26543119750d0236d3c0c3760d8");
add("C2", "app/renderer/src/stores/directive-store.ts", "40e84a115faf79efa3b434f9806a8bcceb41393a", "5096ba6961615edd4c3caa8083f3f274510851c34a17d852876dbd28cf82e844");
add("C2", "app/renderer/src/chat/directive-dialog.tsx", "c80bfdbd475b296578728a3e0ee343358a0c72b1", "897223a08b3e2b1c8f90d5df37289dd9e797c277b593b21b62167a69cb4527d7");
add("C2", "app/renderer/src/chat/directive-panel.tsx", "64e60250754a640d6dcbcea90b63879616fdfd13", "c96f6cd245a25e5b655258738a47942ad3fd01ea4dd71cdf33ba5eea016bdc4f");
add("C2", "test/桌面UI/directive-dialog.test.ts", "d7b03041cce352eadd9e9f6a15c80b32286585b8", "51547abf05888cd1ee422b732819dc71725aba19cfc9e55109bb775658d62962");
add("C2", "test/桌面UI/directive-panel.test.ts", "c507a74f012b3070477ae8f3d4bfd7728d81f0d5", "6ab90d2238043655d8ea19eaa443f30ba162fa662b95117ad0d13ded8def1e0a");

// D1 (this node) adds exactly one cross-layer integration test in `test/测试/`.
// On the pre-D1 run the file did not exist; on the post-run verification it is
// included with its current bytes (the 52 fixed hashes above remain authoritative).
const d1File = "test/测试/customer-authorization-plane-integration.test.ts";
if (existsSync(path.join(root, d1File))) {
  add("D1", d1File, git(["hash-object", "--", d1File]), sha256(d1File));
}

const files = execFileSync("git", ["ls-files", "-z", "-m", "-o", "--exclude-standard", "--", "src", "app", "test"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\u0000")
  .filter(Boolean)
  .sort();

const unexpected = [];
const missing = [];
const mismatch = [];
const seen = new Set();

for (const file of files) {
  seen.add(file);
  const gitHash = git(["hash-object", "--", file]);
  const sha = sha256(file);
  const exp = expected.get(file);
  if (exp === undefined) {
    unexpected.push(file);
    out.push(`UNEXPECTED\t${file}\t${gitHash}\t${sha}`);
    continue;
  }
  const gitOk = gitHash.startsWith(exp.gitHash);
  const shaOk = sha.startsWith(exp.sha256Hash);
  if (!gitOk || !shaOk) mismatch.push({ file, exp, gitHash, sha, gitOk, shaOk });
  out.push(`${gitOk && shaOk ? "OK" : "MISMATCH"}\t${exp.owner}\t${file}\t${gitHash}\t${sha}`);
}
for (const [file, exp] of expected) {
  if (!seen.has(file)) missing.push({ file, owner: exp.owner });
}

const header = [
  "# D1 candidate identity and write-set closure",
  `# generated: ${new Date().toISOString()}`,
  `# cwd: ${root}`,
  `# HEAD: ${git(["rev-parse", "HEAD"])}`,
  `# command: git ls-files -m -o --exclude-standard -- src app test; git hash-object; sha256sum`,
  `# candidate files: ${files.length}`,
  `# expected files: ${expected.size}`,
  `# unexpected: ${unexpected.length}`,
  `# missing: ${missing.length}`,
  `# mismatches: ${mismatch.length}`,
  "",
];
const byOwner = new Map();
for (const [file, exp] of expected) byOwner.set(exp.owner, (byOwner.get(exp.owner) ?? 0) + 1);
const ownerLines = ["# expected by owner:", ...[...byOwner.entries()].map(([o, n]) => `#   ${o}: ${n}`), ""];

const tail = [];
if (missing.length > 0) {
  tail.push("MISSING:");
  for (const m of missing) tail.push(`  ${m.owner}\t${m.file}`);
}
if (mismatch.length > 0) {
  tail.push("MISMATCHES:");
  for (const m of mismatch) tail.push(`  ${m.file}\texpected git=${m.exp.gitHash} sha=${m.exp.sha256Hash}\tactual git=${m.gitHash} sha=${m.sha}`);
}
if (unexpected.length > 0) {
  tail.push("UNEXPECTED (outside write set):");
  for (const f of unexpected) tail.push(`  ${f}`);
}
tail.push("", "STAGED (git diff --cached --name-only):", git(["diff", "--cached", "--name-only"]));
tail.push("", "STATUS (git status --porcelain -- src app test):", git(["status", "--porcelain", "--", "src", "app", "test"]));

const outputName = process.argv[2] ?? "01-candidate-identity.txt";
const text = [...header, ...ownerLines, ...out, "", ...tail].join("\n") + "\n";
writeFileSync(path.join(root, "角色卡/测试/docs/change/2026-11-03_customer-authorization-plane-D1-evidence", outputName), text, "utf8");
console.log(text);
console.log(`RESULT unexpected=${unexpected.length} missing=${missing.length} mismatch=${mismatch.length}`);
if (unexpected.length > 0 || missing.length > 0 || mismatch.length > 0) process.exitCode = 1;
