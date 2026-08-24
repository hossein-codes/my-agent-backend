/**
 * Prisma CLI configuration (replaces the deprecated `package.json#prisma` key).
 *
 * Why this file exists: the Prisma CLI only auto-loads a file named exactly
 * `.env`. This repo keeps per-environment files (`.env.development`,
 * `.env.staging`, ...) which Nest and `prisma/seed.ts` read, so without this
 * the CLI fails with "Environment variable not found: DATABASE_URL".
 *
 * Precedence matches the rest of the repo: real env → .env.<NODE_ENV> → .env
 */
import { loadEnvFiles } from './prisma/env-loader';

loadEnvFiles([`.env.${process.env.NODE_ENV ?? 'development'}`, '.env'], 'DATABASE_URL');

export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
};
