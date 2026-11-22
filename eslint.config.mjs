import { defineConfig, globalIgnores } from "eslint/config";
import tslint from "typescript-eslint";
import eslint from "@eslint/js";
import globals from "globals";

export default defineConfig([
  // Standalone Vite app with its own package.json and typecheck.
  globalIgnores(["dashboard/"]),
  eslint.configs.recommended,
  tslint.configs.recommended,
  {
    files: ["src/**/*.mts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "error",
    },
  },
  {
    files: ["src/plugins/**/*.mts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^\\.\\./(?!shared)",
              message:
                "Plugins can only import from the shared folder (not from other project folders)",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
