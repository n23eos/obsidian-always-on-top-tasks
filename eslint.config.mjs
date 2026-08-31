import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["main.js", "*.mjs", "scripts/**", "node_modules/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
  },
);
