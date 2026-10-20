import esbuild from "esbuild";
import process from "process";

const isProduction = process.argv[2] === "production";

// Obsidian provides these modules at runtime — never bundle them.
const externals = [
  "obsidian",
  "electron",
  "@electron/remote",
  "@codemirror/autocomplete",
  "@codemirror/collab",
  "@codemirror/commands",
  "@codemirror/language",
  "@codemirror/lint",
  "@codemirror/search",
  "@codemirror/state",
  "@codemirror/view",
  "@lezer/common",
  "@lezer/highlight",
  "@lezer/lr",
];

// Build fixed, self-contained main-process code into the ordinary main.js asset.
// No paths, note contents, settings or other user input enter the source string.
const quitGuardSource = {
  name: "quit-guard-source",
  setup(build) {
    build.onResolve({ filter: /^tfa:quit-guard-source$/ }, () => ({
      path: "quit-guard-source", namespace: "tfa-native",
    }));
    build.onLoad({ filter: /.*/, namespace: "tfa-native" }, async () => {
      const result = await esbuild.build({
        entryPoints: ["src/quit/mainProcessGuard.ts"], bundle: true, write: false,
        format: "cjs", platform: "node", target: "es2021",
      });
      const source = result.outputFiles[0].text
        + "\nmodule.exports.installMainProcessQuitGuard(electron, timers, options);";
      return {
        contents: `export default ${JSON.stringify(source)};`, loader: "js",
        watchFiles: [new URL("./src/quit/mainProcessGuard.ts", import.meta.url).pathname],
      };
    });
  },
};

const context = await esbuild.context({
  plugins: [quitGuardSource],
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: externals,
  format: "cjs",
  target: "es2021",
  logLevel: "info",
  sourcemap: isProduction ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
});

if (isProduction) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
