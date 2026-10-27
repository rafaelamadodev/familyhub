import test from "node:test";
import assert from "node:assert/strict";
import { dayBounds, localInstant, nextOccurrence, weeklyEventDates } from "../src/shared/domain.js";
import { tokenHash, hashSecret, verifySecret } from "../src/shared/security/password.js";
import { validateFile } from "../src/shared/files.js";
import { decryptTotp, encryptTotp, totpCode, verifyTotp } from "../src/shared/security/totp.js";
test("tokens have irreversible SHA-256 digests and passwords verify",async()=>{
 const token="random-test-secret";assert.equal(tokenHash(token).length,64);assert.notEqual(tokenHash(token),Buffer.from(token).toString("base64url"));
 const hash=await hashSecret("Example!123");assert.equal(await verifySecret("Example!123",hash),true);assert.equal(await verifySecret("wrong",hash),false);
});
test("TOTP validates RFC 6238 codes and encrypts secrets at rest",()=>{
 const secret="GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";const at=59_000;
 assert.equal(totpCode(secret,at),"287082");assert.equal(verifyTotp(secret,"287082",at),true);assert.equal(verifyTotp(secret,"000000",at),false);
 process.env.MFA_ENCRYPTION_KEY="unit-test-key";const encrypted=encryptTotp(secret);assert.notEqual(encrypted,secret);assert.equal(decryptTotp(encrypted),secret);
});
test("recurrence respects month end and DST local wall time",()=>{
 assert.equal(nextOccurrence(new Date("2026-01-31T12:00:00Z"),"MONTHLY","UTC").toISOString(),"2026-02-28T12:00:00.000Z");
 assert.equal(nextOccurrence(new Date("2026-03-07T14:00:00Z"),"DAILY","America/New_York").toISOString(),"2026-03-08T13:00:00.000Z");
 const bounds=dayBounds("America/Sao_Paulo",new Date("2026-09-30T01:00:00Z"));assert.equal(bounds.date,"2026-09-29");assert.equal(bounds.start.toISOString(),"2026-09-29T03:00:00.000Z");
 assert.throws(()=>localInstant("2026-03-08T02:30","America/New_York"));
});
test("weekly recurrence selects several days without changing local event time",()=>{
 const dates=weeklyEventDates("2026-10-26T09:00","2026-11-01",["MO","WE","FR"],"America/Sao_Paulo");
 assert.deepEqual(dates,["2026-10-26T09:00","2026-10-28T09:00","2026-10-30T09:00"]);
 assert.equal(nextOccurrence(localInstant(dates[0],"America/Sao_Paulo"),"WEEKLY;BYDAY=MO,WE,FR","America/Sao_Paulo").toISOString(),"2026-10-28T12:00:00.000Z");
 assert.throws(()=>weeklyEventDates("2026-10-26T09:00","2026-10-26",["TU"],"UTC"));
 assert.throws(()=>weeklyEventDates("2026-10-26T09:00","2026-10-25",["MO"],"UTC"));
 assert.throws(()=>weeklyEventDates("2026-10-26T09:00","2027-10-26",["MO","TU","WE","TH","FR","SA","SU"],"UTC"));
});
test("upload rejects mismatched MIME, extension and size",()=>{
 assert.throws(()=>validateFile(Buffer.from("<svg>bad</svg>").toString("base64"),"image/png","a.png"));
 assert.throws(()=>validateFile(Buffer.from("%PDF-1.4").toString("base64"),"application/pdf","a.exe"));
 assert.throws(()=>validateFile(Buffer.from("%PDF-1.4").toString("base64"),"application/pdf","a.pdf",2));
 assert.equal(validateFile(Buffer.from("%PDF-1.4").toString("base64"),"application/pdf","a.pdf").length,8);
});
