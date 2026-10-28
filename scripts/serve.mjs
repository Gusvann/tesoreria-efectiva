/** Optional development FILE server. There is no API or persistence here. */
import {createServer} from 'node:http';
import {readFile,realpath,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
const root=await realpath(fileURLToPath(new URL('../public/',import.meta.url))),port=Number(process.env.PORT||8080);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT inválido.');
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  const path=decodeURIComponent(new URL(req.url,'http://local.invalid').pathname);
  let file=resolve(root,'.'+path);if(path.endsWith('/'))file=resolve(file,'index.html');
  const real=await realpath(file);if(!real.startsWith(root+sep)||(await stat(real)).isDirectory()){res.writeHead(404);return res.end();}
  const bytes=await readFile(real);res.writeHead(200,{'Content-Type':types[extname(real)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Length':bytes.length});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(404,{'Content-Type':'text/plain; charset=utf-8'});res.end('Archivo no disponible.');}
});
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`El puerto ${port} ya está en uso. Elige otro mediante la variable PORT.`:'No se pudo iniciar el servidor estático: '+error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Tesorería efectiva · demo sintética: http://127.0.0.1:${port}\nSolo archivos estáticos; todos los cambios viven en la memoria del navegador.`));
