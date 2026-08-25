/**
 * Prisma CLI configuration (replaces the deprecated `package.json#prisma` key).
 *
 * Why this file exists: as soon as it is present, the Prisma CLI stops loading
 * any env file itself and prints
 *
 *     "Prisma config detected, skipping environment variable loading"
 *
 * so DATABASE_URL has to be loaded *here*, before the CLI resolves the schema
 * and the datasource — otherwise every command fails with
 * "Environment variable not found: DATABASE_URL".
 *
 * Order matters. `loadEnvFiles` stops at the first file that provides
 * `DATABASE_URL`, so the list must start with the plain `.env` that
 * `npm run env:setup` creates (and that both Nest and this CLI read). The
 * per-environment file stays as the fallback for anyone who keeps one.
 *
 * Precedence: real process env → .env → .env.<NODE_ENV>
 */
import { loadEnvFiles } from './prisma/env-loader';

loadEnvFiles(['.env', `.env.${process.env.NODE_ENV ?? 'development'}`], 'DATABASE_URL');

export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
};
