# Flake disclosure: initial-workflow wiring files — intermittent file-level process exit stall

## Symptom

After fixing the canonical roots (guard) and the fixture root canonicalization (trunk workflow-source
`realpath(dir)===dir`), both initial-workflow wiring files execute their test bodies successfully
(`✔ wiring initial workflow…`, `ℹ pass 1`) but the test process sometimes fails to exit. `node --test`
then reports the *file-level* test as failed at its timeout:
  ✖ test\编排\git-action-authorization-wiring-initial-workflow.test.ts (240000.49ms) 'test failed'

No failing test name, no assertion error; the test body already passed. With the CI 300s per-test
timeout the same symptom would surface as a file-level timeout after the body passed.

## Evidence that is NOT a releaseable handle leak

- An `after()` hook that schedules a 5s unref'd diagnostic timer *before* disposing sessions never ran
  the timer during hangs; no active-handle dump could be produced (a pure pending Promise cannot keep
  Node alive, so the loop is not idle-waiting — it is not a classic ref'd handle leak).
- A `NODE_OPTIONS=--import` probe confirmed the module loads in the process; its 30s unref'd timer also
  never fired during hangs.
- `--test-isolation=none` hangs too (2/8), so it is not child-process isolation.
- CPU during a hang was not measured here, but the shape matches B1b record §6 residual: "suite finished,
  native main-thread CPU spin, no listening/established sockets, V8 profiler root/idle; not releaseable
  from the test file" (角色卡/测试/docs/change/2026-11-16_test-debt-b1b-chief-workflow-exit.md §0.6).

## Observed rates (Windows 11, Node v24.22.1; each run ~13s; external 45–55s wall timeout)

- junction TEMP, default runner: 3 hangs / 20 runs (also 1 / 12 in an earlier batch)
- plain TEMP, default runner: 1 hang / 12 runs
- junction TEMP, `--test-isolation=none`: 2 hangs / 8 runs
- audit-failure variant: 1 hang / 12 runs in one batch; 6× loop all natural; 3× final batch all natural

## Verification used instead

`node --test --test-force-exit --test-concurrency=1 --test-timeout=120000 <file>` (flag allowed by the
task with disclosure): both files P P P. Logs: `08-force-exit-*.log`.

## Recommendation (owner decision; B3c does not change workflow)

1. Consider `--test-force-exit` in `test-ci.yml` (already raised in B1b §6; development-feedback workflow).
2. Or upgrade Node (CI 24.14.0; local 24.22.1 also exhibits) / investigate the runtime spin separately.
3. B3c did not introduce the spin: the same class was observed by B1b before/after its fix; B3c's harness
   fix only lets these two files reach full-chain execution for the first time (previously they failed
   early at the guard and never started the write-file prompt chain).
