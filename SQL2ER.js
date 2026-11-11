const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// Identifiers are normalized for matching. The original spelling is retained for display.
const clean=n=>String(n).trim().replace(/^[`"\[]|[`"\]]$/g,'').split('.').map(x=>x.replace(/^[`"\[]|[`"\]]$/g,'')).join('.').toLowerCase();
const list=s=>splitTop(s).map(x=>clean(x.trim().split(/\s+/)[0]));

// Split SQL without breaking commas/semicolons inside strings or nested expressions.
function splitSQL(source, delimiter){
 const out=[]; let part='', depth=0, quote=null;
 for(let i=0;i<source.length;i++){
  const ch=source[i], next=source[i+1];
  if(quote){
   part+=ch;
   if(ch===quote){
    if(next===quote){part+=next;i++;}
    else if(source[i-1]!=='\\')quote=null;
   } else if(ch==='\\' && next){part+=next;i++;}
   continue;
  }
  if(ch==='\''||ch==='"'||ch==='`'){quote=ch;part+=ch;continue;}
  if(ch==='['){quote=']';part+=ch;continue;}
  if(ch==='('){depth++;part+=ch;continue;}
  if(ch===')'){depth=Math.max(0,depth-1);part+=ch;continue;}
  if(ch===delimiter&&depth===0){if(part.trim())out.push(part.trim());part='';continue;}
  part+=ch;
 }
 if(part.trim())out.push(part.trim());
 return out;
}
function splitTop(s){return splitSQL(s, ',');}
function stripSQLComments(source){
 let out='', quote=null;
 for(let i=0;i<source.length;i++){
  const ch=source[i], next=source[i+1];
  if(quote){out+=ch;if(ch===quote){if(next===quote){out+=next;i++;}else if(source[i-1]!=='\\')quote=null;}else if(ch==='\\'&&next){out+=next;i++;}continue;}
  if(ch==='\''||ch==='"'||ch==='`'){quote=ch;out+=ch;continue;}
  if(ch==='-'&&next==='-'){while(i<source.length&&source[i]!=='\n')i++;out+='\n';continue;}
  if(ch==='/'&&next==='*'){i+=2;while(i<source.length&&!(source[i]==='*'&&source[i+1]==='/'))i++;i++;continue;}
  out+=ch;
 }
 return out;
}
function parse(sql){
 const db={}, alters=[];
 const statements=splitSQL(stripSQLComments(sql), ';');
 for(const statement of statements){
  let m=statement.match(/^create\s+table\s+(?:if\s+not\s+exists\s+)?((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+))?)\s*\(([\s\S]*)\)\s*$/i);
  if(m){
   const tableName=clean(m[1]);
   if(db[tableName])throw new Error(`Duplicate table definition: ${tableName}`);
   const t={name:tableName,displayName:m[1].replace(/[`"\[\]]/g,''),cols:[],pk:[],fks:[],uniq:[],indexes:[]};
   for(const raw of splitTop(m[2])){
    let part=raw.trim(); if(!part)continue; let c;
    const constraintName=/^constraint\s+(?:`[^`]+`|"[^"]+"|\w+)\s+/i;
    part=part.replace(constraintName,'');
    if((c=part.match(/^primary\s+key\s*\(([^)]+)\)/i))){t.pk=list(c[1]);continue;}
    if((c=part.match(/^foreign\s+key\s*\(([^)]+)\)\s*references\s+((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+))?)\s*\(([^)]+)\)([\s\S]*)$/i))){
     t.fks.push({cols:list(c[1]),ref:clean(c[2]),refCols:list(c[3]),onDelete:(c[4].match(/on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/i)||[])[1]||null,onUpdate:(c[4].match(/on\s+update\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/i)||[])[1]||null});continue;
    }
    if((c=part.match(/^unique(?:\s+(?:key|index))?(?:\s+[\w$]+)?\s*\(([^)]+)\)/i))){t.uniq.push(list(c[1]));continue;}
    if((c=part.match(/^(?:index|key)\s+([\w$]+)?\s*\(([^)]+)\)/i))){t.indexes.push(list(c[2]));continue;}
    if(/^check\s*\(/i.test(part))continue;
    // Column definition: identifier + type (including parameterized types) + modifiers.
    c=part.match(/^(`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)\s+([\w]+(?:\s+varying)?(?:\s*\([^)]*\))?(?:\s*\[\])?)([\s\S]*)$/i);
    if(!c)throw new Error(`Could not understand table definition: ${part}`);
    const name=clean(c[1]),rest=c[3];
    if(t.cols.some(x=>x.name===name))throw new Error(`Duplicate column ${name} in table ${tableName}`);
    t.cols.push({name,displayName:c[1].replace(/[`"\[\]]/g,''),type:c[2].replace(/\s+/g,' ').trim().toUpperCase(),nn:/\bnot\s+null\b/i.test(rest)});
    if(/\bprimary\s+key\b/i.test(rest))t.pk.push(name);
    if(/\bunique\b/i.test(rest))t.uniq.push([name]);
    const ref=rest.match(/\breferences\s+((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+))?)\s*\(([^)]+)\)/i);
    if(ref)t.fks.push({cols:[name],ref:clean(ref[1]),refCols:list(ref[2]),onDelete:(rest.match(/on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/i)||[])[1]||null,onUpdate:(rest.match(/on\s+update\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/i)||[])[1]||null});
   }
   db[tableName]=t;continue;
  }
  m=statement.match(/^alter\s+table\s+((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+))?)\s+add\s+(?:constraint\s+(?:`[^`]+`|"[^"]+"|\w+)\s+)?foreign\s+key\s*\(([^)]+)\)\s*references\s+((?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+)(?:\s*\.\s*(?:`[^`]+`|"[^"]+"|\[[^\]]+\]|[\w$]+))?)\s*\(([^)]+)\)([\s\S]*)$/i);
  if(m)alters.push([clean(m[1]),{cols:list(m[2]),ref:clean(m[3]),refCols:list(m[4]),onDelete:(m[5].match(/on\s+delete\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/i)||[])[1]||null,onUpdate:(m[5].match(/on\s+update\s+(cascade|restrict|set\s+null|set\s+default|no\s+action)/i)||[])[1]||null}]);
 }
 alters.forEach(([name,fk])=>{if(!db[name])throw new Error(`ALTER TABLE references unknown table ${name}`);db[name].fks.push(fk);});
 for(const t of Object.values(db))t.cols.forEach(c=>{c.pk=t.pk.includes(c.name);c.fk=t.fks.some(f=>f.cols.includes(c.name));});
 return db;
}

const SAMPLES={uni:`CREATE TABLE departments (
  dept_id INT PRIMARY KEY,
  dept_name VARCHAR(80) NOT NULL UNIQUE
);
CREATE TABLE students (
  student_id INT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(120) UNIQUE,
  dept_id INT,
  FOREIGN KEY (dept_id) REFERENCES departments(dept_id)
);
CREATE TABLE instructors (
  instructor_id INT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  dept_id INT NOT NULL REFERENCES departments(dept_id)
);
CREATE TABLE courses (
  course_id INT PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  credits INT,
  instructor_id INT,
  FOREIGN KEY (instructor_id) REFERENCES instructors(instructor_id)
);
CREATE TABLE enrollments (
  student_id INT,
  course_id INT,
  grade CHAR(2),
  PRIMARY KEY (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES students(student_id),
  FOREIGN KEY (course_id) REFERENCES courses(course_id)
);`,bad:`CREATE TABLE customer (
  id INT, name VARCHAR(50),
  phone1 VARCHAR(15), phone2 VARCHAR(15), phone3 VARCHAR(15)
);
CREATE TABLE orders (
  order_id INT PRIMARY KEY,
  cust_id VARCHAR(10),
  total DECIMAL(10,2),
  FOREIGN KEY (cust_id) REFERENCES customer(id)
);
CREATE TABLE shipment (
  ship_id INT PRIMARY KEY,
  order_id INT,
  FOREIGN KEY (order_id) REFERENCES orders(order_id),
  FOREIGN KEY (carrier_id) REFERENCES carrier(carrier_id)
);`};
let DB={},RELS=[],ISS=[],POS={},SEL=null;
const W=205,HH=32,RH=20,hgt=t=>HH+t.cols.length*RH+8;
const getc=(t,n)=>t.cols.find(c=>c.name===n);
const same=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);

function splitTop(s){const o=[];let d=0,c='';for(const ch of s){if(ch==='(')d++;if(ch===')')d--;if(ch===','&&d===0){o.push(c);c=''}else c+=ch}o.push(c);return o}
function parse(sql){
 sql=sql.replace(/--.*$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
 const db={},alters=[];
 for(const s of sql.split(';')){
  let m=s.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([`"\[]?[\w.]+[`"\]]?)\s*\(([\s\S]*)\)\s*[^)]*$/i);
  if(m){
   const t={name:clean(m[1]),cols:[],pk:[],fks:[],uniq:[]};
   for(const raw of splitTop(m[2])){
    const p=raw.trim();if(!p)continue;let c;
    if(c=p.match(/^(?:constraint\s+\S+\s+)?primary\s+key\s*\(([^)]+)\)/i))t.pk=list(c[1]);
    else if(c=p.match(/^(?:constraint\s+\S+\s+)?foreign\s+key\s*\(([^)]+)\)\s*references\s+(\S+?)\s*\(([^)]+)\)/i))t.fks.push({cols:list(c[1]),ref:clean(c[2]),refCols:list(c[3])});
    else if(c=p.match(/^(?:constraint\s+\S+\s+)?unique(?:\s+key)?\s*(?:\w+\s*)?\(([^)]+)\)/i))t.uniq.push(list(c[1]));
    else if(/^(key|index|check|fulltext|constraint)\b/i.test(p)){}
    else if(c=p.match(/^([`"\[]?\w+[`"\]]?)\s+(\w+(?:\s*\([^)]*\))?)([\s\S]*)$/)){
     const name=clean(c[1]),rest=c[3];
     t.cols.push({name,type:c[2].replace(/\s+/g,'').toUpperCase(),nn:/not\s+null/i.test(rest)});
     if(/primary\s+key/i.test(rest))t.pk.push(name);
     if(/\bunique\b/i.test(rest))t.uniq.push([name]);
     const r=rest.match(/references\s+(\S+?)\s*\(([^)]+)\)/i);
     if(r)t.fks.push({cols:[name],ref:clean(r[1]),refCols:list(r[2])});
    }
   }
   db[t.name]=t;continue;
  }
  m=s.match(/alter\s+table\s+(\S+)\s+add\s+(?:constraint\s+\S+\s+)?foreign\s+key\s*\(([^)]+)\)\s*references\s+(\S+?)\s*\(([^)]+)\)/i);
  if(m)alters.push([clean(m[1]),{cols:list(m[2]),ref:clean(m[3]),refCols:list(m[4])}]);
 }
 alters.forEach(([n,f])=>{if(db[n])db[n].fks.push(f)});
 for(const t of Object.values(db)){
  t.cols.forEach(c=>{c.pk=t.pk.includes(c.name);c.fk=t.fks.some(f=>f.cols.includes(c.name))});
 }
 return db;
}

function analyze(){
 RELS=[];ISS=[];const T=Object.values(DB);
 const add=(sev,t,msg,fix)=>ISS.push({sev,t,msg,fix});
 const bt=x=>x.toLowerCase().split('(')[0];
 for(const t of T){
  if(!t.pk.length)add('high',t.name,`Table ${t.name} has no primary key, so its rows can’t be uniquely identified.`,`Add one, for example ${t.name}_id INT PRIMARY KEY.`);
  t.pk.forEach(c=>{if(!getc(t,c))add('high',t.name,`Primary key column ${c} is not declared in ${t.name}.`,`Declare ${c} or correct the PRIMARY KEY clause.`)});
  t.uniq.forEach(cols=>cols.forEach(c=>{if(!getc(t,c))add('high',t.name,`UNIQUE constraint references missing column ${c}.`,`Declare ${c} or correct the UNIQUE constraint.`)}));
  const stems={};
  t.cols.forEach(c=>{const m=c.name.match(/^(.*?)_?(\d+)$/);if(m&&m[1])(stems[m[1]]=stems[m[1]]||[]).push(c.name)});
  for(const s in stems)if(stems[s].length>1)add('med',t.name,`Repeating columns (${stems[s].join(', ')}) point to a first-normal-form problem.`,`Move them into their own table linked back to ${t.name} by a foreign key.`);
  if(t.cols.length>12)add('low',t.name,`${t.name} has ${t.cols.length} columns, which may mean it mixes several topics.`,`Check whether some columns belong in a separate table.`);
  t.junction=t.fks.length>=2&&t.pk.length>0&&t.pk.every(c=>t.fks.some(f=>f.cols.includes(c)));
  for(const fk of t.fks){
   fk.cols.forEach(c=>{if(!getc(t,c))add('high',t.name,`The foreign key in ${t.name} uses column ${c}, which isn’t declared in that table.`,`Add the ${c} column or fix the FOREIGN KEY clause.`)});
   if(fk.cols.length!==fk.refCols.length){add('high',t.name,`Foreign key column count does not match its referenced column count in ${t.name}.`,`Provide the same number of local and referenced columns.`);continue;}
   const p=DB[fk.ref];
   if(!p){add('high',t.name,`${t.name} references table ${fk.ref}, which isn’t defined in this schema.`,`Create ${fk.ref} or correct the table name.`);continue}
   fk.refCols.forEach((c,i)=>{const pc=getc(p,c),cc=getc(t,fk.cols[i]);
    if(!pc)return add('high',t.name,`${t.name} references ${fk.ref}.${c}, which doesn’t exist.`,`Reference an existing column of ${fk.ref}.`);
    if(cc&&bt(cc.type)!==bt(pc.type))add('med',t.name,`Type mismatch: ${t.name}.${cc.name} is ${cc.type} but ${p.name}.${pc.name} is ${pc.type}.`,`Give both columns the same data type.`)});
   if(!same(fk.refCols,p.pk)&&!p.uniq.some(u=>same(u,fk.refCols)))add('med',t.name,`${t.name} references ${fk.ref}(${fk.refCols.join(', ')}), which isn’t that table’s primary key or a unique column.`,`Reference the primary key, or add a UNIQUE constraint.`);
   const one=same(fk.cols,t.pk)||t.uniq.some(u=>same(u,fk.cols));
   const optional=fk.cols.some(c=>{const x=getc(t,c);return !x||(!x.nn&&!x.pk)});
   RELS.push({p:fk.ref,c:t.name,cols:fk.cols,refCols:fk.refCols,one,optional,junction:t.junction});
  }
 }
 // cycles (ignoring self-references)
 const st={};let cyc=null;
 const dfs=(n,path)=>{if(cyc)return;st[n]=1;for(const f of DB[n].fks){const r=f.ref;if(r===n||!DB[r])continue;if(st[r]===1){cyc=[...path,n,r];return}if(!st[r])dfs(r,[...path,n])}st[n]=2};
 Object.keys(DB).forEach(n=>{if(!st[n])dfs(n,[])});
 if(cyc)add('med',cyc[cyc.length-1],`Circular foreign keys: ${cyc.slice(cyc.indexOf(cyc[cyc.length-1])).join(' → ')}. Rows can be hard to insert or delete.`,`Break the loop, for example with a nullable foreign key or a linking table.`);
 if(T.length>1)T.forEach(t=>{if(!RELS.some(r=>r.p===t.name||r.c===t.name))add('low',t.name,`${t.name} isn’t connected to any other table.`,`Add a foreign key if it should relate to another table.`)});
}

function layout(){
 const lvl={};
 const f=(n,seen)=>{if(n in lvl)return lvl[n];if(seen.has(n))return 0;seen.add(n);let m=-1;for(const k of DB[n].fks)if(k.ref!==n&&DB[k.ref])m=Math.max(m,f(k.ref,seen));return lvl[n]=m+1};
 Object.keys(DB).forEach(n=>f(n,new Set()));
 const rows={};POS={};
 Object.keys(DB).forEach(n=>{const l=lvl[n];rows[l]=rows[l]||0;POS[n]={x:24+l*(W+120),y:24+rows[l]};rows[l]+=hgt(DB[n])+36});
}
function edge(P,h,t){const cx=P.x+W/2,cy=P.y+h/2,dx=t[0]-cx,dy=t[1]-cy;const s=Math.min((W/2)/Math.abs(dx||1e-9),(h/2)/Math.abs(dy||1e-9));return[cx+dx*s,cy+dy*s]}
function line(r){
 const A=POS[r.p],B=POS[r.c];if(!A||!B)return'';
 const on=SEL===r.p||SEL===r.c?'on':'',pl=r.optional?'0..1':'1',cl=r.one?'1':'N';
 if(r.p===r.c){const x=A.x+W,y=A.y+14;return `<path class="ln ${on}" d="M${x} ${y}C${x+55} ${y} ${x+55} ${y+44} ${x} ${y+44}"/><text class="cl" x="${x+6}" y="${y-3}">${pl}</text><text class="cl" x="${x+6}" y="${y+56}">${cl}</text>`}
 const ha=hgt(DB[r.p]),hb=hgt(DB[r.c]);
 const ca=[A.x+W/2,A.y+ha/2],cb=[B.x+W/2,B.y+hb/2],a=edge(A,ha,cb),b=edge(B,hb,ca);
 const lab=(p,q,t)=>{const dx=q[0]-p[0],dy=q[1]-p[1],d=Math.hypot(dx,dy)||1;return `<text class="cl" x="${(p[0]+dx/d*16-dy/d*9-6).toFixed(1)}" y="${(p[1]+dy/d*16+dx/d*9+4).toFixed(1)}">${t}</text>`};
 return `<path class="ln ${on}" d="M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}"/>`+lab(a,b,pl)+lab(b,a,cl);
}
function draw(){
 let mx=500,my=260,s='';
 const ns=Object.keys(DB);
 ns.forEach(n=>{const p=POS[n];mx=Math.max(mx,p.x+W+90);my=Math.max(my,p.y+hgt(DB[n])+30)});
 RELS.forEach(r=>s+=line(r));
 ns.forEach(n=>{
  const t=DB[n],p=POS[n],h=hgt(t);
  s+=`<g data-t="${esc(n)}" class="${SEL===n?'sel':''}" style="cursor:grab;touch-action:none"><rect class="tb" x="${p.x}" y="${p.y}" width="${W}" height="${h}" rx="5"/><path class="${t.junction?'hj':'hd'}" d="M${p.x} ${p.y+HH}V${p.y+5}Q${p.x} ${p.y} ${p.x+5} ${p.y}H${p.x+W-5}Q${p.x+W} ${p.y} ${p.x+W} ${p.y+5}V${p.y+HH}Z"/><text class="tn" x="${p.x+10}" y="${p.y+21}">${esc(t.name)}</text>`;
  t.cols.forEach((c,i)=>{
   const y=p.y+HH+i*RH+15,b=(c.pk?'PK':'')+(c.pk&&c.fk?',':'')+(c.fk?'FK':'');
   s+=`<text class="bk" x="${p.x+8}" y="${y}" fill="${c.pk?'var(--pk)':'var(--fk)'}">${b}</text><text class="cn" x="${p.x+(b.length>2?46:30)}" y="${y}">${esc(c.name)}</text><text class="ct" x="${p.x+W-8}" y="${y}" text-anchor="end">${esc(c.type)}</text>`;
  });
  s+='</g>';
 });
 const v=$('svg');v.setAttribute('width',mx);v.setAttribute('height',my);v.innerHTML=s;
}

// drag + select
$('svg').addEventListener('pointerdown',e=>{
 const g=e.target.closest('[data-t]');if(!g)return;
 const n=g.dataset.t,v=$('svg');SEL=n;
 const r=v.getBoundingClientRect(),sx=(v.viewBox.baseVal.width||v.clientWidth)/(r.width||1),sy=(v.viewBox.baseVal.height||v.clientHeight)/(r.height||1),ox=(e.clientX-r.left)*sx-POS[n].x,oy=(e.clientY-r.top)*sy-POS[n].y;
 const mv=ev=>{const q=v.getBoundingClientRect();POS[n].x=Math.max(4,(ev.clientX-q.left)*sx-ox);POS[n].y=Math.max(4,(ev.clientY-q.top)*sy-oy);draw()};
 const up=()=>{removeEventListener('pointermove',mv);removeEventListener('pointerup',up)};
 addEventListener('pointermove',mv);addEventListener('pointerup',up);
 draw();showTable(n);e.preventDefault();
});

// assistant
const sentence=r=>{
 const self=r.p===r.c?' This table refers to itself, a pattern often used for hierarchies such as manager and employee.':'';
 return (r.one
  ?`Each <b>${r.c}</b> row is linked to ${r.optional?'at most one':'exactly one'} <b>${r.p}</b> row, and each <b>${r.p}</b> row to at most one <b>${r.c}</b> row (1:1).`
  :`One <b>${r.p}</b> row can be linked to many <b>${r.c}</b> rows, while each <b>${r.c}</b> row belongs to ${r.optional?'at most one':'exactly one'} <b>${r.p}</b> (1:N).`)
  +` The link is <code>${esc(r.c)}.${esc(r.cols.join(', '))}</code> → <code>${esc(r.p)}.${esc(r.refCols.join(', '))}</code>.`+self};
function overview(){
 const T=Object.values(DB),j=T.filter(t=>t.junction);
 let h=`<p>This schema has <b>${T.length}</b> tables and <b>${RELS.length}</b> foreign-key relationships. Each table becomes a box (an <i>entity</i>); each foreign key becomes a line between boxes (a <i>relationship</i>).</p>`;
 j.forEach(t=>{const ps=[...new Set(RELS.filter(r=>r.c===t.name).map(r=>r.p))];if(ps.length>=2)h+=`<p><b>${esc(ps.join(' and '))}</b> have a many-to-many (M:N) relationship, built with the junction table <b>${esc(t.name)}</b>. A many-to-many link can’t be stored directly, so a middle table holds one row per pair.</p>`});
 RELS.filter(r=>!r.junction).forEach(r=>h+=`<p>${sentence(r)}</p>`);
 $('out').innerHTML=h;
}
function showTable(n){
 const t=DB[n];if(!t)return;
 let h=`<h4>${esc(t.name)}${t.junction?' (junction table)':''}</h4><p>${t.cols.length} columns. `;
 h+=t.pk.length?(t.pk.length>1?`Its primary key is the combination <b>${esc(t.pk.join(' + '))}</b>: each pair of values may appear only once.`:`Its primary key is <b>${esc(t.pk[0])}</b>: every row has a different value, which is how a row is identified.`):'It has no primary key.';
 h+='</p>';
 t.fks.forEach(f=>h+=`<p><b>Foreign key</b> <code>${esc(f.cols.join(', '))}</code> → <code>${esc(f.ref)}.${esc(f.refCols.join(', '))}</code>. A value stored here must already exist in <b>${esc(f.ref)}</b>, which keeps the data consistent.</p>`);
 RELS.filter(r=>r.p===n||r.c===n).forEach(r=>h+=`<p>${sentence(r)}</p>`);
 ISS.filter(i=>i.t===n).forEach(i=>h+=`<p><span class="pill ${i.sev}">${i.sev}</span>${esc(i.msg)} <i>${esc(i.fix)}</i></p>`);
 $('out').innerHTML=h;
}
function suggest(){
 let h='';
 if(!ISS.length)h+=`<p class="ok">No problems found by the rule checks.</p><p>Ideas to go further: add indexes on foreign-key columns used in joins, pick ON DELETE rules (CASCADE, SET NULL or RESTRICT) for each foreign key, and add NOT NULL where a value is always required.</p>`;
 else ISS.forEach(i=>h+=`<p><span class="pill ${i.sev}">${i.sev}</span><b>${esc(i.t)}</b>: ${esc(i.msg)}<br><i>Suggestion: ${esc(i.fix)}</i></p>`);
 $('out').innerHTML=h;
}
const GLOSS={
 'Primary key':'A primary key is a column (or set of columns) whose value is different in every row, so each row can be found exactly. It can’t be NULL.',
 'Foreign key':'A foreign key is a column that stores the primary key of a row in another table. It creates the link between tables and stops you from pointing at a row that doesn’t exist.',
 'Cardinality':'Cardinality says how many rows on one side can match rows on the other: 1:1 (one to one), 1:N (one to many) or M:N (many to many). Here it is read from your keys: a foreign key that is also unique gives 1:1, a plain foreign key gives 1:N.',
 'Junction table':'A junction table implements a many-to-many relationship. Its primary key combines two foreign keys, so each pair appears once. Example: enrollments links students and courses.',
 'Normalization':'Normalization organizes tables to avoid repeated data. 1NF: no repeating columns such as phone1, phone2. 2NF: every non-key column depends on the whole key. 3NF: non-key columns depend only on the key, not on each other.'};
function chips(){
 const c=$('chips');c.innerHTML='<button data-a="ov">Explain the schema</button><button data-a="su">Suggest improvements</button>'+Object.keys(GLOSS).map(k=>`<button class="g" data-g="${k}">${k}</button>`).join('');
}
$('chips').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.a==='ov'){SEL=null;draw();overview()}
 else if(b.dataset.a==='su')suggest();
 else if(b.dataset.g)$('out').innerHTML=`<h4>${b.dataset.g}</h4><p>${GLOSS[b.dataset.g]}</p>`;
});
function issues(){
 const c={high:0,med:0,low:0};ISS.forEach(i=>c[i.sev]++);
 $('ih').textContent=ISS.length?`Design check: ${ISS.length} issue${ISS.length>1?'s':''}`:'Design check';
 $('iss').innerHTML=ISS.length?ISS.map((i,k)=>`<li class="is" tabindex="0" data-k="${k}"><span class="pill ${i.sev}">${i.sev}</span>${esc(i.msg)}<span class="fx">${esc(i.fix)}</span></li>`).join(''):'<li class="ok">No issues found.</li>';
}
const pick=e=>{const li=e.target.closest('li[data-k]');if(!li)return;const i=ISS[+li.dataset.k];if(DB[i.t]){SEL=i.t;draw();showTable(i.t)}};
$('iss').addEventListener('click',pick);
$('iss').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick(e)}});

function run(){
 try{DB=parse($('sql').value)}catch(e){
  DB={};RELS=[];ISS=[];POS={};SEL=null;
  $('svg').innerHTML='';$('svg').setAttribute('width',600);$('svg').setAttribute('height',300);
  $('ih').textContent='Design check';$('iss').innerHTML='';
  $('out').innerHTML=`<p role="alert"><b>SQL parsing error:</b> ${esc(e.message||'Unable to parse this SQL.')}</p><p>Check the SQL syntax and try again. This prototype supports CREATE TABLE and ALTER TABLE ... ADD FOREIGN KEY statements.</p>`;
  return;
 }
 if(!Object.keys(DB).length){
  RELS=[];ISS=[];POS={};SEL=null;$('svg').innerHTML='';$('svg').setAttribute('width',600);$('svg').setAttribute('height',300);
  $('ih').textContent='Design check';$('iss').innerHTML='';$('out').innerHTML='<p>No tables found. Paste at least one <code>CREATE TABLE</code> statement.</p>';return;
 }
 analyze();layout();SEL=null;draw();issues();overview();
}
$('go').onclick=run;
document.querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{$('sql').value=SAMPLES[b.dataset.s];run()});
chips();$('sql').value=SAMPLES.uni;run();
