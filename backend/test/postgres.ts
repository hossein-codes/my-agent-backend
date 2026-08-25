import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

interface CommandResult {
  stdout: string;
  stderr: string;
}

/**
 * A disposable PostgreSQL cluster backed by the platform binary package from
 * @embedded-postgres. The ESM-only `embedded-postgres` wrapper is deliberately
 * not imported: Jest transpiles this project to CommonJS.
 */
export class EmbeddedPostgres {
  private running = false;

  private constructor(
    readonly rootDir: string,
    readonly dataDir: string,
    readonly logFile: string,
    readonly port: number,
    readonly url: string,
    private readonly initdb: string,
    private readonly pgCtl: string,
    private readonly binaryEnv: NodeJS.ProcessEnv,
  ) {}

  static async start(): Promise<EmbeddedPostgres> {
    const rootDir = await mkdtemp(
      join(tmpdir(), `fashion-e2e-pg-${process.pid}-`),
    );
    const dataDir = join(rootDir, "data");
    const logFile = join(rootDir, "server.log");
    const port = await freePort();

    const { initdb, pgCtl, env } = resolvePostgresBinaries();
    const postgres = new EmbeddedPostgres(
      rootDir,
      dataDir,
      logFile,
      port,
      `postgresql://postgres@127.0.0.1:${port}/postgres?schema=public`,
      initdb,
      pgCtl,
      env,
    );

    try {
      await run(
        initdb,
        [
          "--pgdata",
          dataDir,
          "--username",
          "postgres",
          "--auth",
          "trust",
          "--encoding",
          "UTF8",
          "--no-locale",
        ],
        env,
      );

      // -F is pg_ctl's short form for fsync=off. The explicit server options
      // keep durability work out of a cluster whose lifetime is one test run.
      await run(
        pgCtl,
        [
          "--pgdata",
          dataDir,
          "--log",
          logFile,
          "--wait",
          "--timeout",
          "30",
          "start",
          "--options",
          `-h 127.0.0.1 -p ${port} -k ${rootDir} -F -c synchronous_commit=off -c full_page_writes=off`,
        ],
        env,
      );
      postgres.running = true;
      return postgres;
    } catch (error) {
      const serverLog = await readFile(logFile, "utf8").catch(
        () => "server.log was not created",
      );
      await postgres.stop();
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${detail}\n\nPostgreSQL server.log:\n${serverLog}`);
    }
  }

  async stop(): Promise<void> {
    try {
      if (this.running) {
        await run(
          this.pgCtl,
          [
            "--pgdata",
            this.dataDir,
            "--wait",
            "--timeout",
            "30",
            "stop",
            "--mode",
            "immediate",
          ],
          this.binaryEnv,
        );
      }
    } finally {
      this.running = false;
      await rm(this.rootDir, { recursive: true, force: true });
    }
  }
}

async function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a PostgreSQL port"));
        return;
      }
      const { port } = address;
      server.close((error) => (error ? reject(error) : resolvePort(port)));
    });
  });
}

function resolvePostgresBinaries(): {
  initdb: string;
  pgCtl: string;
  env: NodeJS.ProcessEnv;
} {
  const target = platformPackage();
  let entry: string;
  try {
    // require.resolve reads the package export without evaluating its ESM file.
    // We then execute initdb/pg_ctl directly as required by the e2e harness.
    entry = require.resolve(target);
  } catch (error) {
    throw new Error(
      `PostgreSQL binary package ${target} is unavailable for ${process.platform}/${process.arch}: ${(error as Error).message}`,
    );
  }

  const packageRoot = resolve(dirname(entry), "..");
  const nativeDir = join(packageRoot, "native");
  const binDir = join(nativeDir, "bin");
  const libDir = join(nativeDir, "lib");
  const extension = process.platform === "win32" ? ".exe" : "";
  const pathKey =
    Object.keys(process.env).find((key) => key.toLowerCase() === "path") ??
    "PATH";
  const oldPath = process.env[pathKey] ?? "";

  return {
    initdb: join(binDir, `initdb${extension}`),
    pgCtl: join(binDir, `pg_ctl${extension}`),
    env: {
      ...process.env,
      [pathKey]: `${binDir}${process.platform === "win32" ? ";" : ":"}${oldPath}`,
      LD_LIBRARY_PATH: [libDir, process.env.LD_LIBRARY_PATH]
        .filter(Boolean)
        .join(":"),
      DYLD_LIBRARY_PATH: [libDir, process.env.DYLD_LIBRARY_PATH]
        .filter(Boolean)
        .join(":"),
    },
  };
}

function platformPackage(): string {
  const platform = process.platform === "win32" ? "windows" : process.platform;
  const supported = new Set([
    "darwin-arm64",
    "darwin-x64",
    "linux-arm",
    "linux-arm64",
    "linux-ia32",
    "linux-ppc64",
    "linux-x64",
    "windows-x64",
  ]);
  const target = `${platform}-${process.arch}`;
  if (!supported.has(target)) {
    throw new Error(
      `No @embedded-postgres binary is published for ${process.platform}/${process.arch}`,
    );
  }
  return `@embedded-postgres/${target}`;
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<CommandResult> {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout
      .setEncoding("utf8")
      .on("data", (chunk: string) => (stdout += chunk));
    child.stderr
      .setEncoding("utf8")
      .on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolveCommand({ stdout, stderr });
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed (${signal ? `signal ${signal}` : `exit ${String(code)}`})` +
            `${stdout ? `\nstdout:\n${stdout}` : ""}${stderr ? `\nstderr:\n${stderr}` : ""}`,
        ),
      );
    });
  });
}
