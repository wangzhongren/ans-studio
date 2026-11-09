import { createHash } from "node:crypto";
import { ORACLE_GOLDEN_PAYLOAD } from "../test/roles/convener/oracle-fixture.ts";
const sha = createHash("sha256").update(JSON.stringify(ORACLE_GOLDEN_PAYLOAD)).digest("hex");
console.log(sha);
