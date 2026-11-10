// B2.1 desktop failing-name diff (scratch tool stored with evidence).
// Usage: node compare-failures.mjs <beforeFailingNamesJson> <afterFailingNamesJson> <outJson>
// Compares the set of "<file>::<test name>" failures.
// Exclusions (with evidence, not candidate-caused):
//   - chief-workflow.test.ts: non-deterministic suite (W47 busy Chief; B5 §6/B5.1 registered).
//   - genesis-bootstrap.test.ts: linked-worktree `.git` FILE => protection requirement "unknown" =>
//     runtime-creation-prepared-api-unavailable (see genesis-bootstrap-worktree-evidence.txt).
//   - p0-halt-and-images.test.ts::P0-2 abort 三态：demo 替身 (same linked-worktree cause; reproduced by
//     adding a `.git` FILE to the git-archive baseline).
import fs from "node:fs/promises";

const [beforePath, afterPath, outPath] = process.argv.slice(2);
const beforeAll = JSON.parse(await fs.readFile(beforePath, "utf8"));
const afterAll = JSON.parse(await fs.readFile(afterPath, "utf8"));

const ENV_FILE_EXCLUDED = ["chief-workflow.test.ts", "genesis-bootstrap.test.ts"];
const ENV_NAME_EXCLUDED = [
  { fileSuffix: "p0-halt-and-images.test.ts", namePrefix: "P0-2 abort 三态：demo 替身" },
];
function matchesSuffix(file, suffix) {
  const normalized = file.replace(/\\/g, "/");
  return normalized.endsWith(`/${suffix}`) || normalized.endsWith(suffix);
}
function isExcluded(file, name) {
  if (ENV_FILE_EXCLUDED.some((suffix) => matchesSuffix(file, suffix))) return true;
  return ENV_NAME_EXCLUDED.some(({ fileSuffix, namePrefix }) =>
    matchesSuffix(file, fileSuffix) && name.startsWith(namePrefix));
}
function split(map) {
  const det = {};
  let excluded = 0;
  for (const [file, names] of Object.entries(map)) {
    const kept = [];
    for (const name of names) {
      if (isExcluded(file, name)) excluded += 1;
      else kept.push(name);
    }
    if (kept.length > 0) det[file] = kept;
  }
  return { det, excluded };
}
const before = split(beforeAll);
const after = split(afterAll);
function toSet(map) {
  const set = new Set();
  for (const [file, names] of Object.entries(map)) {
    for (const name of names) set.add(`${file}::${name}`);
  }
  return set;
}
const beforeSet = toSet(before.det);
const afterSet = toSet(after.det);
const added = [...afterSet].filter((key) => !beforeSet.has(key)).sort();
const removed = [...beforeSet].filter((key) => !afterSet.has(key)).sort();
const result = {
  excluded: { files: ENV_FILE_EXCLUDED, names: ENV_NAME_EXCLUDED },
  before_files: Object.keys(before.det).length,
  after_files: Object.keys(after.det).length,
  before_failing_names: beforeSet.size,
  after_failing_names: afterSet.size,
  before_environment_excluded_names: before.excluded,
  after_environment_excluded_names: after.excluded,
  added,
  removed,
};
await fs.writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
console.log(JSON.stringify({
  before_files: result.before_files,
  after_files: result.after_files,
  before_failing_names: result.before_failing_names,
  after_failing_names: result.after_failing_names,
  before_environment_excluded_names: result.before_environment_excluded_names,
  after_environment_excluded_names: result.after_environment_excluded_names,
  added: added.length,
  removed: removed.length,
}, null, 2));
if (added.length > 0) console.log("ADDED:\n" + added.join("\n"));
if (removed.length > 0) console.log("REMOVED:\n" + removed.join("\n"));
