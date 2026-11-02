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
    // @opennextjs/cloudflare build output and local workerd state.
    ".open-next/**",
    ".wrangler/**",
    // Generated workers types (`wrangler types`).
    "worker-configuration.d.ts",
    // Standalone Node utility scripts (CommonJS `require` is idiomatic there).
    "scripts/**/*.cjs",
  ]),
]);

export default eslintConfig;
