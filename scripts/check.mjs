import {readdir,readFile,access} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve,dirname,relative} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
async function walk(dir){const entries=await readdir(dir,{withFileTypes:true});return (await Promise.all(entries.map(e=>e.isDirectory()?walk(resolve(dir,e.name)):[resolve(dir,e.name)]))).flat();}
const files=await walk(resolve(root,'public'));let modules=0;
for(const file of files){
 if(file.endsWith('.mjs')){
  const check=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(check.status)throw Error(check.stderr);
  const s=await readFile(file,'utf8');if(/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB)|node:/.test(s))throw Error(`Dependencia de red/almacenamiento no permitida: ${file}`);
  for(const match of s.matchAll(/^\s*import\s*\{[^}]*\}\s*from\s*['"]([^'"]+)['"]/gm)){if(!match[1].startsWith('.'))throw Error('Import no relativo: '+match[1]);const target=resolve(dirname(file),match[1]);if(relative(resolve(root,'public'),target).startsWith('..'))throw Error('Import fuera de public');await access(target);}modules++;
 }
 if(file.endsWith('.html')){const html=await readFile(file,'utf8');if(!html.includes("connect-src 'none'"))throw Error('Falta CSP de demo.');for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(https?:|data:|blob:)/.test(match[1]))continue;await access(resolve(dirname(file),match[1].split('?')[0]));}}
}
console.log(`VERIFICADO: ${modules} módulos, sintaxis, imports relativos y recursos estáticos. Sin dependencias de API ni almacenamiento persistente.`);
