import { defineConfig } from "eslint/config";
import tslint from "typescript-eslint";
import eslint from "@eslint/js";

export default defineConfig([
  eslint.configs.recommended,
  tslint.configs.recommended,
]);
