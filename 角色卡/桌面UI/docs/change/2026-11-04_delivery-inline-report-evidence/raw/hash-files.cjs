// Compute SHA-256 and git-blob SHA-1 (git hash-object equivalent) for candidate files.
const fs = require("node:fs");
const crypto = require("node:crypto");
for (const file of process.argv.slice(2)) {
  const data = fs.readFileSync(file);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  const blob = crypto
    .createHash("sha1")
    .update("blob " + data.length + "\0")
    .update(data)
    .digest("hex");
  console.log(`${file}\n  sha256 ${sha256}\n  git-hash-object ${blob}`);
}
