import {requireValue,fail} from './errors.mjs';
import {isoDate} from '../../shared/dates.mjs';
export function parseDelimited(input,delimiter='auto'){
  requireValue(typeof input==='string'&&new TextEncoder().encode(input).length<=5*1024*1024,'La tabla debe ser texto de hasta 5 MiB.');
  let text=input.replace(/^\uFEFF/,'');
  if(delimiter==='auto'){
    const counts={'\t':0,',':0,';':0};let quoted=false;
    for(let i=0;i<Math.min(text.length,65536);i++){if(text[i]==='"'){if(quoted&&text[i+1]==='"')i++;else quoted=!quoted;}else if(!quoted&&text[i]in counts)counts[text[i]]++;}
    delimiter=counts['\t']?'\t':counts[';']>counts[',']?';':',';
  }
  requireValue(['\t',',',';'].includes(delimiter),'Separador inválido.');
  const rows=[];let row=[],field='',quoted=false,closed=false;
  const endField=()=>{requireValue(field.length<=32767,'Una celda contiene demasiado texto.');row.push({value:field});requireValue(row.length<=50,'Máximo 50 columnas.');field='';closed=false;};
  const endRow=()=>{endField();rows.push(row);row=[];requireValue(rows.length<=5001,'Máximo 5,000 movimientos y un encabezado.');};
  for(let i=0;i<text.length;i++){
    const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else field+=c;}
    else if(c===delimiter)endField();else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();}
    else if(c==='"'){requireValue(!field&&!closed,'Comillas incorrectas.');quoted=true;}
    else{requireValue(!closed,'Texto después de cerrar comillas.');field+=c;}
  }
  requireValue(!quoted,'Falta cerrar una comilla.');if(field||row.length||closed)endRow();
  return {sheets:[{name:'Tabla',rows}],warnings:[],delimiter};
}
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const crcTable=Uint32Array.from({length:256},(_,v)=>{for(let i=0;i<8;i++)v=v&1?0xedb88320^(v>>>1):v>>>1;return v>>>0;});
function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
function xmlText(v){const text=String(v??'');requireValue(text.length<=32767&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text),'Texto inválido para Excel.');return text.replace(/_x[0-9a-f]{4}_/gi,s=>'_x005F_'+s.slice(1)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));}
function colName(n){let text='';do{text=String.fromCharCode(65+n%26)+text;n=Math.floor(n/26)-1;}while(n>=0);return text;}
function serial(date){requireValue(isoDate(date),'Fecha de Excel inválida.');return (Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,31))/86400000+(date>='1900-03-01'?1:0);}
function zipStored(parts){
 const entries=Object.entries(parts).map(([name,text])=>({name:encoder.encode(name),bytes:encoder.encode(text)}));
 const local=entries.reduce((n,e)=>n+30+e.name.length+e.bytes.length,0),central=entries.reduce((n,e)=>n+46+e.name.length,0);
 const out=new Uint8Array(local+central+22),v=new DataView(out.buffer);let pos=0;
 for(const e of entries){e.offset=pos;e.crc=crc32(e.bytes);v.setUint32(pos,0x04034b50,true);v.setUint16(pos+4,20,true);v.setUint16(pos+6,0x800,true);v.setUint16(pos+12,33,true);v.setUint32(pos+14,e.crc,true);v.setUint32(pos+18,e.bytes.length,true);v.setUint32(pos+22,e.bytes.length,true);v.setUint16(pos+26,e.name.length,true);out.set(e.name,pos+30);out.set(e.bytes,pos+30+e.name.length);pos+=30+e.name.length+e.bytes.length;}
 for(const e of entries){v.setUint32(pos,0x02014b50,true);v.setUint16(pos+4,20,true);v.setUint16(pos+6,20,true);v.setUint16(pos+8,0x800,true);v.setUint16(pos+14,33,true);v.setUint32(pos+16,e.crc,true);v.setUint32(pos+20,e.bytes.length,true);v.setUint32(pos+24,e.bytes.length,true);v.setUint16(pos+28,e.name.length,true);v.setUint32(pos+42,e.offset,true);out.set(e.name,pos+46);pos+=46+e.name.length;}
 v.setUint32(pos,0x06054b50,true);v.setUint16(pos+8,entries.length,true);v.setUint16(pos+10,entries.length,true);v.setUint32(pos+12,central,true);v.setUint32(pos+16,local,true);return out;
}
/** Local OOXML export: strings are never formulas; monetary values are numeric. */
export function exportWorkbook({rows,amountColumns=[],dateColumns=[],widths=[]}){
 requireValue(Array.isArray(rows)&&rows.length>0&&rows.length<=10001&&rows.every(r=>Array.isArray(r)&&r.length<=50),'Máximo 10,000 filas para exportar.');
 const width=Math.max(...rows.map(r=>r.length)),NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main',REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships',PKG='http://schemas.openxmlformats.org/package/2006/relationships';
 const sheet=rows.map((row,r)=>`<row r="${r+1}">${row.map((value,c)=>{const ref=colName(c)+(r+1);if(r>0&&value!==''&&value!=null&&amountColumns.includes(c)){requireValue(/^-?\d+(?:\.\d{1,2})?$/.test(String(value)),'Importe no válido para exportar.');return `<c r="${ref}" s="3" t="n"><v>${value}</v></c>`;}if(r>0&&value&&dateColumns.includes(c))return `<c r="${ref}" s="2" t="n"><v>${serial(value)}</v></c>`;return `<c r="${ref}" s="${r?0:1}" t="inlineStr"><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;}).join('')}</row>`).join('');
 const range=`A1:${colName(width-1)}${rows.length}`,head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 return new Blob([zipStored({
 '[Content_Types].xml':head+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
 '_rels/.rels':head+`<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
 'xl/workbook.xml':head+`<workbook xmlns="${NS}" xmlns:r="${REL}"><sheets><sheet name="Demo sintética" sheetId="1" r:id="rId1"/></sheets></workbook>`,
 'xl/_rels/workbook.xml.rels':head+`<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
 'xl/styles.xml':head+`<styleSheet xmlns="${NS}"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="&quot;$&quot;#,##0.00;(&quot;$&quot;#,##0.00);&quot;$—&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF13283A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
 'xl/worksheets/sheet1.xml':head+`<worksheet xmlns="${NS}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${Array.from({length:width},(_,i)=>`<col min="${i+1}" max="${i+1}" width="${widths[i]||24}" customWidth="1"/>`).join('')}</cols><sheetData>${sheet}</sheetData><autoFilter ref="${range}"/></worksheet>`
 })],{type:XLSX_MIME});
}
function parseXML(text){requireValue(!/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text),'Declaraciones XML no admitidas.');const doc=new DOMParser().parseFromString(text,'application/xml');requireValue(!doc.getElementsByTagName('parsererror').length,'El libro contiene XML dañado.');return doc;}
const nodes=(parent,name)=>[...parent.getElementsByTagNameNS('*',name)];
async function unzip(bytes,signal){
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),ok=c=>requireValue(c,'Archivo XLSX dañado o no compatible.');ok(bytes.length>=22);let end=-1;
 for(let p=bytes.length-22;p>=Math.max(0,bytes.length-65557);p--)if(v.getUint32(p,true)===0x06054b50&&p+22+v.getUint16(p+20,true)===bytes.length){end=p;break;}
 ok(end>=0);ok(!v.getUint16(end+4,true)&&!v.getUint16(end+6,true));const count=v.getUint16(end+10,true),offset=v.getUint32(end+16,true),size=v.getUint32(end+12,true);ok(count>0&&count<=2000&&v.getUint16(end+8,true)===count&&offset+size===end);
 const files=new Map(),entries=[],ranges=[];let p=offset,total=0;
 for(let i=0;i<count;i++){
  ok(p+46<=end&&v.getUint32(p,true)===0x02014b50);const flags=v.getUint16(p+8,true),method=v.getUint16(p+10,true),crc=v.getUint32(p+16,true),compressed=v.getUint32(p+20,true),length=v.getUint32(p+24,true),nl=v.getUint16(p+28,true),next=p+46+nl+v.getUint16(p+30,true)+v.getUint16(p+32,true),local=v.getUint32(p+42,true);
  ok(next<=end&&nl>0&&!(flags&0x2041)&&[0,8].includes(method)&&!v.getUint16(p+34,true));const name=decoder.decode(bytes.slice(p+46,p+46+nl));ok(!files.has(name)&&!name.includes('\\')&&!name.startsWith('/')&&!name.includes('\0')&&!name.split('/').some(x=>x==='..'||x==='.'));
  requireValue(!/vbaProject|macrosheets/i.test(name),'No se admiten macros.');total+=length;requireValue(length<=16*1024*1024&&total<=30*1024*1024,'El libro descomprimido supera los límites.');ok(local+30<=offset&&v.getUint32(local,true)===0x04034b50&&v.getUint16(local+6,true)===flags&&v.getUint16(local+8,true)===method);
  const lnl=v.getUint16(local+26,true),start=local+30+lnl+v.getUint16(local+28,true);ok(lnl===nl&&start+compressed<=offset&&decoder.decode(bytes.slice(local+30,local+30+lnl))===name);
  if(!(flags&8))ok(v.getUint32(local+14,true)===crc&&v.getUint32(local+18,true)===compressed&&v.getUint32(local+22,true)===length);
  ranges.push([local,start+compressed]);entries.push({name,method,crc,compressed,length,start});files.set(name,null);p=next;
 }
 ok(p===end);ranges.sort((a,b)=>a[0]-b[0]);for(let i=1;i<ranges.length;i++)ok(ranges[i][0]>=ranges[i-1][1]);
 for(const entry of entries){
  if(signal?.aborted)throw new DOMException('Cancelado','AbortError');let content=bytes.slice(entry.start,entry.start+entry.compressed);
  if(entry.method===8){let stream;try{stream=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw'));}catch{throw new Error('Este navegador no permite abrir este Excel. Pega las celdas o usa CSV.');}const reader=stream.getReader(),chunks=[];let got=0;try{while(true){const {done,value}=await reader.read();if(done)break;got+=value.length;ok(got<=entry.length);chunks.push(value);if(signal?.aborted)throw new DOMException('Cancelado','AbortError');}}catch(e){await reader.cancel();throw e;}content=new Uint8Array(got);let at=0;for(const c of chunks){content.set(c,at);at+=c.length;}}
  ok(content.length===entry.length&&crc32(content)===entry.crc);
  if(/\.(xml|rels)$/i.test(entry.name)){let encoding='utf-8';if(content[0]===255&&content[1]===254)encoding='utf-16le';if(content[0]===254&&content[1]===255)encoding='utf-16be';const text=new TextDecoder(encoding,{fatal:true}).decode(content);requireValue(!/<!\s*(DOCTYPE|ENTITY)\b/i.test(text),'Declaraciones XML no admitidas.');files.set(entry.name,text);}
 }
 return files;
}
function excelDate(value,date1904){const n=Number(value),days=Math.floor(n);if(!Number.isFinite(n)||days<(date1904?0:1)||(!date1904&&days===60))return null;const ms=(date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,31))+(days-(date1904?0:days>60?1:0))*86400000;try{const d=new Date(ms).toISOString().slice(0,10);return isoDate(d)?d:null;}catch{return null;}}
export async function readXlsx(bytes,{signal}={}){
 const files=await unzip(bytes,signal);requireValue(files.get('xl/workbook.xml')&&files.get('[Content_Types].xml'),'El archivo no es XLSX.');requireValue(!/macroEnabled|vbaProject/i.test(files.get('[Content_Types].xml')),'No se admiten libros con macros.');
 const book=parseXML(files.get('xl/workbook.xml')),rels=parseXML(files.get('xl/_rels/workbook.xml.rels')||'<Relationships/>');const relMap=new Map(nodes(rels,'Relationship').filter(x=>x.getAttribute('TargetMode')!=='External').map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
 const shared=files.get('xl/sharedStrings.xml')?nodes(parseXML(files.get('xl/sharedStrings.xml')),'si').map(x=>nodes(x,'t').map(t=>t.textContent).join('')):[];
 const styles=files.get('xl/styles.xml')?parseXML(files.get('xl/styles.xml')):parseXML('<styleSheet/>'),numFormats=new Map(nodes(styles,'numFmt').map(x=>[Number(x.getAttribute('numFmtId')),x.getAttribute('formatCode')]));
 const xfs=nodes(styles,'cellXfs')[0],dateStyles=xfs?[...xfs.children].map(x=>{const id=Number(x.getAttribute('numFmtId')),fmt=(numFormats.get(id)||'').replace(/"[^"]*"|\[[^\]]*\]|\\./g,'');return (id>=14&&id<=22)||(id>=45&&id<=47)||/[ymd]/i.test(fmt);}):[];
 const date1904=['1','true'].includes(nodes(book,'workbookPr')[0]?.getAttribute('date1904')),sheetNodes=nodes(book,'sheet');requireValue(sheetNodes.length>0&&sheetNodes.length<=20,'Máximo 20 hojas.');const sheets=[];let totalCells=0;
 for(const sh of sheetNodes){
  const rid=sh.getAttribute('r:id')||sh.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'),target=relMap.get(rid);requireValue(target,'Hoja sin relación interna.');const url=new URL(target,'https://excel.invalid/xl/');requireValue(url.origin==='https://excel.invalid','Relación externa no admitida.');const xml=files.get(decodeURIComponent(url.pathname.slice(1)));requireValue(xml,'No se encontró la hoja.');const doc=parseXML(xml);requireValue(nodes(doc,'worksheet').length===1,'Tipo de hoja no admitido.');let rows=[],height=0,width=0,rowIndex=-1;
  for(const row of nodes(doc,'row')){rowIndex=row.getAttribute('r')?Number(row.getAttribute('r'))-1:rowIndex+1;requireValue(Number.isInteger(rowIndex)&&rowIndex>=0&&rowIndex<5001,'Máximo 5,001 filas por hoja.');let col=-1;
   for(const c of [...row.children].filter(x=>x.localName==='c')){const ref=c.getAttribute('r');if(ref){const hit=/^([A-Z]{1,3})([1-9][0-9]*)$/i.exec(ref);requireValue(hit&&Number(hit[2])-1===rowIndex,'Referencia de celda inválida.');col=[...hit[1].toUpperCase()].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1;}else col++;requireValue(col>=0&&col<50,'Máximo 50 columnas.');if(!rows[rowIndex])rows[rowIndex]=[];requireValue(!rows[rowIndex][col],'Celda duplicada.');
    const type=c.getAttribute('t'),v=nodes(c,'v')[0]?.textContent,formula=nodes(c,'f').length>0;let value='',error;
    if(type==='inlineStr')value=nodes(c,'t').map(t=>t.textContent).join('');else if(type==='s'){const idx=Number(v);requireValue(Number.isInteger(idx)&&idx>=0&&idx<shared.length,'Cadena compartida no disponible.');value=shared[idx];}else if(type==='e'){value=v;error='La celda contiene un error de Excel.';}else if(type==='b')value=v==='1';else value=v??'';
    if(formula&&(v==null||v===''))error='Fórmula sin valor guardado. Calcula y guarda el Excel antes de importar.';
    if(type==='d')value=String(value).slice(0,10);else if((!type||type==='n')&&dateStyles[Number(c.getAttribute('s')||0)]){const date=excelDate(value,date1904);if(date)value=date;else error='Fecha de Excel inválida.';}
    if(typeof value==='string')value=value.replace(/_x([0-9a-f]{4})_/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
    requireValue(String(value).length<=32767,'Celda demasiado larga.');rows[rowIndex][col]={value,...(formula?{formula:true}:{}),...(error?{error}:{})};height=Math.max(height,rowIndex+1);width=Math.max(width,col+1);
   }
  }
  totalCells+=height*width;requireValue(totalCells<=500000,'Demasiadas celdas en el libro.');rows=Array.from({length:height},(_,r)=>Array.from({length:width},(_,c)=>rows[r]?.[c]||{value:''}));sheets.push({name:sh.getAttribute('name')||'Hoja',rows});
 }
 return {sheets,warnings:[]};
}
export async function parseFile(blob,name,options={}){
 requireValue(blob instanceof Blob&&blob.size<=5*1024*1024,'Máximo 5 MiB por archivo.');const bytes=new Uint8Array(await blob.arrayBuffer());
 if(/\.xlsx$/i.test(name))return readXlsx(bytes,options);
 requireValue(/\.(csv|tsv)$/i.test(name),'Usa XLSX, CSV o TSV.');let text;try{text=decoder.decode(bytes);}catch{fail(422,'ENCODING','Guarda el texto como UTF-8.');}return parseDelimited(text,/\.tsv$/i.test(name)?'\t':'auto');
}
