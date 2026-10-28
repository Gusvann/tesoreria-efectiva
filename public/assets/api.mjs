import {MemoryTreasury} from './demo/store.mjs';
// Singleton tied to this document only. No request or persistent storage is used.
const memory=new MemoryTreasury();
export class ApiError extends Error {constructor(message,status,code,details){super(message);Object.assign(this,{status,code,details});}}
export function setCsrf(){} // Kept only to preserve the view contract; there is no login.
export async function api(path,options={}){
  try{return await memory.request(path,options);}
  catch(error){if(error.name==='AbortError')throw error;throw new ApiError(error.message||'No se pudo completar la acción de prueba.',error.status||422,error.code||'DEMO_VALIDATION',error.details);}
}
export async function downloadFile(path,options,name){
 const blob=await api(path,options),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
