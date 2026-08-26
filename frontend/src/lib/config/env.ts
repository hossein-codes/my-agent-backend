import { z } from "zod";

/**
 * Typed, validated environment configuration.
 *
 * Two tiers:
 *   - `publicConfig`  — safe to expose (NEXT_PUBLIC_*); usable in Client Components.
 *   - `serverConfig`  — server-only; never import into a Client Component
 *     (Next.js will fail the build if a server-only value leaks to the client).
 *
 * Required variables are validated at module load so a misconfigured deploy
 * fails fast with an actionable message instead of a runtime 500.
 */

const publicSchema = z.object({
  NEXT_PUBLIC_API_URL: z
    .string()
    .url("NEXT_PUBLIC_API_URL must be a valid URL including /api/v1")
    // 127.0.0.1 (not localhost): on Windows `localhost` can resolve to IPv6
    // ::1 first while the dev backend binds IPv4 — a confusing
    // connection-refused when this default kicks in.
    .default("http://127.0.0.1:3000/api/v1"),
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("فروشگاه"),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().min(2).default("fa-IR"),
});

const serverSchema = z.object({
  // Server-side base URL. In production this may point at an internal network.
  API_BASE_URL: z
    .string()
    .url("API_BASE_URL must be a valid URL")
    .optional(),
});

function parseEnv<T extends z.ZodTypeAny>(schema: T, source: NodeJS.ProcessEnv): z.infer<T> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid frontend environment configuration:\n${issues}`);
  }
  return parsed.data;
}

const publicEnv = parseEnv(publicSchema, process.env);
const serverEnv = parseEnv(serverSchema, process.env);

export const publicConfig = {
  apiUrl: publicEnv.NEXT_PUBLIC_API_URL,
  appName: publicEnv.NEXT_PUBLIC_APP_NAME,
  defaultLocale: publicEnv.NEXT_PUBLIC_DEFAULT_LOCALE,
} as const;

/**
 * Server-only config. Importing `serverConfig` from a Client Component will
 * pull non-NEXT_PUBLIC values into the browser bundle — never do that.
 */
export const serverConfig = {
  // Fall back to the public URL when no internal server URL is configured.
  apiUrl: serverEnv.API_BASE_URL ?? publicEnv.NEXT_PUBLIC_API_URL,
} as const;

export type PublicConfig = typeof publicConfig;
