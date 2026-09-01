import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

// recommendedTypeChecked — the typed rules the catalog review runs;
// eslint-plugin-obsidianmd — the official guideline rules of ObsidianReviewBot.
export default tseslint.config(
  { ignores: ["main.js", "*.mjs", "scripts/**", "node_modules/**", "macos/**"] },
  ...tseslint.configs.recommendedTypeChecked,
  ...obsidianmd.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: { project: "./tsconfig.json", tsconfigRootDir: import.meta.dirname },
    },
  },
);
