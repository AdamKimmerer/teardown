// Linting is typescript-eslint's recommended set and nothing else (plan §Conventions 12).
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**"] },
  ...tseslint.configs.recommended,
);
