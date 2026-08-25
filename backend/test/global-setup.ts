import { prepareE2eRun } from "./harness";

export default async function globalSetup(): Promise<void> {
  await prepareE2eRun();
}
