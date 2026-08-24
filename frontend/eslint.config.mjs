import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated static assets (MSW worker, etc.):
    "public/**",
    // Dev-only sample data / mock handlers are not production code but still
    // type-checked; skip linting of generated mocks.
    "src/mocks/**",
  ]),
]);

export default eslintConfig;
