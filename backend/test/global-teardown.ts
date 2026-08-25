import { cleanupE2eRun } from "./harness";

export default async function globalTeardown(): Promise<void> {
  await cleanupE2eRun();
}
