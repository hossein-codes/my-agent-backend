import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { PrismaService } from "../src/shared/prisma/prisma.service";
import { EmbeddedPostgres } from "./postgres";

const backendRoot = resolve(__dirname, "..");

export interface E2eAvailability {
  available: boolean;
  reason?: string;
}

declare global {
  // globalSetup and globalTeardown run in the same Jest parent process. Test
  // environments receive DATABASE_URL through process.env, not this object.
  // eslint-disable-next-line no-var
  var __FASHION_E2E_POSTGRES__: EmbeddedPostgres | undefined;
}

/**
 * Detects the checked-in @prisma/client placeholder. Merely requiring the
 * package is insufficient: its stub exists on disk and throws only at `new`.
 */
export function isE2eAvailable(): E2eAvailability {
  const inheritedReason = process.env.E2E_UNAVAILABLE_REASON;
  if (inheritedReason) return { available: false, reason: inheritedReason };

  try {
    const client = new PrismaClient();
    void client.$disconnect();
    return { available: true };
  } catch (error) {
    return {
      available: false,
      reason:
        "Prisma Client تولید نشده است. ابتدا `npm run prisma:generate` را اجرا کنید. " +
        `جزئیات: ${(error as Error).message}`,
    };
  }
}

/** Starts the one disposable database shared by this Jest invocation. */
export async function prepareE2eRun(): Promise<void> {
  const availability = isE2eAvailable();
  if (!availability.available) {
    process.env.E2E_UNAVAILABLE_REASON = availability.reason;
    console.warn(`[e2e skipped] ${availability.reason}`);
    return;
  }

  const postgres = await EmbeddedPostgres.start();
  globalThis.__FASHION_E2E_POSTGRES__ = postgres;
  configureTestEnvironment(postgres.url);

  try {
    await runPrisma(["db", "push", "--skip-generate", "--accept-data-loss"]);
    // Prisma cannot represent CHECK constraints in schema.prisma. db push
    // creates all models/FKs/enums; this companion SQL installs the database-
    // only financial and inventory invariants that these tests are meant to
    // exercise.
    await runPrisma(["db", "execute", "--file", "prisma/integrity.sql"]);
    await runPrisma(["db", "seed"]);
  } catch (error) {
    await postgres.stop();
    globalThis.__FASHION_E2E_POSTGRES__ = undefined;
    throw error;
  }
}

/** Stops PostgreSQL and recursively removes its data/log directory. */
export async function cleanupE2eRun(): Promise<void> {
  const postgres = globalThis.__FASHION_E2E_POSTGRES__;
  globalThis.__FASHION_E2E_POSTGRES__ = undefined;
  if (postgres) await postgres.stop();
}

/**
 * A real AppModule instance configured exactly like production HTTP bootstrap:
 * global prefix, auth/permission guards, validation pipe and exception filter.
 */
export class E2eHarness {
  private constructor(
    readonly app: INestApplication,
    readonly prisma: PrismaService,
  ) {}

  static async boot(): Promise<E2eHarness> {
    if (!process.env.DATABASE_URL) {
      throw new Error("E2E database was not prepared by Jest globalSetup");
    }

    // Dynamic imports are intentional: globalSetup sets all provider/database
    // environment variables before ConfigModule/AppModule are evaluated.
    const [
      { NestFactory },
      { AppModule },
      { configureApp },
      { AppConfigService },
      { PrismaService },
    ] = await Promise.all([
      import("@nestjs/core"),
      import("../src/app.module"),
      import("../src/app.setup"),
      import("../src/config/app-config.service"),
      import("../src/shared/prisma/prisma.service"),
    ]);

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
    configureApp(app, app.get(AppConfigService));
    await app.init();
    return new E2eHarness(app, app.get(PrismaService));
  }

  get httpServer(): ReturnType<INestApplication["getHttpServer"]> {
    return this.app.getHttpServer() as ReturnType<
      INestApplication["getHttpServer"]
    >;
  }

  /** Truncates every application table and restores the canonical seed. */
  async reset(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`
      DO $reset$
      DECLARE table_list text;
      BEGIN
        SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
          INTO table_list
          FROM pg_tables
         WHERE schemaname = 'public'
           AND tablename <> '_prisma_migrations';
        IF table_list IS NOT NULL THEN
          EXECUTE 'TRUNCATE TABLE ' || table_list || ' RESTART IDENTITY CASCADE';
        END IF;
      END
      $reset$;
    `);
    await runPrisma(["db", "seed"]);
  }

  async close(): Promise<void> {
    await this.app.close();
  }
}

function configureTestEnvironment(databaseUrl: string): void {
  Object.assign(process.env, {
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    REDIS_URL: "memory",
    PAYMENT_PROVIDER: "mock",
    SMS_PROVIDER: "console",
    EMAIL_PROVIDER: "console",
    STORAGE_PROVIDER: "local",
    SWAGGER_ENABLED: "false",
    API_PREFIX: "api/v1",
    FRONTEND_BASE_URL: "http://frontend.e2e.test",
    PUBLIC_BASE_URL: "http://api.e2e.test",
    JWT_ACCESS_SECRET: "e2e-access-secret-with-at-least-32-characters",
    OTP_HASH_PEPPER: "e2e-otp-pepper-with-at-least-32-characters",
    AUDIT_HASH_KEY: "e2e-audit-key-with-at-least-32-characters",
    DATA_ENCRYPTION_KEY: "e2e-encryption-key-with-at-least-32-chars",
    OTP_FIXED_CODE: "246810",
    OTP_RESEND_COOLDOWN_SECONDS: "1",
  });
}

function runPrisma(args: string[]): Promise<void> {
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, ["--no-install", "prisma", ...args], {
      cwd: backendRoot,
      env: { ...process.env, NO_COLOR: "1" },
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
        resolveCommand();
        return;
      }
      reject(
        new Error(
          `prisma ${args.join(" ")} failed (${signal ? `signal ${signal}` : `exit ${String(code)}`})` +
            `${stdout ? `\nstdout:\n${stdout}` : ""}${stderr ? `\nstderr:\n${stderr}` : ""}`,
        ),
      );
    });
  });
}
