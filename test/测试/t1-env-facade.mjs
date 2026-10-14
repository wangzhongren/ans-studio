export * from '../../app/desktop/pi-config.ts?t1-original';
export function resolveRepoEnvPath() {
  if (!process.env.ANS_T1_ENV_PATH) throw new Error('T1 requires an explicit temporary env file');
  return process.env.ANS_T1_ENV_PATH;
}
