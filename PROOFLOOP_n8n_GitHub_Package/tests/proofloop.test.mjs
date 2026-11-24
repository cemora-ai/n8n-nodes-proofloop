import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {redactPersonalData,validIban} from '../lib/redact.mjs';
const require=createRequire(import.meta.url);
const {Proofloop}=require('../nodes/Proofloop/Proofloop.node.js');

function fakeNode(operation,reply,opts={}){
  const node=new Proofloop(),calls=[];
  const fields={operation,automationId:'aut_test',actionKey:'execution-123',estimatedCostUsd:4,reservationId:'gbr_test',settlementOutcome:'completed',actualCostUsd:3.2,confirmNoExternalExecution:false,costReported:true,costUsd:0.37,minutesReported:false,status:'success',externalId:'evt-1',errorMessage:'alice@example.org'};
  Object.assign(node,{
    getCredentials:async()=>({baseUrl:opts.baseUrl||'https://proofloop.tech',apiKey:'masked'}),
    getInputData:()=>[{json:{customer:'private@example.org'}}],
    getNodeParameter:(key)=>fields[key],
    continueOnFail:()=>opts.continueOnFail||false,
    helpers:{httpRequestWithAuthentication:async function(name,request){calls.push({name,request});if(reply instanceof Error)throw reply;return reply;}}
  });
  return {node,calls};
}

test('n8n community package masks emails and IBANs before outbound HTTP',async()=>{
  assert.equal(validIban('TR330006100519786457841326'),true);
  assert.deepEqual(redactPersonalData({iban:'TR330006100519786457841326',comment:'alice@example.org'}),{iban:'[REDACTED_FIELD]',comment:'[REDACTED_EMAIL]'});
  const {node,calls}=fakeNode('sendEvent',{received:true});
  const out=await Proofloop.prototype.execute.call(node);
  assert.equal(out[0].length,1);
  assert.equal(calls.length,1);
  assert.equal(calls[0].request.url,'https://proofloop.tech/api/v1/events');
  assert.equal(calls[0].request.body.errorMessage,'[REDACTED_EMAIL]');
  assert.equal(calls[0].request.body.costUsd,0.37);
  assert.doesNotMatch(JSON.stringify(calls[0].request.body),/private@example.org|alice@example.org/);
});

test('n8n budget gate denies rejected, malformed and failed preflight responses',async()=>{
  for(const response of [{allowed:false,hourlyLimitUsd:10,spentUsd:11},{message:'missing decision'},new Error('network unavailable')]){
    const {node,calls}=fakeNode('guardCheck',response,{continueOnFail:true});
    await assert.rejects(()=>Proofloop.prototype.execute.call(node),/GUARDIAN blocked/);
    assert.equal(calls[0].request.url,'https://proofloop.tech/api/v1/guardian/check');
  }
});

test('n8n community node refuses plain HTTP base URLs',async()=>{
  const {node,calls}=fakeNode('guardCheck',{allowed:true},{baseUrl:'http://internal.example'});
  await assert.rejects(()=>Proofloop.prototype.execute.call(node),/HTTPS origin/);
  assert.equal(calls.length,0);
});

test('n8n PROOFLOOP cost reservations fail closed and never forward raw customer input',async()=>{
  const permit=fakeNode('budgetReserve',{allowed:true,reservationId:'gbr_123'});
  const result=await Proofloop.prototype.execute.call(permit.node);
  assert.equal(result[0][0].json.proofloop.reservationId,'gbr_123');
  assert.equal(permit.calls[0].request.url,'https://proofloop.tech/api/v1/guardian/reserve');
  assert.deepEqual(permit.calls[0].request.body,{automationId:'aut_test',actionKey:'execution-123',estimatedCostUsd:4});
  assert.doesNotMatch(JSON.stringify(permit.calls[0].request.body),/private@example.org/);
  const denied=fakeNode('budgetReserve',{allowed:false,reason:'hourly_budget_unavailable'},{continueOnFail:true});
  await assert.rejects(()=>Proofloop.prototype.execute.call(denied.node),/GUARDIAN blocked/);
  const settled=fakeNode('budgetSettle',{settled:true});
  await Proofloop.prototype.execute.call(settled.node);
  assert.equal(settled.calls[0].request.url,'https://proofloop.tech/api/v1/guardian/settle');
  assert.equal(settled.calls[0].request.body.actualCostUsd,3.2);
});
