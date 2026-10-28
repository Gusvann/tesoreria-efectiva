import { addDays, isoDate } from '../../shared/dates.mjs';
import { cents as parseCents, roundRatio } from '../../shared/money.mjs';
import { requireValue, text, keys } from './errors.mjs';
function cents(value,options){try{return parseCents(value,options);}catch(error){requireValue(false,error.message,'INVALID_AMOUNT');}}
export const CATEGORIES = [
  { id: 'costos', label: 'Costos' }, { id: 'gastos', label: 'Gastos' }, { id: 'nomina', label: 'Nómina' },
  { id: 'financieros', label: 'Financieros' }, { id: 'impuestos', label: 'Impuestos' }, { id: 'otros', label: 'Otros' },
];
export const DEFAULT_ASSUMPTIONS = { inflowBps: 0, outflowBps: 0, inflowDelay: 0, outflowDelay: 0 };
export function assumptions(value = {}) {
  keys(value, Object.keys(DEFAULT_ASSUMPTIONS));
  const result = { ...DEFAULT_ASSUMPTIONS, ...value };
  for (const [key, v] of Object.entries(result)) {
    requireValue(Number.isInteger(v) && (key.endsWith('Bps') ? v >= -9900 && v <= 100000 : v >= -365 && v <= 365), 'Ajustes: porcentajes de -99% a 1000%; demoras de -365 a 365 días.');
  }
  return result;
}
export function validateAccount(input, day) {
  keys(input, ['name','institution','lastFour','accountType','openingBalance','asOfDate','reserve','notes']);
  requireValue(isoDate(input.asOfDate) && input.asOfDate <= day, 'La fecha de corte debe ser real y no posterior a hoy.');
  requireValue(['checking','savings','investment','reserve','corporate'].includes(input.accountType), 'Tipo de cuenta inválido.');
  requireValue(typeof (input.lastFour ?? '') === 'string' && /^(?:\d{4})?$/.test(input.lastFour ?? ''), 'Usa solo los últimos cuatro dígitos o deja el campo vacío.');
  return { name: text(input.name,'Nombre',60), institution: text(input.institution,'Banco',60,{optional:true}),
    last_four: input.lastFour || '', account_type: input.accountType,
    opening_cents: String(cents(input.openingBalance,{allowNegative:true})), as_of_date: input.asOfDate,
    reserve_cents: String(cents(input.reserve || '0')), notes: text(input.notes,'Notas',1000,{optional:true}) };
}
export function accountInput(a) { return {name:a.name,institution:a.institution,lastFour:a.last_four,accountType:a.account_type,openingBalance:dec(a.opening_cents),asOfDate:a.as_of_date,reserve:dec(a.reserve_cents),notes:a.notes}; }
function dec(n) { n=BigInt(n); const a=n<0n?-n:n; return `${n<0n?'-':''}${a/100n}.${String(a%100n).padStart(2,'0')}`; }
export function validateMovement(input, accounts, day) {
  keys(input,['type','date','concept','amount','status','execution','actualDate','actualAmount','bankId','fromBankId','toBankId','category','reference','notes']);
  requireValue(['inflow','outflow','transfer'].includes(input.type), 'Elige Cobro, Pago o Traspaso.');
  requireValue(isoDate(input.date), 'La fecha programada no es válida.');
  requireValue(['confirmed','pending'].includes(input.status), 'Elige Confirmado o Por confirmar.');
  const execution = input.execution || 'scheduled';
  requireValue(['scheduled','realized','cancelled'].includes(execution), 'Estado de ejecución inválido.');
  const actualDate = execution==='realized' ? input.actualDate : null;
  if (execution==='realized') requireValue(isoDate(actualDate) && actualDate<=day, 'La fecha real no puede ser futura.');
  const accountId = (value, optional=false) => {
    if (!value && optional) return null;
    requireValue(typeof value==='string' && accounts.some(a=>a.id===value && !a.archived_at), 'Elige una cuenta activa de este escenario.');
    return value;
  };
  const transfer = input.type==='transfer';
  const bank = transfer ? null : accountId(input.bankId,true);
  const from = transfer ? accountId(input.fromBankId) : null, to = transfer ? accountId(input.toBankId) : null;
  requireValue(!transfer || from!==to, 'Las cuentas del traspaso deben ser diferentes.');
  const category = input.type==='outflow' ? (input.category || '') : '';
  requireValue(category==='' || CATEGORIES.some(x=>x.id===category), 'Categoría inválida.');
  return {type:input.type,expected_date:input.date,concept:text(input.concept,'Concepto',120),amount_cents:String(cents(input.amount,{allowZero:false})),
    status:input.status,execution,actual_date:actualDate,actual_amount_cents:execution==='realized'?String(cents(input.actualAmount || input.amount,{allowZero:false})):null,
    bank_id:bank,from_bank_id:from,to_bank_id:to,category,reference:text(input.reference,'Referencia',120,{optional:true}),notes:text(input.notes,'Notas',1000,{optional:true})};
}
export function movementInput(m) { return {type:m.type,date:m.expected_date,concept:m.concept,amount:dec(m.amount_cents),status:m.status,execution:m.execution,actualDate:m.actual_date,actualAmount:m.actual_amount_cents?dec(m.actual_amount_cents):null,bankId:m.bank_id,fromBankId:m.from_bank_id,toBankId:m.to_bank_id,category:m.category,reference:m.reference,notes:m.notes}; }
export function effectiveMovement(m, adj) {
  if (m.execution!=='scheduled') return {...m,effective_date:m.expected_date,effective_cents:m.amount_cents};
  let amount=BigInt(m.amount_cents), date=m.expected_date;
  if(m.type==='inflow') { amount=roundRatio(amount,10000+adj.inflowBps,10000); date=addDays(date,adj.inflowDelay); }
  if(m.type==='outflow') { amount=roundRatio(amount,10000+adj.outflowBps,10000); date=addDays(date,adj.outflowDelay); }
  return {...m,effective_date:date,effective_cents:String(amount)};
}
/** Returns cents as strings; unassigned funds stay explicitly separate. */
export function project(scenario, accounts, allMovements, {day,days=90,includePending=true}={}) {
  requireValue(isoDate(day) && Number.isInteger(days) && days>=1 && days<=365, 'Horizonte inválido.');
  const adj=assumptions(JSON.parse(scenario.assumptions_json)), movements=allMovements.filter(m=>!m.deleted_at);
  const bankBalances=new Map(accounts.map(a=>[a.id,BigInt(a.opening_cents)]));
  const accountById=new Map(accounts.map(a=>[a.id,a]));
  let unassigned=0n;
  for(const m of movements) {
    if(m.execution!=='realized' || m.actual_date>day) continue;
    const n=BigInt(m.actual_amount_cents);
    const apply=(id, delta)=>{ const bank=accountById.get(id); if(bank && m.actual_date>=bank.as_of_date) bankBalances.set(id,bankBalances.get(id)+delta); };
    if(m.type==='transfer'){apply(m.from_bank_id,-n);apply(m.to_bank_id,n);}
    else if(m.bank_id) apply(m.bank_id,m.type==='inflow'?n:-n);
    else if(m.actual_date>=scenario.as_of_date) unassigned+=m.type==='inflow'?n:-n;
  }
  const current=[...bankBalances.values()].reduce((sum,v)=>sum+v,unassigned), end=addDays(day,days);
  const scheduled=movements.filter(m=>m.execution==='scheduled'&&(includePending||m.status==='confirmed')).map(m=>effectiveMovement(m,adj));
  const daily=new Map(), categoryTotals=new Map(CATEGORIES.map(x=>[x.id,0n])); categoryTotals.set('',0n);
  let incoming=0n,outgoing=0n,due7=0n,overdue=0n,unassignedPlanned=0n,overdueCount=0,due7Count=0;
  const monthMap=new Map();
  for(const m of scheduled) {
    if(m.effective_date>end) continue;
    const date=m.effective_date<day?day:m.effective_date, n=BigInt(m.effective_cents);
    if(!daily.has(date)) daily.set(date,[]); daily.get(date).push(m);
    const month=date.slice(0,7); if(!monthMap.has(month)) monthMap.set(month,{month,inflows:0n,outflows:0n});
    if(m.type==='inflow'){incoming+=n;monthMap.get(month).inflows+=n;}
    if(m.type==='outflow'){outgoing+=n;monthMap.get(month).outflows+=n;categoryTotals.set(m.category,(categoryTotals.get(m.category)||0n)+n);if(date<=addDays(day,7)){due7+=n;due7Count++;}}
    if(m.effective_date<day){overdueCount++;if(m.type==='outflow')overdue+=n;}
    if(m.type!=='transfer'&&!m.bank_id) unassignedPlanned+=m.type==='inflow'?n:-n;
  }
  const series=[], bankMin=new Map(bankBalances), forecastBanks=new Map(bankBalances);
  let running=current,min=current,minDate=day,firstShortfall=current<0n?day:null;
  for(let i=0;i<=days;i++) {
    const date=addDays(day,i);
    for(const m of daily.get(date)||[]) {
      const n=BigInt(m.effective_cents);
      if(m.type==='transfer') {forecastBanks.set(m.from_bank_id,(forecastBanks.get(m.from_bank_id)||0n)-n);forecastBanks.set(m.to_bank_id,(forecastBanks.get(m.to_bank_id)||0n)+n);}
      else { const impact=m.type==='inflow'?n:-n; running+=impact; if(m.bank_id) forecastBanks.set(m.bank_id,(forecastBanks.get(m.bank_id)||0n)+impact); }
    }
    for(const [id,value]of forecastBanks) if(value<(bankMin.get(id)??value)) bankMin.set(id,value);
    if(running<min){min=running;minDate=date;} if(running<0n&&!firstShortfall)firstShortfall=date;
    series.push({date,balance:String(running)});
  }
  return {day,end,days,includePending,current:String(current),unassignedCurrent:String(unassigned),inflows:String(incoming),outflows:String(outgoing),
    due7:String(due7),due7Count,overdue:String(overdue),overdueCount,unassignedPlanned:String(unassignedPlanned),
    final:String(running),minimum:String(min),minimumDate:minDate,shortfall:String(min<0n?-min:0n),firstShortfall,
    monthlyAverage:String(roundRatio(running-current,30,days)),net:String(running-current),series,
    categories:[...categoryTotals].map(([id,total])=>({id,label:CATEGORIES.find(x=>x.id===id)?.label||'Sin categoría',total:String(total)})),
    months:[...monthMap.values()].sort((a,b)=>a.month.localeCompare(b.month)).map(v=>({...v,inflows:String(v.inflows),outflows:String(v.outflows)})),
    accounts:accounts.map(a=>({...a,current_cents:String(bankBalances.get(a.id)),projected_cents:String(forecastBanks.get(a.id)),minimum_cents:String(bankMin.get(a.id)),below_reserve:(bankMin.get(a.id)||0n)<BigInt(a.reserve_cents)}))};
}
