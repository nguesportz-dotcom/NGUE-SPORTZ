const express=require("express"),fs=require("fs"),path=require("path");
const app=express(),PORT=process.env.PORT||3000,DATA=path.join(__dirname,"data.json");
app.use(express.json());app.use(express.static(__dirname));
const read=()=>JSON.parse(fs.readFileSync(DATA,"utf8"));const write=d=>fs.writeFileSync(DATA,JSON.stringify(d,null,2));
function auth(req,res,next){let h=req.headers.authorization||"";if(!h.startsWith("Basic ")){res.set("WWW-Authenticate",'Basic realm="NGU Admin"');return res.status(401).send("Login required")}let [u,p]=Buffer.from(h.slice(6),"base64").toString().split(":");if(u!==(process.env.ADMIN_USER||"admin")||p!==(process.env.ADMIN_PASS||"ngu123"))return res.status(401).send("Invalid login");next()}
app.get("/api/settings",(q,r)=>r.json(read().settings));
app.put("/api/settings",auth,(q,r)=>{let d=read();d.settings={...d.settings,...q.body};write(d);r.json(d.settings)});
app.post("/api/register",(q,r)=>{let d=read();if(d.registrations.length>=+d.settings.slots)return r.status(400).json({error:"All slots are full"});let id="NGU-"+Date.now().toString(36).toUpperCase();d.registrations.push({id,...q.body,createdAt:new Date().toISOString(),status:"pending"});write(d);r.json({ok:true,id})});
app.get("/api/registrations",auth,(q,r)=>r.json(read().registrations));
app.get("/api/registrations.csv",auth,(q,r)=>{let a=read().registrations,h=["id","name","type","whatsapp","entryFee","createdAt"],rows=[h.join(",")];a.forEach(x=>rows.push(h.map(k=>`"${String(x[k]??"").replace(/"/g,'""')}"`).join(",")));rows[0]+=',"players"';a.forEach((x,i)=>rows[i+1]+=','+`"${(x.players||[]).map(p=>p.name+" ("+p.uid+")").join(" | ")}"`);r.set("Content-Type","text/csv").send(rows.join("\n"))});
app.listen(PORT,()=>console.log("NGU ESPORTZ on "+PORT));