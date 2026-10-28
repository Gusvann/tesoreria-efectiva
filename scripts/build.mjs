import {cp,rm,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),dist=new URL('dist/',root);
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
await cp(new URL('public/',root),dist,{recursive:true});await writeFile(new URL('.nojekyll',dist),'');
console.log(`Sitio estático listo: ${fileURLToPath(dist)}. No se publicó en Internet.`);
