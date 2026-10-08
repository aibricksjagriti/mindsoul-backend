import test from "node:test";
import assert from "node:assert/strict";
import { createAccountRecovery } from "../src/services/accountRecovery.service.js";
import { createSessionSupport } from "../src/services/sessionSupport.service.js";

class Store {
  rows = new Map(); tail = Promise.resolve();
  collection(path) {
    const query = (filters=[],maximum=Infinity) => ({
      where: (field,operator,value) => query([...filters,[field,operator,value]],maximum),
      limit: (value) => query(filters,value),
      get: async () => {const docs=[...this.rows].filter(([key,value])=>key.startsWith(path+"/") && key.split("/").length === path.split("/").length+1 && filters.every(([field,operator,wanted])=>operator === "==" && value[field]===wanted)).slice(0,maximum).map(([key])=>this.ref(key).snapshot());return {docs,empty:!docs.length};},
      doc: id => this.ref(path+"/"+id),
    });
    return query();
  }
  ref(path) {
    return {path,id:path.split("/").at(-1),snapshot:()=>({exists:this.rows.has(path),id:path.split("/").at(-1),data:()=>this.rows.has(path)?{...this.rows.get(path)}:undefined}),get:async()=>this.ref(path).snapshot(),set:async value=>this.rows.set(path,{...value}),delete:async()=>this.rows.delete(path)};
  }
  async runTransaction(callback) {
    const previous=this.tail;let unlock;this.tail=new Promise(resolve=>{unlock=resolve;});await previous;const writes=[];
    try {const result=await callback({get:ref=>ref.get(),set:(ref,value)=>writes.push(()=>this.rows.set(ref.path,{...value})),update:(ref,value)=>writes.push(()=>this.rows.set(ref.path,{...this.rows.get(ref.path),...value}))});writes.forEach(write=>write());return result;}finally{unlock();}
  }
}

function recovery() {
  const db=new Store();db.rows.set("users/u",{email:"user@example.invalid",role:"user",password:"old-hash"});let now=1000;const sent=[];
  const service=createAccountRecovery({db,frontendUrl:"https://example.invalid",now:()=>now,hashPassword:async value=>"hashed-"+value,verifyMail:async()=>{},sendMail:async(email,url)=>sent.push({email,url})});
  return {db,service,sent,expire:()=>{now+=900001;}};
}
test("recovery does not enumerate accounts and stores only a hashed, single-use token",async()=>{
  const fixture=recovery();const known=await fixture.service.request("user@example.invalid"),unknown=await fixture.service.request("unknown@example.invalid");assert.deepEqual(known,unknown);assert.equal(fixture.sent.length,1);
  const token=new URL(fixture.sent[0].url).searchParams.get("token");assert.equal([...fixture.db.rows.keys()].some(key=>key.includes(token)),false);
  await fixture.service.reset(token,"new-password-12345");assert.equal(fixture.db.rows.get("users/u").password,"hashed-new-password-12345");await assert.rejects(fixture.service.reset(token,"another-password-123"),{statusCode:400});
});
test("expired links and repeated requests are rejected",async()=>{
  const fixture=recovery();await fixture.service.request("user@example.invalid");const token=new URL(fixture.sent[0].url).searchParams.get("token");fixture.expire();await assert.rejects(fixture.service.reset(token,"new-password-12345"),{statusCode:400});
  for(let i=0;i<5;i++)await fixture.service.request("unknown@example.invalid");await assert.rejects(fixture.service.request("unknown@example.invalid"),{statusCode:429});
});
test("new passwords invalidate previously issued reset links",async()=>{
  const fixture=recovery();await fixture.service.request("user@example.invalid");const token=new URL(fixture.sent[0].url).searchParams.get("token");fixture.db.rows.set("users/u",{email:"user@example.invalid",role:"user",password:"changed-hash"});await assert.rejects(fixture.service.reset(token,"new-password-12345"),{statusCode:400});
});
test("session-change requests are owned, idempotent, and do not mutate appointments or payments",async()=>{
  const db=new Store();db.rows.set("appointments/a",{studentId:"u",counsellorId:"c",date:"2030-01-01",timeSlot:"09:00-10:00",status:"scheduled",amount:1500,paymentStatus:"success"});
  const service=createSessionSupport({db,now:()=>Date.parse("2029-12-01")});const before={...db.rows.get("appointments/a")};await assert.rejects(service.request({role:"user",uid:"other"},"a",{type:"cancel"}),{statusCode:403});
  const first=await service.request({role:"user",uid:"u"},"a",{type:"cancel"});const repeat=await service.request({role:"user",uid:"u"},"a",{type:"cancel"});assert.equal(first.requestId,repeat.requestId);assert.deepEqual(db.rows.get("appointments/a"),before);assert.equal([...db.rows.keys()].filter(key=>key.startsWith("sessionChangeRequests/")).length,1);assert.equal([...db.rows.keys()].some(key=>key.startsWith("payments/")),false);
});
test("rescheduling requires an upcoming preference",async()=>{
  const db=new Store();const service=createSessionSupport({db,now:()=>Date.parse("2029-12-01")});await assert.rejects(service.request({role:"user",uid:"u"},"a",{type:"reschedule",preferredDate:"2020-01-01",preferredTime:"10:00"}),{statusCode:400});
});
