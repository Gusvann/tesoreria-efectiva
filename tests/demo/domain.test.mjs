import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, money, decimal, roundRatio, excelAmount } from '../../public/shared/money.mjs';
import { isoDate, addDays } from '../../public/shared/dates.mjs';
import { project, assumptions, validateMovement, DEFAULT_ASSUMPTIONS } from '../../public/assets/demo/domain.mjs';
const day='2026-10-27';
const scenario={as_of_date:day,assumptions_json:JSON.stringify(DEFAULT_ASSUMPTIONS)};
const bank=(id,amount='2500000')=>({id,name:id,opening_cents:amount,reserve_cents:'0',as_of_date:day});
const mov=(id,amount='10000',extra={})=>({id,type:'outflow',expected_date:day,amount_cents:amount,status:'confirmed',execution:'scheduled',category:'',...extra});
function calc(accounts,movements,extra={}){return project(scenario,accounts,movements,{day,days:30,...extra});}
test('Dinero: exactitud de entrada, formato contable y cero editable',()=>{
 for(const value of ['1234.5','1,234.50','$1,234.50','MXN 1,234.50'])assert.equal(cents(value),123450n);
 assert.equal(decimal('0'),'0.00');assert.equal(money('-123450'),'($1,234.50)');
 assert.equal(money('999999999999999999'),'$9,999,999,999,999,999.99');
 for(const value of ['', '1.001','1,23','1e3','abc','1.234,50',null,123.45])assert.throws(()=>cents(value));
 assert.throws(()=>cents('0',{allowZero:false}));assert.throws(()=>cents('-1'));
 assert.equal(cents('-12.30',{allowNegative:true}),-1230n);
});
test('Dinero Excel: residuos diminutos no son pagos cero',()=>{assert.throws(()=>excelAmount(1e-15));assert.throws(()=>excelAmount(1.001));assert.equal(excelAmount(0.1+0.2),30n);});
test('Fechas reales y cruce de mes/año',()=>{assert.equal(isoDate('2026-02-30'),false);assert.equal(isoDate('2028-02-29'),true);assert.equal(addDays('2026-12-31',1),'2027-01-01');});
test('Saldo cero exacto no produce un faltante falso',()=>{
 const p=calc([bank('a')],[mov('a','625001',{expected_date:addDays(day,1)}),mov('b','1874999',{expected_date:addDays(day,2)})]);
 assert.equal(p.final,'0');assert.equal(p.firstShortfall,null);
});
test('Precisión agregada superior a Number.MAX_SAFE_INTEGER',()=>{
 const p=calc(Array.from({length:10},(_,i)=>bank(String(i),'999999999999999')),[mov('x','1',{type:'inflow'})]);
 assert.equal(p.current,'9999999999999990');assert.equal(p.final,'9999999999999991');
});
test('Traspasos programados conservan caja y mueven sus cuentas exactamente',()=>{
 for(let i=1;i<=100;i++){
  const n=String(i*719),p=calc([bank('a'),bank('b','100000')],[mov('t',n,{type:'transfer',from_bank_id:'a',to_bank_id:'b'})]);
  assert.equal(p.final,p.current);
  assert.equal(BigInt(p.accounts[0].projected_cents)+BigInt(p.accounts[1].projected_cents),BigInt(p.current));
 }
});
test('Vencidos permanecen en proyección hasta realizarse o cancelarse',()=>{
 const p=calc([bank('a')],[mov('p','10000',{expected_date:addDays(day,-3)}),mov('c','50000',{execution:'cancelled'})]);
 assert.equal(p.final,'2490000');assert.equal(p.overdueCount,1);assert.equal(p.due7,'10000');
});
test('Realizados anteriores al corte no se descuentan de nuevo',()=>{
 const p=calc([bank('a')],[mov('r','10000',{bank_id:'a',execution:'realized',actual_date:addDays(day,-1),actual_amount_cents:'10000'})]);
 assert.equal(p.current,'2500000');assert.equal(p.final,'2500000');
});
test('Realizados del día afectan saldo real una sola vez y usan importe real',()=>{
 const p=calc([bank('a')],[mov('r','10000',{bank_id:'a',execution:'realized',actual_date:day,actual_amount_cents:'9500'})]);
 assert.equal(p.current,'2490500');assert.equal(p.final,'2490500');assert.equal(p.outflows,'0');
});
test('Banco opcional afecta consolidado sin inventar cuenta',()=>{
 const p=calc([bank('a')],[mov('p')]);assert.equal(p.final,'2490000');assert.equal(p.accounts[0].projected_cents,'2500000');assert.equal(p.unassignedPlanned,'-10000');
});
test('La certeza no oculta realizados ni afecta movimientos confirmados',()=>{
 const p=calc([bank('a')],[mov('p','10000',{status:'pending'}),mov('r','5000',{status:'pending',execution:'realized',actual_date:day,actual_amount_cents:'5000',bank_id:'a'})],{includePending:false});
 assert.equal(p.final,'2495000');assert.equal(p.outflows,'0');
});
test('Escenarios: supuestos alteran solo programados y no mutan los datos originales',()=>{
 const source=[mov('i','10000',{type:'inflow',expected_date:addDays(day,1)}),mov('r','2000',{type:'inflow',execution:'realized',actual_date:day,actual_amount_cents:'2000'})];
 const frozen=structuredClone(source),s={...scenario,assumptions_json:JSON.stringify({...DEFAULT_ASSUMPTIONS,inflowBps:1000,inflowDelay:2})};
 const p=project(s,[bank('a')],source,{day,days:5});assert.equal(p.current,'2502000');assert.equal(p.final,'2513000');assert.equal(p.series[2].balance,'2502000');assert.deepEqual(source,frozen);
});
test('Un solo centavo negativo es faltante; no se oculta por redondeo',()=>{const p=calc([bank('a','0')],[mov('x','1')]);assert.equal(p.firstShortfall,day);assert.equal(p.shortfall,'1');});
test('Validaciones de traspaso, cuenta ajena, ejecución futura y porcentajes',()=>{
 const valid={concept:'Prueba',date:day,type:'outflow',amount:'10',status:'confirmed'};
 assert.ok(validateMovement(valid,[bank('a')],day));
 assert.throws(()=>validateMovement({...valid,bankId:'ajena'},[bank('a')],day));
 assert.throws(()=>validateMovement({...valid,type:'transfer',fromBankId:'a',toBankId:'a'},[bank('a')],day));
 assert.throws(()=>validateMovement({...valid,execution:'realized',actualDate:addDays(day,1)},[bank('a')],day));
 assert.throws(()=>assumptions({inflowBps:-10000}));assert.throws(()=>assumptions({secret:1}));assert.equal(roundRatio(101n,10500,10000),106n);
});
