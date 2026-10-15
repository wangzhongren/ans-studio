// Run using Electron with ELECTRON_RUN_AS_NODE=1. No model or remote API call.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createCodexRuntimeAdapter } from '../../src/provider/codex/session.ts';
import { harness, options, role } from './fixtures.ts';

assert.ok(process.versions.electron, 'probe must use the actual Electron executable');
const root = await mkdtemp(path.join(os.tmpdir(), 'ans-codex-electron-'));
try {
  const session = await createCodexRuntimeAdapter(options(root, harness(), {
    engineFactory: undefined,
    env: { CODEX_API_KEY: 'local-no-model-probe', PATH: process.env.PATH },
  })).bindRole(role);
  assert.equal(session.runtime, 'codex');
  assert.ok(session.nativeSessionId);
  await session.dispose();
  console.log(JSON.stringify({ status: 'passed', electron: process.versions.electron, runtime: session.runtime, nativeThreadCreated: true, modelRequests: 0 }));
} finally { await rm(root, { recursive: true, force: true }); }
