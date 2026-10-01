import "dotenv/config";
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { PrismaClient } from "../generated/prisma/index.js";
const require=createRequire(import.meta.url);

test("functional requirements — isolated PostgreSQL schema", { timeout:180000 }, async t=>{
 if(!process.env.DATABASE_URL)throw new Error("Configure DATABASE_URL for integration tests");
 const originalUrl=process.env.DATABASE_URL;
 const schema="familyhub_test_"+randomBytes(6).toString("hex");
 const url=new URL(originalUrl);url.searchParams.set("schema",schema);
 process.env.DATABASE_URL=url.toString();process.env.JWT_SECRET=randomBytes(32).toString("hex");
 const migrated=spawnSync(process.execPath,[require.resolve("prisma/build/index.js"),"migrate","deploy"],{cwd:process.cwd(),env:process.env,encoding:"utf8"});
 if(!/^familyhub_test_[a-f0-9]{12}$/.test(schema))throw new Error("Unsafe test schema");
 if(migrated.status!==0){
  const cleanup=new PrismaClient({datasourceUrl:originalUrl});
  try{await cleanup.$executeRawUnsafe('DROP SCHEMA IF EXISTS "'+schema+'" CASCADE');}catch{}
  finally{await cleanup.$disconnect();}
  assert.equal(migrated.status,0,[migrated.error?.message,migrated.stdout,migrated.stderr].filter(Boolean).join("\n"));
 }
 const {buildApp}=await import("../src/app.js");const {db}=await import("../src/db.js");
 const app=await buildApp();
 t.after(async()=>{await app.close();await db.$disconnect();const cleanup=new PrismaClient({datasourceUrl:originalUrl});await cleanup.$executeRawUnsafe('DROP SCHEMA "'+schema+'" CASCADE');await cleanup.$disconnect();});
 let requestNumber=0;
 async function call(method:string,path:string,body?:unknown,token?:string,expected=200){
   const response=await app.inject({method:method as "GET",url:path,payload:body as object,headers:{...(token?{authorization:"Bearer "+token}:{})},remoteAddress:"127.1."+Math.floor(requestNumber/250)+"."+(++requestNumber%250+1)});
   assert.equal(response.statusCode,expected,method+" "+path+": "+response.body);
   return response.body?response.json():null;
 }
 const password="Integration!123";
 async function account(name:string,verify=true){
   const email=name.toLowerCase()+"-"+randomUUID()+"@example.test";
   await call("POST","/api/v1/auth/register",{name,email,password},undefined,202);
   const user=await db.user.findUniqueOrThrow({where:{email}});
   if(verify){const mail=await db.mailJob.findFirstOrThrow({where:{recipient:email}});const token=mail.text.split("#verify=")[1];await call("POST","/api/v1/auth/verify-email",{token});await call("POST","/api/v1/auth/verify-email",{token},undefined,400);}
   const session=await call("POST","/api/v1/auth/login",{email,password});
   return {...session,userId:user.id,email};
 }
 const admin=await account("Admin");const outsider=await account("Outsider");const viewer=await account("Viewer");const member=await account("Member");const unverified=await account("Unverified",false);
 const family=await call("POST","/api/v1/families",{name:"Integration family",timezone:"America/Sao_Paulo"},admin.accessToken,201);
 const another=await call("POST","/api/v1/families",{name:"Other family",timezone:"UTC"},outsider.accessToken,201);
 const invite=await call("POST","/api/v1/families/"+family.id+"/invites",{role:"VIEWER"},admin.accessToken,201);
 await call("POST","/api/v1/families/join",{joinCode:invite.code},viewer.accessToken,201);
 const memberInvite=await call("POST","/api/v1/families/"+family.id+"/invites",{role:"MEMBER",email:member.email},admin.accessToken,201);
 await call("POST","/api/v1/families/join",{joinCode:memberInvite.code},member.accessToken,201);
 await t.test("auth revocation, refresh, recovery and duplicate responses",async()=>{
   await call("POST","/api/v1/auth/register",{name:"Duplicate",email:admin.email,password},undefined,202);
   await call("POST","/api/v1/auth/login",{email:admin.email,password:"not-correct"},undefined,401);
   await call("POST","/api/v1/auth/login",{email:"unknown@example.test",password:"not-correct"},undefined,401);
   const session=await call("POST","/api/v1/auth/login",{email:outsider.email,password});
   await call("POST","/api/v1/auth/logout",undefined,session.accessToken);
   await call("GET","/api/v1/me",undefined,session.accessToken,401);
   await call("POST","/api/v1/auth/refresh",{refreshToken:session.refreshToken},undefined,401);
   const fresh=await call("POST","/api/v1/auth/login",{email:outsider.email,password});
   const rotated=await call("POST","/api/v1/auth/refresh",{refreshToken:fresh.refreshToken});
   await call("POST","/api/v1/auth/refresh",{refreshToken:fresh.refreshToken},undefined,401);
   await call("GET","/api/v1/me",undefined,rotated.accessToken);
   await call("POST","/api/v1/auth/forgot-password",{email:unverified.email});
   const mail=await db.mailJob.findFirstOrThrow({where:{recipient:unverified.email,subject:"Redefinir senha do FamilyHub"}});
   const token=mail.text.split("#reset=")[1];
   await call("POST","/api/v1/auth/reset-password",{token,password:"Changed!123"});
   await call("POST","/api/v1/auth/reset-password",{token,password:"Changed!123"},undefined,400);
   await call("GET","/api/v1/me",undefined,unverified.accessToken,401);
   const reset=await call("POST","/api/v1/auth/login",{email:unverified.email,password:"Changed!123"});unverified.accessToken=reset.accessToken;
   await call("POST","/api/v1/auth/forgot-password",{email:unverified.email});
   const expiredMail=await db.mailJob.findFirstOrThrow({where:{recipient:unverified.email,subject:"Redefinir senha do FamilyHub"},orderBy:{createdAt:"desc"}});
   await db.passwordResetToken.updateMany({where:{userId:unverified.userId,usedAt:null},data:{expiresAt:new Date(0)}});
   await call("POST","/api/v1/auth/reset-password",{token:expiredMail.text.split("#reset=")[1],password:"ChangedAgain!123"},undefined,400);
 });
 await t.test("family invitations and last administrator protection",async()=>{
   await call("POST","/api/v1/families/join",{joinCode:invite.code},outsider.accessToken,400);
   await call("POST","/api/v1/families/"+family.id+"/invites",{role:"MEMBER"},unverified.accessToken,403);
   const pending=await call("POST","/api/v1/families/"+family.id+"/invites",{},admin.accessToken,201);
   await call("DELETE","/api/v1/families/"+family.id+"/invites/"+pending.id,undefined,admin.accessToken);
   await call("POST","/api/v1/families/join",{joinCode:pending.code},outsider.accessToken,400);
   const expired=await call("POST","/api/v1/families/"+family.id+"/invites",{},admin.accessToken,201);
   await db.familyInvite.update({where:{id:expired.id},data:{expiresAt:new Date(0)}});
   await call("POST","/api/v1/families/join",{joinCode:expired.code},outsider.accessToken,400);
   const members=await call("GET","/api/v1/families/"+family.id+"/members",undefined,admin.accessToken);
   const owner=members.find((item:{userId:string})=>item.userId===admin.userId);
   await call("PATCH","/api/v1/families/"+family.id+"/members/"+owner.id,{role:"MEMBER"},admin.accessToken,409);
   await call("PATCH","/api/v1/families/"+family.id,{name:"Attack"},outsider.accessToken,403);
   await call("POST","/api/v1/families",{name:"Bad",timezone:"Moon/Base"},admin.accessToken,400);
 });
 await t.test("every module blocks unauthenticated, outsider and restricted members",async()=>{
   const paths=["tasks","shopping-lists","events","dashboard","children","health-records","documents","finance"];
   for(const path of paths){const suffix="?familyId="+family.id+(path==="finance"?"&month=2026-09":"");await call("GET","/api/v1/"+path+suffix,undefined,undefined,401);await call("GET","/api/v1/"+path+suffix,undefined,outsider.accessToken,403);}
   for(const path of ["children","health-records","documents","finance"]){const suffix="?familyId="+family.id+(path==="finance"?"&month=2026-09":"");await call("GET","/api/v1/"+path+suffix,undefined,member.accessToken,403);await call("GET","/api/v1/"+path+suffix,undefined,viewer.accessToken,403);}
   await call("POST","/api/v1/tasks",{familyId:family.id,title:"Forbidden"},viewer.accessToken,403);
   await call("POST","/api/v1/tasks",{familyId:family.id,title:"Wrong assignee",assigneeId:outsider.userId},admin.accessToken,403);
   await call("GET","/api/v1/tasks?familyId=bad",undefined,admin.accessToken,400);
 });
 let taskId="";
 await t.test("task CRUD, recurrence concurrency, history and dashboard",async()=>{
   const task=await call("POST","/api/v1/tasks",{familyId:family.id,title:"Recurring task",dueAt:"2026-01-31T09:00",priority:"HIGH",recurrence:"MONTHLY",assigneeId:member.userId},admin.accessToken,201);taskId=task.id;
   await call("PATCH","/api/v1/tasks/"+task.id,{familyId:another.id},admin.accessToken,400);
   await call("PATCH","/api/v1/tasks/"+task.id,{title:"Steal"},outsider.accessToken,403);
   const responses=await Promise.all([app.inject({method:"PATCH",url:"/api/v1/tasks/"+task.id,headers:{authorization:"Bearer "+admin.accessToken},payload:{status:"DONE"}}),app.inject({method:"PATCH",url:"/api/v1/tasks/"+task.id,headers:{authorization:"Bearer "+admin.accessToken},payload:{status:"DONE"}})]);
   assert(responses.every(response=>[200,409].includes(response.statusCode)));
   assert.equal(await db.task.count({where:{occurrenceOf:task.id}}),1);
   const next=await db.task.findFirstOrThrow({where:{occurrenceOf:task.id}});assert.equal(next.dueAt!.toISOString(),"2026-02-28T12:00:00.000Z");
   await call("PATCH","/api/v1/tasks/"+task.id,{status:"OPEN"},member.accessToken);await call("PATCH","/api/v1/tasks/"+task.id,{status:"DONE"},member.accessToken);assert.equal(await db.task.count({where:{occurrenceOf:task.id}}),1);
   const dashboard=await call("GET","/api/v1/dashboard?familyId="+family.id,undefined,admin.accessToken);assert(dashboard.overdueCount>=1);
   const other=await call("GET","/api/v1/dashboard?familyId="+another.id,undefined,outsider.accessToken);assert.equal(other.tasks.length,0);
   const history=await call("GET","/api/v1/tasks/"+task.id+"/history?familyId="+family.id,undefined,admin.accessToken);assert(history.length>=3);
   await call("PATCH","/api/v1/tasks/"+randomUUID(),{title:"Missing"},admin.accessToken,404);
 });
 await t.test("shopping list and item lifecycle",async()=>{
   const list=await call("POST","/api/v1/shopping-lists",{familyId:family.id,name:"Groceries"},member.accessToken,201);
   const item=await call("POST","/api/v1/shopping-items",{listId:list.id,name:"Rice",quantity:2,priority:"HIGH"},member.accessToken,201);
   await call("PATCH","/api/v1/shopping-items/"+item.id,{checked:true},viewer.accessToken,403);
   await call("PATCH","/api/v1/shopping-items/"+item.id,{checked:true},outsider.accessToken,403);
   await call("PATCH","/api/v1/shopping-items/"+item.id,{checked:true},member.accessToken);await call("PATCH","/api/v1/shopping-items/"+item.id,{checked:true},member.accessToken);
   await call("PATCH","/api/v1/shopping-lists/"+list.id,{status:"ARCHIVED"},member.accessToken);
   await call("POST","/api/v1/shopping-items",{listId:list.id,name:"Blocked"},member.accessToken,409);
   await call("DELETE","/api/v1/shopping-items/"+item.id,undefined,admin.accessToken);
 });
 await t.test("calendar participants, UTC, reminder and cancel/restore",async()=>{
   await call("POST","/api/v1/events",{familyId:family.id,title:"Bad",startsAt:"2026-10-01T08:00",participantIds:[outsider.userId]},admin.accessToken,403);
   const event=await call("POST","/api/v1/events",{familyId:family.id,title:"Appointment",startsAt:"2026-10-01T08:00",participantIds:[member.userId],reminderMinutes:30},member.accessToken,201);
   assert.equal(event.startsAt,"2026-10-01T11:00:00.000Z");assert(await db.notification.count({where:{route:"Calendário/"+event.id}})>0);
   await call("PATCH","/api/v1/events/"+event.id,{status:"CANCELLED"},member.accessToken);assert.equal(await db.notification.count({where:{route:"Calendário/"+event.id}}),0);
   await call("PATCH","/api/v1/events/"+event.id,{status:"SCHEDULED"},member.accessToken);
   const allDay=await call("POST","/api/v1/events",{familyId:family.id,title:"Holiday",startsAt:"2026-10-02",allDay:true},admin.accessToken,201);assert.equal(allDay.dateOnly,"2026-10-02");
 });
 await t.test("sensitive modules, child restrictions, finance recurrence and audit",async()=>{
   const child=await call("POST","/api/v1/children",{familyId:family.id,name:"Test child",birthDate:"2020-01-01",relationship:"Parent"},admin.accessToken,201);
   const growth=await call("POST","/api/v1/growth-records",{familyId:family.id,childId:child.id,measuredOn:"2026-01-01",weightKg:20,heightCm:110},admin.accessToken,201);
   for (const [token,expected] of [[undefined,401],[outsider.accessToken,403],[viewer.accessToken,403],[member.accessToken,403]] as const) await call("GET","/api/v1/growth-records?familyId="+family.id+"&childId="+child.id,undefined,token,expected);
   const growthList=await call("GET","/api/v1/growth-records?familyId="+family.id+"&childId="+child.id,undefined,admin.accessToken);assert.equal(growthList.length,1);
   await call("POST","/api/v1/growth-records",{familyId:another.id,childId:child.id,measuredOn:"2026-01-01",weightKg:20,heightCm:110},outsider.accessToken,404);
   const healthExport=await call("POST","/api/v1/privacy/requests",{kind:"EXPORT",scope:["health"],familyId:family.id,password},admin.accessToken,201);assert.equal(healthExport.data.growth[0].id,growth.id);
   const record=await call("POST","/api/v1/health-records",{familyId:family.id,childId:child.id,category:"MEDICATION",title:"Planned medication"},admin.accessToken,201);
   await call("PATCH","/api/v1/health-records/"+record.id,{completed:true},admin.accessToken);
   await call("PATCH","/api/v1/children/"+child.id,{blockedModules:["health","documents"]},admin.accessToken);
   const hidden=await call("GET","/api/v1/health-records?familyId="+family.id,undefined,admin.accessToken);assert.equal(hidden.length,0);
   await call("GET","/api/v1/growth-records?familyId="+family.id+"&childId="+child.id,undefined,admin.accessToken,403);
   const blockedExport=await call("POST","/api/v1/privacy/requests",{kind:"EXPORT",scope:["health"],familyId:family.id,password},admin.accessToken,201);assert.equal(blockedExport.data.growth.length,0);
   await call("PATCH","/api/v1/health-records/"+record.id,{notes:"Blocked"},admin.accessToken,403);
   await call("POST","/api/v1/documents",{familyId:family.id,name:"Fake",category:"Test",file:{filename:"a.png",mime:"image/png",base64:Buffer.from("fake").toString("base64")}},admin.accessToken,400);
   const entry=await call("POST","/api/v1/finance",{familyId:family.id,description:"Recurring bill",amount:12.50,category:"Home",competence:"2026-09",recurrence:"MONTHLY"},admin.accessToken,201);
   await call("PATCH","/api/v1/finance/"+entry.id,{status:"PAID"},admin.accessToken);await call("PATCH","/api/v1/finance/"+entry.id,{status:"PAID"},admin.accessToken);
   assert.equal(await db.financialEntry.count({where:{occurrenceOf:entry.id}}),1);
   const paid=await call("POST","/api/v1/finance",{familyId:family.id,description:"Already paid",amount:5,category:"Home",competence:"2026-11",recurrence:"MONTHLY",status:"PAID"},admin.accessToken,201);assert.equal(await db.financialEntry.count({where:{occurrenceOf:paid.id}}),1);
   const total=await call("GET","/api/v1/finance?familyId="+family.id+"&month=2026-09",undefined,admin.accessToken);assert.equal(total.total,12.5);
   assert(await db.auditLog.count({where:{familyId:family.id,entity:"HealthRecord"}})>0);
 });
 await t.test("privacy reauthentication, explicit export scope, notifications and logout all",async()=>{
   await call("POST","/api/v1/privacy/requests",{kind:"EXPORT",scope:["account"],password:"bad"},admin.accessToken,403);
   const exported=await call("POST","/api/v1/privacy/requests",{kind:"EXPORT",scope:["account"],password},admin.accessToken,201);
   assert.equal(exported.data.health,undefined);assert.equal(exported.data.account.passwordHash,undefined);
   await call("POST","/api/v1/privacy/requests",{kind:"DELETE",scope:["account"],password},admin.accessToken,201);
   await call("PUT","/api/v1/privacy/consents",{optionalCommunications:false},admin.accessToken);
   await call("PUT","/api/v1/notification-preferences",{tasks:false,events:true,shopping:true,push:false},admin.accessToken);
   await call("GET","/api/v1/notifications",undefined,admin.accessToken);
   await call("POST","/api/v1/auth/logout-all",undefined,admin.accessToken);
   await call("GET","/api/v1/me",undefined,admin.accessToken,401);
 });
});
