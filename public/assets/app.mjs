import {api,setCsrf} from './api.mjs';
import {e,icon,btn,cents,decimal,money,input} from './components.mjs';
import {dateLabel} from '../shared/dates.mjs';
import {dashboard} from './views/dashboard.mjs';
import {banks,bankOptions,bankDetail,bankTools} from './views/banks.mjs';
import {movements,movementTable,movementDetail,defaultFilters,filtered} from './views/movements.mjs';
import {scenarios} from './views/scenarios.mjs';
import {dialogs} from './dialogs.mjs';
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const S={page:document.body.dataset.view,boot:null,wid:params.get('workspace'),sid:params.get('scenario'),data:null,scenarios:[],comparison:[],days:[7,30,90,180,365].includes(Number(params.get('days')))?Number(params.get('days')):90,pending:params.get('pending')!=='0',bankId:null,bankSearch:'',bankSort:'balance',bankTab:'summary',showArchived:false,filters:{...defaultFilters(),bank:params.get('bank')||'all'},selected:new Set(),selectedMovement:null,pageNumber:1,pageSize:20,moveSort:'newest'};
S.link=(file,sid=S.sid)=>file+'?'+new URLSearchParams({workspace:S.wid||'',scenario:sid||'',days:S.days,pending:S.pending?'1':'0'});
let generation=0,modalContext=null;
function toast(message,{duration=5000,undo,deadline}={}){const el=document.createElement('div');el.className='toast';const text=document.createElement('span');text.textContent=message;el.append(text);if(undo){const button=document.createElement('button');button.type='button';button.textContent='Deshacer';button.addEventListener('click',async()=>{button.disabled=true;try{await undo();el.remove();}catch(error){notifyError(error);button.disabled=false;}});el.append(button);}const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Cerrar aviso');close.addEventListener('click',()=>el.remove());el.append(close);$('toasts').append(el);setTimeout(()=>el.remove(),deadline?Math.max(0,deadline-Date.now()):duration);}
function notifyError(error){toast(error.message||'No se pudo completar la operación de prueba.',{duration:9000});}
function closeModal(force=false){if(modalContext?.saving&&!force)return;const opener=modalContext?.opener;$('modal').close();modalContext=null;if(opener?.isConnected)opener.focus();}
function openModal(title,html,onSubmit,label='Guardar',{wide=false,kind='',onRender,hideSave=false}={}){const opener=document.activeElement;if($('modal').open)$('modal').close();modalContext={onSubmit,opener,saving:false,kind};$('modal').classList.toggle('wide',wide);$('modal-title').textContent=title;$('modal-body').innerHTML=html;$('modal-error').textContent='';$('modal-save').textContent=label;$('modal-save').hidden=hideSave;$('modal-save').disabled=false;$('modal').showModal();onRender?.();const first=$('modal-body').querySelector('input:not([type=checkbox]):not([type=file]):not([disabled]),select,textarea');if(first)first.focus();}
async function reloadBoot(){S.boot=await api('/api/session');setCsrf(S.boot.csrfToken);renderShell();}
function renderShell(){if(!S.boot)return;const nav=[['index.html','dashboard','Dashboard'],['bancos.html','banks','Bancos'],['movimientos.html','movements','Movimientos'],['escenarios.html','scenarios','Escenarios']];$('header').innerHTML=`<div class="header-inner"><a class="brand" href="${e(S.link('index.html'))}" aria-label="Tesorería efectiva, Dashboard"><span class="brand-mark">${icon('coins')}</span><span>Tesorería efectiva</span></a><nav class="top-nav" aria-label="Navegación principal">${nav.map(([file,id,label])=>`<a href="${e(S.link(file))}" ${S.page===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav><div class="header-end"><span class="header-date">${icon('calendar')} ${dateLabel(S.data?.today||S.boot.today,{year:true})}</span><button type="button" class="workspace-button" data-action="user-menu" aria-label="Acerca de esta demo y reiniciar">${e(S.boot.user.name)}</button></div></div>`;
 const ws=S.boot.workspaces.find(w=>w.id===S.wid);$('context').innerHTML=`<div class="context-bar"><div class="context-controls"><label>Espacio <select id="workspace-select" aria-label="Espacio de trabajo">${S.boot.workspaces.map(w=>`<option value="${e(w.id)}" ${w.id===S.wid?'selected':''}>${e(w.name)}</option>`).join('')}</select></label><label>Escenario <select id="scenario-select" aria-label="Escenario activo">${S.scenarios.map(s=>`<option value="${e(s.id)}" ${s.id===S.sid?'selected':''}>${e(s.name)}</option>`).join('')}</select></label></div><div class="context-meta"><label class="checkbox-label"><input type="checkbox" id="include-pending" ${S.pending?'checked':''}>Incluir por confirmar</label>${ws?.is_demo?'<span class="tag tag-orange">Datos ficticios · en memoria</span>':''}${ws?.role==='viewer'?'<span class="tag tag-blue">Solo lectura</span>':''}<button class="subtle-button" type="button" data-action="refresh">${icon('flow')} Actualizar</button></div></div>`;
 document.title=`${nav.find(x=>x[1]===S.page)?.[2]||'Acceso'} · Tesorería efectiva`;
}
function render(){renderShell();$('banner').hidden=false;$('banner').className='demo-banner';$('banner').innerHTML='<strong>Demo con datos sintéticos.</strong><span>Los cambios solo viven en esta pestaña y se pierden al recargar. No uses datos reales.</span><button type="button" data-action="reset-demo">Reiniciar ejemplo</button>';const views={dashboard,banks,movements,scenarios};$('contenido').innerHTML=(views[S.page]||dashboard)(S);$('contenido').removeAttribute('aria-busy');}
async function refresh(){const request=++generation;if(!S.boot)await reloadBoot();if(!S.boot.workspaces.some(w=>w.id===S.wid))S.wid=S.boot.workspaces[0]?.id;if(!S.wid)throw new Error('No tienes un espacio asignado.');
 const list=await api(`/api/workspaces/${S.wid}/scenarios`);if(request!==generation)return;
 if(!list.some(x=>x.id===S.sid)){S.sid=list.find(x=>x.is_base)?.id;S.selected.clear();S.bankId=null;S.selectedMovement=null;}
 const [data,comparison]=await Promise.all([api(`/api/scenarios/${S.sid}?days=${S.days}&pending=${S.pending?'1':'0'}`),['dashboard','scenarios'].includes(S.page)?api(`/api/workspaces/${S.wid}/compare?days=${S.days}&pending=${S.pending?'1':'0'}`):Promise.resolve([])]);
 if(request!==generation)return;S.scenarios=list;S.data=data;S.comparison=comparison;if(!data.accounts.some(a=>a.id===S.bankId))S.bankId=data.accounts.find(a=>!a.archived_at)?.id||data.accounts[0]?.id;
 const ids=new Set(data.movements.map(m=>m.id));S.selected=new Set([...S.selected].filter(id=>ids.has(id)));
 const url=new URL(location.href);url.searchParams.set('workspace',S.wid);url.searchParams.set('scenario',S.sid);url.searchParams.set('days',S.days);url.searchParams.set('pending',S.pending?'1':'0');history.replaceState({},'',url);
 render();
}
const ctx={S,refresh,reloadBoot,openModal,closeModal,toast,notifyError};const dialog=dialogs(ctx);
function renderBankParts(){if($('bank-options'))$('bank-options').innerHTML=bankOptions(S);if($('bank-detail-wrap'))$('bank-detail-wrap').innerHTML=bankDetail(S);if($('bank-tools'))$('bank-tools').innerHTML=bankTools(S);}
function renderMovementParts(){const focused=document.activeElement?.dataset?.selectMovement;if($('movement-table-wrap'))$('movement-table-wrap').innerHTML=movementTable(S);if($('movement-detail'))$('movement-detail').innerHTML=movementDetail(S);if(focused)document.querySelector(`[data-select-movement="${CSS.escape(focused)}"]`)?.focus();}
function selectMovement(id){
 S.selectedMovement=id;
 // Preserve the row node between the first click and dblclick.
 document.querySelectorAll('[data-movement-row]').forEach(row=>row.classList.toggle('selected',row.dataset.movementRow===id));
 if($('movement-detail'))$('movement-detail').innerHTML=movementDetail(S);
}
$('modal-form').addEventListener('submit',async event=>{event.preventDefault();const current=modalContext;if(!current||current.saving||!current.onSubmit)return;const form=event.currentTarget;if(!form.reportValidity())return;current.saving=true;$('modal-save').disabled=true;$('modal-error').textContent='';try{await current.onSubmit(Object.fromEntries(new FormData(form)),form);}catch(error){if(modalContext===current){$('modal-error').textContent=error.message;if(error.status===409)$('modal-error').textContent+=' Cierra este editor, actualiza y revisa los cambios antes de repetir.';}else notifyError(error);}finally{if(modalContext===current){current.saving=false;$('modal-save').disabled=false;}}});
$('modal').addEventListener('cancel',event=>{if(modalContext?.saving)event.preventDefault();else modalContext=null;});
$('modal-form').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&['INPUT','SELECT'].includes(event.target.tagName)&&['movement','account'].includes(modalContext?.kind))event.preventDefault();});
document.addEventListener('focusin',event=>{const field=event.target;if(field.matches?.('[data-money]')){field.setCustomValidity('');try{if(field.value.trim()){field.value=decimal(cents(field.value,{allowNegative:true}));field.select();}}catch{}}});
document.addEventListener('focusout',event=>{const field=event.target;if(field.matches?.('[data-money]')){if(!field.value.trim()&&field.name==='openingBalance')field.value=field.defaultValue||'0.00';if(!field.value.trim())return;try{field.value=money(cents(field.value,{allowNegative:true}),{symbol:false,accounting:false});field.setCustomValidity('');field.removeAttribute('aria-invalid');}catch(error){field.setCustomValidity(error.message);field.setAttribute('aria-invalid','true');}}});
document.addEventListener('input',event=>{const t=event.target;if(t.matches?.('[data-money]')){t.setCustomValidity('');t.removeAttribute('aria-invalid');}if(t.dataset?.movementFilter){S.filters[t.dataset.movementFilter]=t.value;S.selected.clear();S.pageNumber=1;S.selectedMovement=null;renderMovementParts();}if(t.dataset?.filter==='bankSearch'){S.bankSearch=t.value;renderBankParts();}});
document.addEventListener('change',async event=>{const t=event.target;try{
 if($('modal').contains(t)){dialog.change(event);return;}
 if(t.id==='workspace-select'){S.wid=t.value;S.sid=null;S.selected.clear();S.filters=defaultFilters();await refresh();return;}
 if(t.id==='scenario-select'){S.sid=t.value;S.selected.clear();S.selectedMovement=null;S.bankId=null;await refresh();return;}
 if(t.id==='include-pending'){S.pending=t.checked;await refresh();return;}
 if(t.dataset.filter==='showArchived'){S.showArchived=t.checked;renderBankParts();}if(t.dataset.filter==='bankSort'){S.bankSort=t.value;renderBankParts();}
 if(t.dataset.filter==='moveSort'){S.moveSort=t.value;renderMovementParts();}if(t.dataset.filter==='days'){S.days=Number(t.value);await refresh();}
 if(t.dataset.movementFilter){S.filters[t.dataset.movementFilter]=t.value;S.selected.clear();S.pageNumber=1;S.selectedMovement=null;renderMovementParts();}
 if(t.hasAttribute('data-select-all')){S.selected=t.checked?new Set(filtered(S).map(m=>m.id)):new Set();renderMovementParts();}
 if(t.dataset.selectMovement){if(t.checked)S.selected.add(t.dataset.selectMovement);else S.selected.delete(t.dataset.selectMovement);renderMovementParts();}
 }catch(error){notifyError(error);}});
document.addEventListener('click',async event=>{const button=event.target.closest?.('[data-action]');if(button){if(button.disabled)return;const action=button.dataset.action,id=button.dataset.id;try{
 if(action==='close-modal'){closeModal();return;}
 if(action==='refresh'){await reloadBoot();await refresh();toast('Datos actualizados.');return;}
 if(action==='period'){S.days=Number(id);await refresh();return;}
 if(action==='select-bank'){S.bankId=id;renderBankParts();return;}if(action==='bank-tab'){S.bankTab=id;renderBankParts();return;}
 if(action==='movement-type'){S.filters.type=id;S.selected.clear();S.pageNumber=1;S.selectedMovement=null;render();return;}
 if(action==='clear-filters'){S.filters=defaultFilters();S.selected.clear();S.pageNumber=1;render();return;}
 if(action==='clear-selection'){S.selected.clear();renderMovementParts();return;}
 if(action==='move-page'){S.pageNumber+=Number(id);renderMovementParts();return;}
 if(action==='select-scenario'){S.sid=id;S.selected.clear();S.bankId=null;await refresh();return;}
 await dialog.handle(action,id);
 }catch(error){notifyError(error);}return;}
 if(event.target.closest?.('input,button,select,a'))return;const row=event.target.closest?.('[data-movement-row]');if(row)selectMovement(row.dataset.movementRow);
});
document.addEventListener('dblclick',event=>{if(event.target.closest?.('input,button,select,a'))return;const row=event.target.closest?.('[data-movement-row]');if(row&&S.data.role!=='viewer')dialog.handle('edit-movement',row.dataset.movementRow).catch(notifyError);});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches?.('[data-movement-row]')){selectMovement(event.target.dataset.movementRow);}});
const viewFiles={'index.html':'dashboard','bancos.html':'banks','movimientos.html':'movements','escenarios.html':'scenarios'};
const appBase=new URL('../',import.meta.url);
async function navigateDemo(url,{push=true}={}){
 const file=url.pathname.slice(appBase.pathname.length)||'index.html';
 if(!viewFiles[file])return;
 S.page=viewFiles[file];document.body.dataset.view=S.page;
 S.sid=url.searchParams.get('scenario')||S.sid;S.wid=url.searchParams.get('workspace')||S.wid;
 const days=Number(url.searchParams.get('days'));if([7,30,90,180,365].includes(days))S.days=days;
 if(url.searchParams.has('pending'))S.pending=url.searchParams.get('pending')!=='0';
 if(url.searchParams.has('bank'))S.filters.bank=url.searchParams.get('bank');
 if(push)history.pushState({},'',url);
 await refresh();$('contenido').focus();window.scrollTo({top:0});
}
document.addEventListener('click',event=>{
 if(event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||event.shiftKey)return;
 const link=event.target.closest?.('a[href]');if(!link||link.hasAttribute('download')||link.target==='_blank')return;
 const url=new URL(link.href,location.href);if(url.origin!==location.origin||!url.pathname.startsWith(appBase.pathname))return;
 const file=url.pathname.slice(appBase.pathname.length)||'index.html';if(!viewFiles[file])return;
 event.preventDefault();navigateDemo(url).catch(notifyError);
});
window.addEventListener('popstate',()=>navigateDemo(new URL(location.href),{push:false}).catch(notifyError));
window.addEventListener('focus',()=>{if(S.boot&&!$('modal').open)refresh().catch(notifyError);});
setInterval(()=>{if(S.boot&&document.visibilityState==='visible'&&!$('modal').open)refresh().catch(notifyError);},60000);
try{await reloadBoot();await refresh();}catch(error){$('contenido').innerHTML=`<section class="page-error"><h1>No se pudo cargar la aplicación</h1><p>${e(error.message)}</p><button type="button" class="button button-secondary" data-action="refresh">Reintentar</button></section>`;}
