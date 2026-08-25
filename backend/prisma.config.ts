/**
 * Prisma CLI configuration (replaces the deprecated `package.json#prisma` key).
 *
 * IMPORTANT: when this file exists the Prisma CLI stops loading `.env` by
 * itself ("Prisma config detected, skipping environment variable loading"),
 * so loading env here is mandatory — not a convenience.
 *
 * Precedence: real process env → .env → .env.<NODE_ENV>
 * `.env` comes first because that is the file `npm run env:setup` writes and
 * the only one the Prisma CLI would otherwise understand.
 */
import { loadEnvFiles } from './prisma/env-loader';

loadEnvFiles(['.env', `.env.${process.env.NODE_ENV ?? 'development'}`], 'DATABASE_URL');

export default {
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
};
