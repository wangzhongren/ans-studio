// convener B2 证据探针：legacy 数据/行为指纹（before/after 对比用；不属于产品代码）。
// 只读取模块公开数据与纯函数输出，不写盘、无网络、无时钟依赖。
import { createHash } from "node:crypto";

import {
  CONVENER_WORKER_DISPATCH_TARGETS,
  convenerRoleModule as m,
} from "../../../../../src/common/roles/convener/index.ts";

const sha = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");

const legacyContext = [
  m.context({ governanceModel: "trio" }),
  m.context({ governanceModel: "single" }),
  m.context({ governanceModel: "trio", matrix: "legacy-v1" }),
  m.context({}),
];

const targets = ["verifier", "chief", "product", "rapporteur", "nominator", "convener", "implementer", "env-bootstrap", ""];
const dispatchInputs = [];
for (const targetRoleId of targets) {
  for (const targetKind of ["built-in-governance", "project"]) {
    for (const targetExists of [true, false, undefined]) {
      dispatchInputs.push({
        sourceRoleId: "convener",
        targetRoleId,
        targetKind,
        ...(targetExists === undefined ? {} : { targetExists }),
      });
    }
  }
}
dispatchInputs.push({ targetRoleId: "implementer", targetKind: "project", targetExists: true });
dispatchInputs.push({ sourceRoleId: "chief", targetRoleId: "implementer", targetKind: "project", targetExists: true });
dispatchInputs.push({ sourceRoleId: "convener", targetRoleId: "implementer", targetKind: "unknown", targetExists: true });
dispatchInputs.push({
  sourceRoleId: "convener",
  targetRoleId: "implementer",
  targetKind: "project",
  targetExists: true,
  matrix: "legacy-v1",
});

const data = {
  cardTextSha256: sha(m.card.text),
  cardTextLength: m.card.text.length,
  entriesSha256: sha(m.card.entries),
  preauthorizedDirsSha256: sha(m.card.preauthorizedDirs),
  forbiddenWritePathsSha256: sha(m.card.forbiddenWritePaths),
  capabilitiesSha256: sha(m.capabilities),
  cardsSha256: sha([...m.cards]),
  workerDispatchTargetsSha256: sha(CONVENER_WORKER_DISPATCH_TARGETS),
  toolsTrioSha256: sha([...m.tools({ governanceModel: "trio" }).tools]),
  toolsSingleSha256: sha([...m.tools({ governanceModel: "single" }).tools]),
  toolsUnknownSha256: sha(m.tools({ governanceModel: "other" })),
  contextLegacySha256: sha(legacyContext),
  dispatchMatrixSha256: sha(dispatchInputs.map((input) => m.dispatch(input))),
  dispatchMatrixCases: dispatchInputs.length,
};
console.log(JSON.stringify(data, null, 2));
