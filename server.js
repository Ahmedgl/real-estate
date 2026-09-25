const express=require('express');
const session=require('express-session');
const Database=require('better-sqlite3');
const multer=require('multer');
const path=require('path');
const fs=require('fs');
const crypto=require('crypto');

const PORT=Number(process.env.PORT||3000);
const ROOT=__dirname;
const DATA=process.env.DATA_DIR||path.join(ROOT,'data');
const UP=process.env.UPLOAD_DIR||path.join(ROOT,'public','uploads');
fs.mkdirSync(DATA,{recursive:true});fs.mkdirSync(UP,{recursive:true});

const db=new Database(path.join(DATA,'dream_house.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.exec(`
CREATE TABLE IF NOT EXISTS properties(
 id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT NOT NULL, area TEXT NOT NULL,
 type TEXT DEFAULT 'شقة', size REAL, price REAL, floor TEXT, rooms INTEGER, baths INTEGER,
 finish TEXT, status TEXT NOT NULL DEFAULT 'متاح', owner TEXT, phone TEXT, image_url TEXT, notes TEXT,
 created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS clients(
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL, need TEXT, area TEXT,
 budget REAL, min_size REAL, max_size REAL, rooms INTEGER, status TEXT NOT NULL DEFAULT 'جديد', notes TEXT,
 created_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS audit_log(
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, entity TEXT NOT NULL,
 entity_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_properties_area ON properties(area);
CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_properties_size ON properties(size);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
`);

const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'2mb'}));
app.use((req,res,next)=>{res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');next()});
app.use(express.urlencoded({extended:true}));
app.use(session({
 secret:process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex'),
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:8*60*60*1000}
}));
app.use(express.static(path.join(ROOT,'public'),{extensions:['html']}));

const upload=multer({
 storage:multer.diskStorage({destination:(req,file,cb)=>cb(null,UP),filename:(req,file,cb)=>cb(null,Date.now()+'-'+crypto.randomBytes(6).toString('hex')+path.extname(file.originalname).toLowerCase())}),
 limits:{fileSize:8*1024*1024},
 fileFilter:(req,file,cb)=>cb(/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)?null:new Error('الملف يجب أن يكون صورة JPG أو PNG أو WEBP'))
});

function auth(req,res,next){if(!req.session.user)return res.status(401).json({error:'غير مصرح'});next();}
function clean(v){return v===undefined||v===null||String(v).trim()===''?null:v;}
function num(v){return clean(v)===null?null:Number(v);}
function normalizeDigits(v=''){return String(v).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/,/g,'').replace(/٬/g,'').replace(/\s/g,'');}
function audit(req,action,entity,id){db.prepare('INSERT INTO audit_log(actor,action,entity,entity_id) VALUES(?,?,?,?)').run(req.session.user.username,action,entity,id||null);}

app.get('/api/health',(req,res)=>res.json({ok:true,app:'DREAM HOUSE PRO',version:'3.0.0',time:new Date().toISOString()}));
app.post('/api/login',(req,res)=>{
 const {username,password}=req.body||{};
 const adminUser=process.env.ADMIN_USER||'admin';
 const adminPass=process.env.ADMIN_PASSWORD||'112203';
 if(username===adminUser && password===adminPass){req.session.user={username:adminUser,name:'Engineer Ahmed Galal'};return res.json({ok:true,user:req.session.user});}
 res.status(401).json({error:'اسم المستخدم أو كلمة المرور غير صحيحة'});
});
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get('/api/me',(req,res)=>res.json({loggedIn:!!req.session.user,user:req.session.user||null}));

app.get('/api/stats',auth,(req,res)=>{
 const total=db.prepare('SELECT COUNT(*) c FROM properties').get().c;
 const available=db.prepare("SELECT COUNT(*) c FROM properties WHERE status='متاح'").get().c;
 const clients=db.prepare('SELECT COUNT(*) c FROM clients').get().c;
 const follow=db.prepare("SELECT COUNT(*) c FROM clients WHERE status='متابعة'").get().c;
 const sold=db.prepare("SELECT COUNT(*) c FROM properties WHERE status='مباع'").get().c;
 const volume=db.prepare('SELECT COALESCE(SUM(price),0) total FROM properties WHERE status="متاح"').get().total;
 res.json({total,available,clients,follow,sold,volume});
});

app.get('/api/properties',auth,(req,res)=>{
 let {q='',area='',minPrice='',maxPrice='',minSize='',maxSize='',rooms='',status='',type=''}=req.query;
 q=String(q).trim();
 let sql='SELECT * FROM properties WHERE 1=1',p={};
 const nq=normalizeDigits(q);
 if(q){
   const numeric=Number(nq);
   if(Number.isFinite(numeric)&&numeric>=100000){sql+=' AND price<=@smartPrice';p.smartPrice=numeric;}
   else {sql+=' AND (name LIKE @q OR code LIKE @q OR area LIKE @q OR notes LIKE @q OR owner LIKE @q OR type LIKE @q)';p.q=`%${q}%`;}
 }
 if(area){sql+=' AND area LIKE @area';p.area=`%${area}%`;}
 if(minPrice!==''){sql+=' AND price>=@minPrice';p.minPrice=Number(normalizeDigits(minPrice));}
 if(maxPrice!==''){sql+=' AND price<=@maxPrice';p.maxPrice=Number(normalizeDigits(maxPrice));}
 if(minSize!==''){sql+=' AND size>=@minSize';p.minSize=Number(normalizeDigits(minSize));}
 if(maxSize!==''){sql+=' AND size<=@maxSize';p.maxSize=Number(normalizeDigits(maxSize));}
 if(rooms!==''){sql+=' AND rooms>=@rooms';p.rooms=Number(rooms);}
 if(status){sql+=' AND status=@status';p.status=status;}
 if(type){sql+=' AND type=@type';p.type=type;}
 sql+=' ORDER BY updated_at DESC, id DESC';
 res.json(db.prepare(sql).all(p));
});

function propertyPayload(b,by){return {code:clean(b.code),name:String(b.name||'').trim(),area:String(b.area||'').trim(),type:clean(b.type)||'شقة',size:num(b.size),price:num(normalizeDigits(b.price)),floor:clean(b.floor),rooms:num(b.rooms),baths:num(b.baths),finish:clean(b.finish),status:clean(b.status)||'متاح',owner:clean(b.owner),phone:clean(b.phone),image:clean(b.image_url),notes:clean(b.notes),by};}
app.post('/api/properties',auth,upload.single('image'),(req,res)=>{
 try{
  const b=req.body||{}; if(!b.name||!b.area)return res.status(400).json({error:'اسم العقار والمنطقة مطلوبان'});
  const data=propertyPayload(b,req.session.user.username); data.code=data.code||'DH-'+Date.now().toString().slice(-8); if(req.file)data.image='/uploads/'+req.file.filename;
  const info=db.prepare(`INSERT INTO properties(code,name,area,type,size,price,floor,rooms,baths,finish,status,owner,phone,image_url,notes,created_by) VALUES(@code,@name,@area,@type,@size,@price,@floor,@rooms,@baths,@finish,@status,@owner,@phone,@image,@notes,@by)`).run(data);
  audit(req,'create','property',info.lastInsertRowid);res.json(db.prepare('SELECT * FROM properties WHERE id=?').get(info.lastInsertRowid));
 }catch(e){if(req.file)try{fs.unlinkSync(path.join(UP,req.file.filename))}catch{}res.status(400).json({error:e.code==='SQLITE_CONSTRAINT_UNIQUE'?'كود العقار مستخدم بالفعل':e.message});}
});
app.put('/api/properties/:id',auth,upload.single('image'),(req,res)=>{
 try{
  const old=db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);if(!old)return res.status(404).json({error:'العقار غير موجود'});
  const b=req.body||{};if(!b.name||!b.area)return res.status(400).json({error:'اسم العقار والمنطقة مطلوبان'});
  const data=propertyPayload(b,req.session.user.username);let image=old.image_url;
  if(req.file){image='/uploads/'+req.file.filename;if(old.image_url)try{fs.unlinkSync(path.join(ROOT,'public',old.image_url))}catch{}}
  data.image=image;data.id=req.params.id;data.code=data.code||old.code;
  db.prepare(`UPDATE properties SET code=@code,name=@name,area=@area,type=@type,size=@size,price=@price,floor=@floor,rooms=@rooms,baths=@baths,finish=@finish,status=@status,owner=@owner,phone=@phone,image_url=@image,notes=@notes,updated_at=datetime('now','localtime') WHERE id=@id`).run(data);
  audit(req,'update','property',req.params.id);res.json(db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id));
 }catch(e){if(req.file)try{fs.unlinkSync(path.join(UP,req.file.filename))}catch{}res.status(400).json({error:e.code==='SQLITE_CONSTRAINT_UNIQUE'?'كود العقار مستخدم بالفعل':e.message});}
});
app.delete('/api/properties/:id',auth,(req,res)=>{const old=db.prepare('SELECT * FROM properties WHERE id=?').get(req.params.id);if(!old)return res.status(404).json({error:'غير موجود'});db.prepare('DELETE FROM properties WHERE id=?').run(req.params.id);if(old.image_url)try{fs.unlinkSync(path.join(ROOT,'public',old.image_url))}catch{}audit(req,'delete','property',req.params.id);res.json({ok:true});});

app.get('/api/clients',auth,(req,res)=>{const q=String(req.query.q||'').trim();let sql='SELECT * FROM clients WHERE 1=1',p={};if(q){sql+=' AND (name LIKE @q OR phone LIKE @q OR need LIKE @q OR area LIKE @q OR notes LIKE @q)';p.q=`%${q}%`;}sql+=' ORDER BY updated_at DESC,id DESC';res.json(db.prepare(sql).all(p));});
app.post('/api/clients',auth,(req,res)=>{const b=req.body||{};if(!b.name||!b.phone)return res.status(400).json({error:'اسم العميل ورقم الهاتف مطلوبان'});try{const r=db.prepare(`INSERT INTO clients(name,phone,need,area,budget,min_size,max_size,rooms,status,notes,created_by) VALUES(@name,@phone,@need,@area,@budget,@min,@max,@rooms,@status,@notes,@by)`).run({name:b.name.trim(),phone:b.phone.trim(),need:clean(b.need),area:clean(b.area),budget:num(normalizeDigits(b.budget)),min:num(b.min_size),max:num(b.max_size),rooms:num(b.rooms),status:clean(b.status)||'جديد',notes:clean(b.notes),by:req.session.user.username});audit(req,'create','client',r.lastInsertRowid);res.json(db.prepare('SELECT * FROM clients WHERE id=?').get(r.lastInsertRowid));}catch(e){res.status(400).json({error:e.message});}});
app.put('/api/clients/:id',auth,(req,res)=>{const b=req.body||{};try{db.prepare(`UPDATE clients SET name=@name,phone=@phone,need=@need,area=@area,budget=@budget,min_size=@min,max_size=@max,rooms=@rooms,status=@status,notes=@notes,updated_at=datetime('now','localtime') WHERE id=@id`).run({id:req.params.id,name:String(b.name||'').trim(),phone:String(b.phone||'').trim(),need:clean(b.need),area:clean(b.area),budget:num(normalizeDigits(b.budget)),min:num(b.min_size),max:num(b.max_size),rooms:num(b.rooms),status:clean(b.status)||'جديد',notes:clean(b.notes)});audit(req,'update','client',req.params.id);res.json(db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id));}catch(e){res.status(400).json({error:e.message});}});
app.delete('/api/clients/:id',auth,(req,res)=>{db.prepare('DELETE FROM clients WHERE id=?').run(req.params.id);audit(req,'delete','client',req.params.id);res.json({ok:true});});
app.get('/api/match/:id',auth,(req,res)=>{const c=db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);if(!c)return res.status(404).json({error:'العميل غير موجود'});let sql="SELECT * FROM properties WHERE status='متاح'",p={};if(c.area){sql+=' AND area LIKE @area';p.area=`%${c.area}%`;}if(c.budget){sql+=' AND price<=@budget';p.budget=c.budget;}if(c.min_size){sql+=' AND size>=@min';p.min=c.min_size;}if(c.max_size){sql+=' AND size<=@max';p.max=c.max_size;}if(c.rooms){sql+=' AND rooms>=@rooms';p.rooms=c.rooms;}sql+=' ORDER BY updated_at DESC,id DESC';res.json(db.prepare(sql).all(p));});

app.get('*',(req,res)=>res.sendFile(path.join(ROOT,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`DREAM HOUSE PRO running on port ${PORT}`));
