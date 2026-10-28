import {today,addDays} from '../../shared/dates.mjs';
import {decimal} from '../../shared/money.mjs';
import {AppError,fail,requireValue,text,keys} from './errors.mjs';
import {CATEGORIES,DEFAULT_ASSUMPTIONS,assumptions,validateAccount,validateMovement,accountInput,movementInput,effectiveMovement,project} from './domain.mjs';
import {previewRows,suggestMapping,exportRows} from './imports.mjs';
import {parseDelimited,parseFile,exportWorkbook} from './spreadsheets.mjs';

/** Volatile per-document demo, not a database or an authorization boundary. */
export class MemoryTreasury {
  #data;
  constructor({now=Date.now,id=()=>globalThis.crypto.randomUUID()}={}) {
    this.now=now; this.id=id; this.reset();
  }
  day(){return today(this.now());}
  reset(){
    this.#data={scenarios:[],accounts:[],movements:[],files:[],previews:[],audit:[]};
    const day=this.day();
    const base={id:'base',workspace_id:'demo-workspace',name:'Base personal',is_base:1,as_of_date:day,version:1,assumptions_json:JSON.stringify(DEFAULT_ASSUMPTIONS),created_at:this.now(),updated_at:this.now()};
    this.#data.scenarios.push(base);
    const defs=[['Cuenta principal','1234','checking','45230.50'],['Cuenta nómina','5678','checking','25000'],['Reserva','9101','reserve','15200']];
    const accounts=defs.map(([name,lastFour,accountType,openingBalance],i)=>{
      const a={id:`demo-bank-${i+1}`,scenario_id:base.id,workspace_id:base.workspace_id,...validateAccount({name,institution:'Banco de ejemplo',lastFour,accountType,openingBalance,asOfDate:day,reserve:'5000',notes:'Cuenta ficticia para explorar el diseño.'},day),archived_at:null,created_at:this.now()+i};
      this.#data.accounts.push(a);return a;
    });
    const defsM=[['Proveedor A','outflow','5000',1,'confirmed','gastos',0],['Cliente X','inflow','18500',2,'confirmed','',0],['Nómina','outflow','12450',5,'confirmed','nomina',1],['Servicios básicos','outflow','2450',7,'confirmed','gastos',0],['Cliente Y','inflow','22000',12,'pending','',null],['Renta oficina','outflow','8000',15,'confirmed','gastos',0],['Impuestos','outflow','3200',20,'confirmed','impuestos',0],['Ingreso de proyecto','inflow','12000',28,'pending','',0],['Software','outflow','1250',40,'confirmed','gastos',null],['Cobro pendiente de revisar','inflow','3500',-2,'pending','',null]];
    for(const [concept,type,amount,offset,status,category,bank] of defsM)this.insertMovement(base,this.normalizeMovement('base',{concept,type,amount,date:addDays(day,offset),status,category,bankId:bank===null?null:accounts[bank].id,notes:'Ejemplo sintético. No corresponde a una operación real.'}));
    this.insertMovement(base,this.normalizeMovement('base',{concept:'Fondos para nómina',type:'transfer',amount:'7500',date:addDays(day,3),status:'confirmed',fromBankId:accounts[0].id,toBankId:accounts[1].id}));
    for(let month=1;month<=5;month++){
      this.insertMovement(base,this.normalizeMovement('base',{concept:`Cobro de ejemplo ${month}`,type:'inflow',amount:'32000',date:addDays(day,month*30+1),status:'confirmed',bankId:accounts[0].id}));
      this.insertMovement(base,this.normalizeMovement('base',{concept:`Operación de ejemplo ${month}`,type:'outflow',amount:'20500',date:addDays(day,month*30+8),status:'confirmed',category:'costos',bankId:accounts[0].id}));
    }
    this.cloneScenario(base,'Conservador',{...DEFAULT_ASSUMPTIONS,inflowBps:-2000,outflowBps:1000,inflowDelay:7});
    this.cloneScenario(base,'Optimista',{...DEFAULT_ASSUMPTIONS,inflowBps:2000,outflowBps:-500});
    return {reset:true};
  }
  boot(){return {demo:true,user:{id:'demo-user',name:'Demo en memoria',email:'demo@example.invalid'},csrfToken:'',today:this.day(),categories:CATEGORIES,workspaces:[{id:'demo-workspace',name:'Ejemplo ficticio',role:'editor',is_demo:1}]};}
  scenario(_actor,sid){const s=this.#data.scenarios.find(x=>x.id===sid);if(!s)fail(404,'NOT_FOUND','Escenario no disponible.');return s;}
  accounts(sid){return structuredClone(this.#data.accounts.filter(a=>a.scenario_id===sid));}
  movements(sid,{deleted=false}={}){return structuredClone(this.#data.movements.filter(m=>m.scenario_id===sid&&(deleted||!m.deleted_at)).sort((a,b)=>a.sequence-b.sequence).map(m=>({...m,attachment_count:this.#data.files.filter(f=>f.movement_id===m.id).length})));}
  state(sid,opts={}){const s=this.scenario(null,sid),a=this.accounts(sid),m=this.movements(sid),adj=assumptions(JSON.parse(s.assumptions_json));return {scenario:{...s,assumptions:adj},accounts:a,movements:m.map(row=>effectiveMovement(row,adj)),projection:project(s,a,m,{day:this.day(),...opts}),role:'editor',categories:CATEGORIES,today:this.day()};}
  compare(opts={}){return this.#data.scenarios.map(s=>({scenario:s,projection:this.state(s.id,opts).projection}));}
  requireVersion(s,v){if(!Number.isInteger(v))fail(428,'VERSION_REQUIRED','Actualiza la vista antes de guardar.');if(s.version!==v)fail(409,'VERSION_CONFLICT','Otra acción cambió este escenario. Tu borrador se conserva.',{currentVersion:s.version});}
  mutate(sid,version,action,fn){
    const s=this.scenario(null,sid);this.requireVersion(s,version);const previous=structuredClone(this.#data);
    try{const result=fn(s);s.version++;s.updated_at=this.now();this.log(action,sid);return {result,version:s.version};}catch(error){this.#data=previous;throw error;}
  }
  log(action,entity){this.#data.audit.unshift({id:this.id(),actor:'Visitante de la demo',action,entity_id:entity,created_at:this.now()});this.#data.audit.length=Math.min(this.#data.audit.length,100);}
  account(sid,id){const a=this.#data.accounts.find(a=>a.scenario_id===sid&&a.id===id);if(!a)fail(404,'NOT_FOUND','Cuenta no disponible en este escenario.');return a;}
  movement(sid,id,{deleted=false}={}){const m=this.#data.movements.find(m=>m.scenario_id===sid&&m.id===id&&(deleted||!m.deleted_at));if(!m)fail(404,'NOT_FOUND','Movimiento no disponible en este escenario.');return m;}
  normalizeMovement(sid,input,original=null){const accounts=this.accounts(sid).map(a=>original&&[original.bank_id,original.from_bank_id,original.to_bank_id].includes(a.id)?{...a,archived_at:null}:a);return validateMovement(input,accounts,this.day());}
  insertMovement(s,values){const all=this.#data.movements.filter(m=>m.scenario_id===s.id);requireValue(all.length<10000,'Máximo 10,000 movimientos por escenario.');const row={id:this.id(),scenario_id:s.id,workspace_id:s.workspace_id,sequence:all.reduce((n,m)=>Math.max(n,m.sequence),0)+1,...values,created_at:this.now(),updated_at:this.now(),deleted_at:null,undo_until:null};this.#data.movements.push(row);return row;}
  accountImpact(sid,id){const a=this.account(sid,id),linked=this.movements(sid).filter(m=>[m.bank_id,m.from_bank_id,m.to_bank_id].includes(id));return {account:a,scheduled:linked.filter(m=>m.execution==='scheduled').length,total:linked.length,transfers:linked.filter(m=>m.type==='transfer').length};}
  uniqueName(name,except=''){name=text(name,'Nombre del escenario',60);requireValue(!this.#data.scenarios.some(s=>s.id!==except&&s.name.toLocaleLowerCase('es')===name.toLocaleLowerCase('es')),'Ya existe un escenario con ese nombre.');return name;}
  cloneContent(source,target,{materialize=false}={}){
    const map=new Map();
    for(const a of this.accounts(source.id)){const id=this.id();map.set(a.id,id);this.#data.accounts.push({...a,id,scenario_id:target.id});}
    for(const m of this.movements(source.id)){
      const id=this.id(),copy={...m,id,scenario_id:target.id};delete copy.attachment_count;
      for(const k of ['bank_id','from_bank_id','to_bank_id'])if(copy[k])copy[k]=map.get(copy[k]);
      if(materialize&&copy.execution==='scheduled'){const eff=effectiveMovement(m,JSON.parse(source.assumptions_json));requireValue(BigInt(eff.effective_cents)>0n&&BigInt(eff.effective_cents)<=999999999999999n,'Los supuestos producen un importe fuera del rango.');copy.amount_cents=eff.effective_cents;copy.expected_date=eff.effective_date;}
      this.#data.movements.push(copy);
      for(const f of this.#data.files.filter(f=>f.movement_id===m.id))this.#data.files.push({...f,id:this.id(),scenario_id:target.id,movement_id:id});
    }
  }
  cloneScenario(source,name,adj=JSON.parse(source.assumptions_json)){
    requireValue(this.#data.scenarios.length<11,'Máximo 10 simulaciones.');const row={...source,id:this.id(),name:this.uniqueName(name),is_base:0,version:1,assumptions_json:JSON.stringify(assumptions(adj)),created_at:this.now(),updated_at:this.now()};
    this.#data.scenarios.push(row);this.cloneContent(source,row);return row;
  }
  async request(path,{method='GET',data={},version,raw,filename,signal}={}){
    if(signal?.aborted)throw new DOMException('Cancelado','AbortError');
    const result=await this.route(new URL(path,'https://demo.invalid'),{method,data,version,raw,filename,signal});
    return structuredClone(result); // Consumers cannot accidentally mutate the source.
  }
  async route(url,{method,data,version,raw,filename,signal}){
    const path=url.pathname,opts={days:Number(url.searchParams.get('days')||90),includePending:url.searchParams.get('pending')!=='0'};
    const postOpts={days:data.days||90,includePending:data.includePending!==false};
    if(path==='/api/session'&&method==='GET')return this.boot();
    if(path==='/api/demo/reset'&&method==='POST')return this.reset();
    const workspace=/^\/api\/workspaces\/([^/]+)\/(scenarios|compare|export-comparison|audit)$/.exec(path);
    if(workspace){requireValue(workspace[1]==='demo-workspace','Espacio ficticio desconocido.');const kind=workspace[2];
      if(kind==='scenarios'&&method==='GET')return this.#data.scenarios;
      if(kind==='compare'&&method==='GET')return this.compare(opts);
      if(kind==='audit'&&method==='GET')return this.#data.audit;
      if(kind==='scenarios'&&method==='POST'){const source=this.scenario(null,data.sourceId);this.requireVersion(source,version);const previous=structuredClone(this.#data);try{const target=this.cloneScenario(source,data.name);this.log('scenario.create',target.id);return {result:target,version:1};}catch(error){this.#data=previous;throw error;}}
      if(kind==='export-comparison'&&method==='POST')return exportWorkbook({rows:[['Escenario','Saldo actual','Saldo mínimo','Saldo final','Primer faltante'],...this.compare(postOpts).map(x=>[x.scenario.name,decimal(x.projection.current),decimal(x.projection.minimum),decimal(x.projection.final),x.projection.firstShortfall||''])],amountColumns:[1,2,3],dateColumns:[4]});
    }
    const match=/^\/api\/scenarios\/([^/]+)(?:\/(.*))?$/.exec(path);
    if(!match)fail(404,'DEMO_ROUTE','Esta función no forma parte de la demo en memoria.');
    const [,sid,tail='']=match,s=this.scenario(null,sid),parts=tail.split('/'),[kind,id,action]=parts;
    if(!tail){
      if(method==='GET')return this.state(sid,opts);
      if(method==='PATCH')return this.mutate(sid,version,'scenario.update',()=>{keys(data,['name','assumptions']);requireValue(!s.is_base,'Edita los supuestos en una simulación.');if(data.name!==undefined)s.name=this.uniqueName(data.name,sid);if(data.assumptions!==undefined)s.assumptions_json=JSON.stringify(assumptions(data.assumptions));return s;});
      if(method==='DELETE'){this.requireVersion(s,version);requireValue(!s.is_base,'Base no puede eliminarse.');this.#data.scenarios=this.#data.scenarios.filter(x=>x.id!==sid);for(const collection of ['accounts','movements','files','previews'])this.#data[collection]=this.#data[collection].filter(x=>x.scenario_id!==sid);this.log('scenario.delete',sid);return {deleted:true};}
    }
    if(kind==='accounts'){
      if(!id&&method==='POST')return this.mutate(sid,version,'account.create',()=>{requireValue(this.accounts(sid).length<50,'Máximo 50 cuentas.');const a={id:this.id(),scenario_id:sid,workspace_id:s.workspace_id,...validateAccount(data,this.day()),archived_at:null,created_at:this.now()};this.#data.accounts.push(a);return a;});
      if(action==='impact'&&method==='GET')return this.accountImpact(sid,id);
      if(!action&&method==='PATCH')return this.mutate(sid,version,'account.update',()=>{const a=this.account(sid,id);Object.assign(a,validateAccount({...accountInput(a),...data},this.day()));return a;});
      if(action==='duplicate'&&method==='POST')return this.mutate(sid,version,'account.duplicate',()=>{requireValue(this.accounts(sid).length<50,'Máximo 50 cuentas.');const a=this.account(sid,id),copy={...a,id:this.id(),name:`${a.name.slice(0,50)} · copia`,opening_cents:'0',last_four:'',archived_at:null,as_of_date:this.day(),created_at:this.now()};this.#data.accounts.push(copy);return copy;});
      if(action==='archive'&&method==='POST')return this.mutate(sid,version,'account.archive',()=>{requireValue(typeof data.archive==='boolean','Estado inválido.');const impact=this.accountImpact(sid,id);requireValue(!data.archive||!impact.scheduled,'Resuelve o reasigna los movimientos programados antes de desactivar la cuenta.');this.account(sid,id).archived_at=data.archive?this.now():null;return {id,archived:data.archive,impact};});
    }
    if(kind==='movements'){
      if(!id&&method==='POST')return this.mutate(sid,version,'movement.create',()=>this.insertMovement(s,this.normalizeMovement(sid,data)));
      if(id==='batch'&&method==='PATCH')return this.mutate(sid,version,'movements.batch',()=>{const {ids,patch}=data;requireValue(Array.isArray(ids)&&ids.length>0&&ids.length<=500&&new Set(ids).size===ids.length,'Selecciona de 1 a 500 movimientos únicos.');keys(patch,['date','status','bankId','category']);requireValue(Object.keys(patch).length,'Elige campos para cambiar.');const originals=ids.map(i=>this.movement(sid,i));if('bankId'in patch)requireValue(originals.every(m=>m.type!=='transfer'),'Edita cuentas de traspaso individualmente.');if('category'in patch)requireValue(originals.every(m=>m.type==='outflow'),'Categorías solo para pagos.');const changes=originals.map(m=>this.normalizeMovement(sid,{...movementInput(m),...patch},m));originals.forEach((m,i)=>Object.assign(m,changes[i],{updated_at:this.now()}));return {updated:ids.length};});
      if(!action&&method==='PATCH')return this.mutate(sid,version,'movement.update',()=>{const m=this.movement(sid,id);Object.assign(m,this.normalizeMovement(sid,{...movementInput(m),...data},m),{updated_at:this.now()});return m;});
      if(!action&&method==='DELETE')return this.mutate(sid,version,'movement.delete',()=>{const m=this.movement(sid,id),until=this.now()+5000;m.deleted_at=this.now();m.undo_until=until;return {id,undoUntil:until};});
      if(action==='undo'&&method==='POST')return this.mutate(sid,version,'movement.undo',()=>{const m=this.movement(sid,id,{deleted:true});requireValue(m.deleted_at&&this.now()<m.undo_until,'El plazo de cinco segundos terminó.');requireValue([m.bank_id,m.from_bank_id,m.to_bank_id].filter(Boolean).every(i=>!this.account(sid,i).archived_at),'Reactiva las cuentas antes de recuperar el movimiento.');m.deleted_at=null;m.undo_until=null;return {id};});
      if(action==='duplicate'&&method==='POST')return this.mutate(sid,version,'movement.duplicate',()=>{const old=this.movement(sid,id);return this.insertMovement(s,this.normalizeMovement(sid,{...movementInput(old),date:old.expected_date<this.day()?this.day():old.expected_date,execution:'scheduled',actualDate:null,actualAmount:null,...data}));});
      if(action==='attachments'){
        this.movement(sid,id);
        if(method==='GET')return this.#data.files.filter(f=>f.scenario_id===sid&&f.movement_id===id).map(({bytes,...meta})=>meta);
        if(method==='POST'){
          requireValue(raw instanceof Blob&&raw.size>0&&raw.size<=5*1024*1024,'Máximo 5 MiB por archivo.');const bytes=new Uint8Array(await raw.arrayBuffer());
          const mime=new TextDecoder().decode(bytes.slice(0,5))==='%PDF-'?'application/pdf':Array.from(bytes.slice(0,8)).join(',')==='137,80,78,71,13,10,26,10'?'image/png':Array.from(bytes.slice(0,3)).join(',')==='255,216,255'?'image/jpeg':null;requireValue(mime,'Solo PDF, PNG o JPG reconocido.');
          return this.mutate(sid,version,'attachment.create',()=>{requireValue(this.#data.files.filter(f=>f.movement_id===id).length<3,'Máximo tres archivos por movimiento.');requireValue(this.#data.files.reduce((n,f)=>n+f.size,0)+bytes.length<=30*1024*1024,'La demo admite hasta 30 MiB de adjuntos en memoria.');const f={id:this.id(),scenario_id:sid,movement_id:id,name:text(filename,'Archivo',120),mime,bytes,size:bytes.length,created_at:this.now()};this.#data.files.push(f);return {id:f.id,name:f.name,mime};});
        }
      }
    }
    if(kind==='attachments'&&id&&method==='GET'){const f=this.#data.files.find(f=>f.scenario_id===sid&&f.id===id);requireValue(f,'Archivo temporal no disponible.');this.movement(sid,f.movement_id);return new Blob([f.bytes],{type:f.mime});}
    if(kind==='apply'&&method==='POST'){
      this.requireVersion(s,version);const base=this.scenario(null,'base');this.requireVersion(base,data.baseVersion);requireValue(!s.is_base,'Elige una simulación.');const previous=structuredClone(this.#data);
      try{const backup=this.cloneScenario(base,`Base anterior · ${this.day()} · ${this.id().slice(0,6)}`);for(const k of ['accounts','movements','files'])this.#data[k]=this.#data[k].filter(x=>x.scenario_id!=='base');this.cloneContent(s,base,{materialize:true});base.assumptions_json=JSON.stringify(DEFAULT_ASSUMPTIONS);base.as_of_date=s.as_of_date;base.version++;this.log('scenario.apply','base');return {baseId:'base',backupId:backup.id,version:base.version};}catch(error){this.#data=previous;throw error;}
    }
    if(kind==='imports'&&method==='POST'){
      if(id==='parse'){const parsed=raw?await parseFile(raw,filename,{signal}):parseDelimited(data.text,data.delimiter||'auto');return {...parsed,sheets:parsed.sheets.map(sheet=>({...sheet,mapping:suggestMapping(sheet.rows)}))};}
      if(id==='preview'){this.requireVersion(s,version);this.#data.previews=this.#data.previews.filter(p=>p.expiresAt>this.now());requireValue(this.#data.previews.length<10,'Cierra o espera a que expiren las revisiones anteriores.');const report=previewRows(this,sid,data),p={id:this.id(),scenario_id:sid,scenarioVersion:version,expiresAt:this.now()+600000,...report};this.#data.previews.push(p);return p;}
      if(id==='commit')return this.mutate(sid,version,'movements.import',()=>{const p=this.#data.previews.find(p=>p.id===data.previewId&&p.scenario_id===sid&&p.expiresAt>this.now());requireValue(p,'Revisión expirada o no disponible.');this.requireVersion(s,p.scenarioVersion);requireValue(Array.isArray(data.rows)&&data.rows.length>0&&data.rows.length<=5000&&new Set(data.rows).size===data.rows.length,'Selección inválida.');const selected=data.rows.map(n=>{const r=p.rows.find(r=>r.rowNumber===n);requireValue(r?.input&&!r.errors.length,'Fila inválida.');requireValue(!r.duplicate||data.allowDuplicates===true,'Confirma los posibles duplicados.');return this.normalizeMovement(sid,r.input);});requireValue(this.movements(sid,{deleted:true}).length+selected.length<=10000,'Máximo 10,000 operaciones.');for(const m of selected)this.insertMovement(s,m);this.#data.previews=this.#data.previews.filter(x=>x!==p);return {count:selected.length};});
    }
    if(kind==='export'&&method==='POST'){this.requireVersion(s,version);return exportWorkbook(exportRows(this,null,sid,data.ids));}
    if(kind==='summary-export'&&method==='POST'){const v=this.state(sid,postOpts).projection;return exportWorkbook({rows:[['Indicador','Importe (MXN)','Fecha'],['Saldo actual',decimal(v.current),v.day],['Cobros previstos',decimal(v.inflows),v.end],['Pagos previstos',decimal(v.outflows),v.end],['Saldo mínimo',decimal(v.minimum),v.minimumDate],['Saldo final',decimal(v.final),v.end],['Faltante proyectado',decimal(v.shortfall),v.firstShortfall||'']],amountColumns:[1],dateColumns:[2]});}
    fail(404,'DEMO_ROUTE','Esta acción no está disponible en la demo.');
  }
}
