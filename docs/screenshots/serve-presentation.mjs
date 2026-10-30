import {build} from "esbuild";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
const root=new URL("../../",import.meta.url);
createServer(async(req,res)=>{try{if(req.url==="/bundle.js"){const b=await build({entryPoints:[new URL("presentation.mjs",import.meta.url).pathname],bundle:true,write:false,format:"esm",alias:{obsidian:new URL("scripts/ui/obsidian.mjs",root).pathname}});res.setHeader("Content-Type","text/javascript");res.end(b.outputFiles[0].text)}else if(req.url==="/styles.css"){res.setHeader("Content-Type","text/css");res.end(await readFile(new URL("styles.css",root)))}else{res.setHeader("Content-Type","text/html");res.end(await readFile(new URL("presentation.html",import.meta.url)))}}catch(e){res.writeHead(500).end(String(e))}}).listen(4320,"127.0.0.1",()=>console.log("Presentation: http://127.0.0.1:4320/?presentation=1&feature=focus"));
