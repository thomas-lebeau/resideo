import { defineConfig } from "eslint/config";
import tslint from "typescript-eslint";
import eslint from "@eslint/js";

export default defineConfig([
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
    env: {
      node: true,
    },
  },
]);
