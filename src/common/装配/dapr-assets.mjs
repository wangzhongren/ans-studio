import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { Arch } from "electron-builder";

const execute = promisify(execFile);
const version = "1.19.1";
const release = `https://github.com/dapr/dapr/releases/download/v${version}`;
const license = {
  file: "DAPR-LICENSE",
  sha256: "9523eacf5421b65637420755c00b5175f7804b6a6eb736b86cd10ea6b3937dcf",
  url: `https://raw.githubusercontent.com/dapr/dapr/v${version}/LICENSE`,
};
// Hashes published alongside the corresponding upstream release assets.
const targets = {
  "win-x64": {
    daprd: ["daprd_windows_amd64.zip", "f2dbc4bb4f3a2e35780c089609e732097bc0f8a92cb36e6e5602fb3668742467"],
    scheduler: ["scheduler_windows_amd64.zip", "4d819af9bdb7134b21ae76571c9c9b3908a4f8522cc1f84d95d1174dcd629213"],
  },
  "mac-x64": {
    daprd: ["daprd_darwin_amd64.tar.gz", "65b25f9729770152b91a2aa2a4565ed6c05a9e923b471567eb1398f699ad000b"],
    scheduler: ["scheduler_darwin_amd64.tar.gz", "8f8e5012abfd6b27ea8f457b257e09b25b11050313dda8b1485012af2016f532"],
  },
  "mac-arm64": {
    daprd: ["daprd_darwin_arm64.tar.gz", "bc23005f138ea3c4cab51dedb3b62566df96f975ed1263cdfe37a10a0260c00a"],
    scheduler: ["scheduler_darwin_arm64.tar.gz", "b0499c714d20b7a072c834aa59efa673d9cc14a234bab8056424b746fe291b11"],
  },
};

async function digest(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

async function digestIfExists(file) {
  return digest(file).catch((error) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
}

async function verified(file, sha256) {
  const actual = await digestIfExists(file);
  if (actual === undefined) return false;
  if (actual !== sha256) throw new Error(`Dapr asset checksum mismatch: ${file}`);
  return true;
}

async function fetchAsset(asset, cache, scratch) {
  const local = join(cache, asset.file);
  if (process.env.ANS_DAPR_ASSET_CACHE) {
    const supplied = resolve(process.env.ANS_DAPR_ASSET_CACHE, asset.file);
    if (await verified(supplied, asset.sha256)) return supplied;
  }
  if (await verified(local, asset.sha256)) return local;
  const response = await fetch(asset.url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok || !response.body) throw new Error(`Dapr asset download failed: ${asset.file} (${response.status})`);
  const pending = join(scratch, asset.file);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(pending, { flags: "wx" }));
  if (!await verified(pending, asset.sha256)) throw new Error(`Dapr asset is missing: ${asset.file}`);
  await rename(pending, local);
  return local;
}

async function prepare(projectDirectory, platform, arch) {
  const target = `${platform}-${arch}`;
  if (!Object.hasOwn(targets, target)) throw new Error(`Dapr ${version} is not bundled for ${target}`);
  const staging = join(projectDirectory, "release-output", "dapr-assets");
  const cache = join(staging, "cache", version);
  const output = join(staging, target, "dapr-runtime");
  await mkdir(cache, { recursive: true });
  await mkdir(output, { recursive: true });
  const scratch = await mkdtemp(join(staging, "prepare-"));
  try {
    const runtime = {};
    for (const [name, [file, sha256]] of Object.entries(targets[target])) {
      const url = `${release}/${file}`;
      const archive = await fetchAsset({ file, sha256, url }, cache, scratch);
      const binary = platform === "win" ? name + ".exe" : name;
      await execute("tar", ["-xf", archive, "-C", scratch, binary], { windowsHide: true });
      const extracted = join(scratch, binary);
      await chmod(extracted, 0o755);
      const binaryHash = await digest(extracted);
      runtime[name] = {
        file: binary, bytes: (await stat(extracted)).size, sha256: binaryHash,
        upstream: { file, sha256, url },
      };
      // Windows holds running executables open. An already identical staged asset can be reused.
      const destination = join(output, binary);
      if (await digestIfExists(destination) !== binaryHash) await rename(extracted, destination);
    }
    await copyFile(await fetchAsset(license, cache, scratch), join(output, license.file));
    await writeFile(join(output, "manifest.json"), JSON.stringify({
      daprRuntime: version,
      target,
      license: { spdx: "Apache-2.0", ...license },
      runtime,
    }, null, 2) + "\n");
    console.log(`Prepared Dapr ${version} ${target} at ${output}`);
  } finally {
    if (dirname(await realpath(scratch)) === await realpath(staging)) {
      await rm(scratch, { recursive: true, force: true });
    }
  }
}

export async function beforePack(context) {
  await prepare(context.packager.projectDir, context.packager.platform.buildConfigurationKey, Arch[context.arch]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const platform = process.platform === "win32" ? "win" : process.platform === "darwin" ? "mac" : process.platform;
  await prepare(fileURLToPath(new URL("../../../", import.meta.url)), platform, process.arch);
}
