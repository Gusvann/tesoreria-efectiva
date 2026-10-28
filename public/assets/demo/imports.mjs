import { decimal, cents } from '../../shared/money.mjs';
import { isoDate } from '../../shared/dates.mjs';
import { CATEGORIES, movementInput } from './domain.mjs';
import { requireValue, fail, keys } from './errors.mjs';
export const IMPORT_FIELDS=['date','concept','amount','type','status','execution','actualDate','actualAmount','bank','bankId','fromBank','fromBankId','toBank','toBankId','category','reference','notes','sourceId'];
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const aliases={date:['fecha','fecha programada','date'],concept:['concepto','descripcion','concept'],amount:['importe','importe mxn','monto','amount'],type:['tipo','type'],status:['estatus','certeza','status'],execution:['ejecucion','estado','execution'],actualDate:['fecha real'],actualAmount:['importe real','importe real mxn'],bank:['banco','cuenta','nombre cuenta'],bankId:['id banco','id cuenta'],fromBank:['banco origen','cuenta origen'],fromBankId:['id banco origen','id cuenta origen'],toBank:['banco destino','cuenta destino'],toBankId:['id banco destino','id cuenta destino'],category:['categoria'],reference:['referencia'],notes:['notas'],sourceId:['id','id movimiento']};
export function suggestMapping(rows,headerRow=1){const headers=headerRow?(rows[headerRow-1]||[]).map(c=>normalize(c?.value??c)):[];return Object.fromEntries(IMPORT_FIELDS.map(field=>{const hits=headers.flatMap((h,i)=>aliases[field].includes(h)?[i]:[]);return [field,hits.length===1?hits[0]:null];}));}
function dateValue(value,order='DMY'){
 const v=String(value??'').trim();if(isoDate(v))return v;const parts=/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v);if(!parts)return null;
 const date=`${parts[3]}-${parts[order==='MDY'?1:2].padStart(2,'0')}-${parts[order==='MDY'?2:1].padStart(2,'0')}`;return isoDate(date)?date:null;
}
function fingerprint(input){return JSON.stringify([input.date,normalize(input.concept),input.type,input.amount,input.bankId||'',input.fromBankId||'',input.toBankId||'']);}
export function previewRows(service,sid,payload){
 keys(payload,['rows','mapping','headerRow','dateOrder','numberFormat','defaultType','ignoreBanks']);
 const {rows,mapping}=payload,header=payload.headerRow??1;
 requireValue(Array.isArray(rows)&&rows.length>0&&rows.length<=5001&&rows.every(r=>Array.isArray(r)&&r.length<=50),'Máximo 5,000 movimientos y 50 columnas.');
 requireValue(Number.isInteger(header)&&header>=0&&header<rows.length,'Fila de encabezados inválida.');
 requireValue(rows.length-header<=5000,'Máximo 5,000 movimientos.');keys(mapping,IMPORT_FIELDS);
 const columns=Object.values(mapping).filter(x=>x!==null&&x!==undefined);
 requireValue(columns.every(x=>Number.isInteger(x)&&x>=0&&x<50)&&new Set(columns).size===columns.length,'Revisa la relación de columnas.');
 requireValue(['date','concept','amount'].every(k=>mapping[k]!=null),'Relaciona Fecha, Concepto e Importe.');
 requireValue(['DMY','MDY'].includes(payload.dateOrder||'DMY')&&['es-MX','es-ES'].includes(payload.numberFormat||'es-MX'),'Formato de fecha o importe inválido.');
 const accounts=service.accounts(sid),existing=service.movements(sid),keysSeen=new Set(existing.map(m=>fingerprint(movementInput(m)))),idsSeen=new Set(existing.map(m=>m.id)),report=[];
 function resolve(name,id,{required=false,ignore=false}={}){
  if(ignore&&!required)return null;
  const label=String(name??'').trim(),identifier=String(id??'').trim();
  const matches=identifier?accounts.filter(a=>a.id===identifier&&!a.archived_at):accounts.filter(a=>normalize(a.name)===normalize(label)&&!a.archived_at);
  if(identifier){requireValue(matches.length===1,`La cuenta con ID «${identifier.slice(0,60)}» no está activa. Reasigna o importa sin banco.`);requireValue(!label||normalize(label)===normalize(matches[0].name),'El nombre de banco y su ID no coinciden. Corrige la fila.');return identifier;}
  if(!label||['sin banco','sin banco asignado'].includes(normalize(label))){requireValue(!required,'El traspaso requiere dos cuentas.');if(matches.length)fail(422,'AMBIGUOUS_BANK','El nombre coincide con una etiqueta vacía; especifica el ID.');return null;}
  requireValue(matches.length===1,`Cuenta «${label.slice(0,60)}»: no existe o tiene un nombre duplicado. Usa su ID.`);return matches[0].id;
 }
 for(let index=header;index<rows.length;index++){
  const source=rows[index];if(source.every(c=>String(c?.value??c??'').trim()===''))continue;
  const errors=[],warnings=[];let input=null;
  const cell=field=>mapping[field]==null?null:source[mapping[field]];
  const value=field=>{const c=cell(field);return c&&typeof c==='object'?c.value:c;};
  try{
   for(const field of IMPORT_FIELDS){const c=cell(field);if(c&&typeof c==='object'){requireValue(!c.error,String(c.error||''));if(c.formula)warnings.push('Se usa el valor guardado de una fórmula; no se recalcula.');}requireValue(value(field)==null||['string','number','boolean'].includes(typeof value(field)),'Contenido de celda inválido.');requireValue(String(value(field)??'').length<=32767,'Una celda contiene demasiado texto.');}
   const aliasesType={cobro:'inflow',ingreso:'inflow',inflow:'inflow',pago:'outflow',egreso:'outflow',outflow:'outflow',traspaso:'transfer',transferencia:'transfer',transfer:'transfer'};
   const statusType={confirmado:'confirmed',confirmed:'confirmed','por confirmar':'pending',pendiente:'pending',pending:'pending'};
   const executionType={programado:'scheduled',scheduled:'scheduled',realizado:'realized',realized:'realized',cancelado:'cancelled',cancelled:'cancelled'};
   const moneyValue=v=>{let raw=String(v??'').trim();if(payload.numberFormat==='es-ES'){requireValue(/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw),'Importe con separadores no válidos.');raw=raw.replaceAll('.','').replace(',','.');}return decimal(cents(raw,{allowZero:false}));};
   input={date:dateValue(value('date'),payload.dateOrder),concept:String(value('concept')??''),amount:moneyValue(value('amount')),type:aliasesType[normalize(value('type')||payload.defaultType||'Pago')],status:statusType[normalize(value('status')||'Confirmado')],execution:executionType[normalize(value('execution')||'Programado')],reference:String(value('reference')??''),notes:String(value('notes')??'')};
   requireValue(Boolean(input.type)&&Boolean(input.status)&&Boolean(input.execution),'Tipo, estatus o ejecución inválidos.');
   if(input.execution==='realized'){input.actualDate=dateValue(value('actualDate')||value('date'),payload.dateOrder);input.actualAmount=moneyValue(value('actualAmount')||value('amount'));}
   if(input.type==='transfer'){input.fromBankId=resolve(value('fromBank'),value('fromBankId'),{required:true});input.toBankId=resolve(value('toBank'),value('toBankId'),{required:true});}
   else input.bankId=resolve(value('bank'),value('bankId'),{ignore:payload.ignoreBanks===true});
   if(input.type==='outflow'){const category=normalize(value('category'));input.category=category&&category!=='sin categoria'?CATEGORIES.find(x=>normalize(x.id)===category||normalize(x.label)===category)?.id||'__invalid':'';}
   input=movementInput(service.normalizeMovement(sid,input));
   if(input.date<service.day())warnings.push(input.execution==='scheduled'?'Programado vencido: se proyectará hoy hasta que lo resuelvas.':'Registro histórico; se aplicará según la fecha de corte.');
  }catch(error){errors.push(error.message);input=null;}
  const sourceId=String(value('sourceId')??''),key=input?fingerprint(input):null,duplicate=Boolean((sourceId&&idsSeen.has(sourceId))||(key&&keysSeen.has(key)));
  if(input){keysSeen.add(key);if(sourceId)idsSeen.add(sourceId);}
  report.push({rowNumber:index+1,concept:String(value('concept')??'').slice(0,120),input,errors,warnings,duplicate});
 }
 return {rows:report,summary:{valid:report.filter(r=>r.input).length,invalid:report.filter(r=>!r.input).length,duplicates:report.filter(r=>r.duplicate).length}};
}
export function exportRows(service,actor,sid,ids){
 const s=service.scenario(actor,sid),all=service.movements(sid),a=service.accounts(sid),bankName=id=>a.find(x=>x.id===id)?.name||'';
 if(ids!==undefined)requireValue(Array.isArray(ids)&&ids.length<=10000&&new Set(ids).size===ids.length&&ids.every(id=>all.some(m=>m.id===id)),'Selección de exportación inválida.');
 const selected=ids?all.filter(m=>ids.includes(m.id)):all;
 const headers=['Fecha','Concepto','Tipo','Estatus','Importe (MXN)','Banco','ID banco','Categoría','Cuenta origen','ID banco origen','Cuenta destino','ID banco destino','Ejecución','Fecha real','Importe real (MXN)','Referencia','Notas','ID'];
 const rows=selected.sort((x,y)=>x.expected_date.localeCompare(y.expected_date)||x.sequence-y.sequence).map(m=>[m.expected_date,m.concept,{inflow:'Cobro',outflow:'Pago',transfer:'Traspaso'}[m.type],m.status==='confirmed'?'Confirmado':'Por confirmar',decimal(m.amount_cents),bankName(m.bank_id),m.bank_id||'',CATEGORIES.find(x=>x.id===m.category)?.label||'',bankName(m.from_bank_id),m.from_bank_id||'',bankName(m.to_bank_id),m.to_bank_id||'',{scheduled:'Programado',realized:'Realizado',cancelled:'Cancelado'}[m.execution],m.actual_date||'',m.actual_amount_cents?decimal(m.actual_amount_cents):'',m.reference,m.notes,m.id]);
 return {rows:[headers,...rows],dateColumns:[0,13],amountColumns:[4,14],widths:[14,32,15,20,23,25,38,20,25,38,25,38,15,14,23,20,40,38]};
}
