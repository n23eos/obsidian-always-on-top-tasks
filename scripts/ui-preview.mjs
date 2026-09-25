// Local browser fixture using the production view and timer service.
// Run: node scripts/ui-preview.mjs
import { build } from "esbuild";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const bundle = await build({
  entryPoints: [root + "scripts/ui/preview.mjs"],
  bundle: true,
  write: false,
  format: "esm",
  alias: { obsidian: root + "scripts/ui/obsidian.mjs" },
});
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/bundle.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
    } else if (req.url === "/styles.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(await readFile(root + "styles.css"));
    } else if (req.url === "/" || req.url?.startsWith("/?")) {
      res.setHeader("Content-Type", "text/html");
      res.end(await readFile(root + "scripts/ui/preview.html"));
    } else {
      res.writeHead(404).end();
    }
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
server.listen(4319, "127.0.0.1", () => console.log("UI fixture: http://127.0.0.1:4319"));
