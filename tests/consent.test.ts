import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConsent,parseConsent,CONSENT_DURATION_MS} from '../src/marketing/consent';

test('absence, malformed and out-of-scope consent do not authorize preferences',()=>{
 for(const value of [null,'not-json','{}','[]',JSON.stringify({...createConsent(true),preferences:'yes'}),JSON.stringify({...createConsent(true),marketing:true}),JSON.stringify({...createConsent(true),analytics:true}),JSON.stringify({...createConsent(true),version:99})])assert.equal(parseConsent(value),null);
});
test('consent expires and cannot predate its creation or grant longer retention',()=>{
 const now=Date.now(),record=createConsent(true);
 assert.equal(parseConsent(JSON.stringify(record),Date.parse(record.expiresAt)),null);
 assert.equal(parseConsent(JSON.stringify(record),Date.parse(record.updatedAt)-1),null);
 assert.equal(parseConsent(JSON.stringify({...record,updatedAt:0})),null);
 assert.equal(parseConsent(JSON.stringify({...record,expiresAt:new Date(now+CONSENT_DURATION_MS+10000).toISOString()}),now),null);
 assert.equal(parseConsent(JSON.stringify({...record,expiresAt:record.updatedAt}),now),null);
});
test('a recorded refusal stays a refusal; acceptance covers only the named preference',()=>{
 const refusal=parseConsent(JSON.stringify(createConsent(false)));
 assert.equal(refusal?.preferences,false);assert.equal(refusal?.necessary,true);
 const acceptance=parseConsent(JSON.stringify(createConsent(true)));
 assert.equal(acceptance?.preferences,true);assert.equal(acceptance?.analytics,false);assert.equal(acceptance?.marketing,false);
});
