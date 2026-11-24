'use strict';

class Proofloop {
  constructor() {
    this.description={
      displayName:'PROOFLOOP',name:'proofloop',icon:'file:proofloop.svg',group:['output'],version:1,
      subtitle:'={{$parameter["operation"]}}',description:'PII-safe telemetry and pre-execution cost reservations for agents',
      defaults:{name:'PROOFLOOP'},inputs:['main'],outputs:['main'],credentials:[{name:'proofloopApi',required:true}],
      properties:[
        {displayName:'Operation',name:'operation',type:'options',default:'guardCheck',options:[
          {name:'Check Hourly Budget (Before Agent Step)',value:'guardCheck',description:'Legacy observed-spend check; use Reserve Estimated Cost for strict admission.',action:'Check hourly budget'},
          {name:'Reserve Estimated Cost (Before Agent Step)',value:'budgetReserve',description:'Atomic reservation from the enforced hourly budget. Place BEFORE expensive work and keep Continue On Fail off.',action:'Reserve cost before agent step'},
          {name:'Settle Reserved Cost (After Agent Step)',value:'budgetSettle',description:'Report real cost or confirm that no external execution occurred.',action:'Settle reserved cost'},
          {name:'Record Agent Event',value:'sendEvent',description:'Send a redacted execution event to PROOFLOOP',action:'Record agent event'}
        ]},
        {displayName:'Automation ID',name:'automationId',type:'string',default:'',required:true,description:'ID of the existing PROOFLOOP agent',placeholder:'aut_...',displayOptions:{show:{}}},
        {displayName:'Unique External Action Key',name:'actionKey',type:'string',default:'',required:true,description:'Unique for each execution and item, for example workflow execution ID + item index. Reusing a key never grants another permit.',displayOptions:{show:{operation:['budgetReserve']}}},
        {displayName:'Estimated Cost (USD)',name:'estimatedCostUsd',type:'number',default:0.01,required:true,typeOptions:{numberPrecision:6,minValue:0.000001},displayOptions:{show:{operation:['budgetReserve']}}},
        {displayName:'Reservation ID',name:'reservationId',type:'string',default:'',required:true,description:'Use the reservationId from Reserve Estimated Cost.',displayOptions:{show:{operation:['budgetSettle']}}},
        {displayName:'Execution Outcome',name:'settlementOutcome',type:'options',options:[{name:'Completed',value:'completed'},{name:'Not Executed',value:'not_executed'}],default:'completed',displayOptions:{show:{operation:['budgetSettle']}}},
        {displayName:'Actual Cost (USD)',name:'actualCostUsd',type:'number',default:0,typeOptions:{numberPrecision:6,minValue:0},displayOptions:{show:{operation:['budgetSettle'],settlementOutcome:['completed']}}},
        {displayName:'Confirm No External Execution',name:'confirmNoExternalExecution',type:'boolean',default:false,description:'Only enable if the action definitely did not start or commit.',displayOptions:{show:{operation:['budgetSettle'],settlementOutcome:['not_executed']}}},
        {displayName:'Status',name:'status',type:'options',options:[{name:'Success',value:'success'},{name:'Error',value:'error'}],default:'success',displayOptions:{show:{operation:['sendEvent']}}},
        {displayName:'Cost Was Measured',name:'costReported',type:'boolean',default:false,description:'Only report a USD amount when the upstream agent provided it; unknown is not zero.',displayOptions:{show:{operation:['sendEvent']}}},
        {displayName:'Reported Cost (USD)',name:'costUsd',type:'number',default:0,typeOptions:{numberPrecision:6,minValue:0},displayOptions:{show:{operation:['sendEvent'],costReported:[true]}}},
        {displayName:'Saved Time Was Measured',name:'minutesReported',type:'boolean',default:false,displayOptions:{show:{operation:['sendEvent']}}},
        {displayName:'Reported Minutes Saved',name:'minutesSaved',type:'number',default:0,typeOptions:{numberPrecision:2,minValue:0},displayOptions:{show:{operation:['sendEvent'],minutesReported:[true]}}},
        {displayName:'External Execution ID',name:'externalId',type:'string',default:'',description:'Set a stable unique ID for idempotent retries',displayOptions:{show:{operation:['sendEvent']}}},
        {displayName:'Error Message (PII Redacted)',name:'errorMessage',type:'string',default:'',displayOptions:{show:{operation:['sendEvent']}}},
      ]
    };
  }
  async execute() {
    const input=this.getInputData();
    const outputs=[];
    const {redactPersonalData}=await import('../../lib/redact.mjs');
    const credentials=await this.getCredentials('proofloopApi');
    let baseUrl;
    try {
      const parsed=new URL(String(credentials.baseUrl||''));
      if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash)throw new Error();
      baseUrl=parsed.origin;
    } catch {throw new Error('PROOFLOOP URL must be a valid HTTPS origin.');}
    for(let index=0;index<input.length;index++){
      const operation=this.getNodeParameter('operation',index);
      const automationId=String(this.getNodeParameter('automationId',index)||'').trim();
      if(!automationId)throw new Error('PROOFLOOP automation ID is required.');
      const body=operation==='guardCheck'?{automationId}:operation==='budgetReserve'?{
        automationId,actionKey:String(this.getNodeParameter('actionKey',index)||'').trim(),
        estimatedCostUsd:Number(this.getNodeParameter('estimatedCostUsd',index))
      }:operation==='budgetSettle'?{
        automationId,reservationId:String(this.getNodeParameter('reservationId',index)||'').trim(),
        outcome:this.getNodeParameter('settlementOutcome',index),
        actualCostUsd:this.getNodeParameter('settlementOutcome',index)==='completed'?Number(this.getNodeParameter('actualCostUsd',index)):undefined,
        confirmNoExternalExecution:this.getNodeParameter('settlementOutcome',index)==='not_executed'?this.getNodeParameter('confirmNoExternalExecution',index,false)===true:undefined
      }:{automationId,
        status:this.getNodeParameter('status',index),
        costUsd:this.getNodeParameter('costReported',index,false)===true?Number(this.getNodeParameter('costUsd',index)):undefined,
        minutesSaved:this.getNodeParameter('minutesReported',index,false)===true?Number(this.getNodeParameter('minutesSaved',index)):undefined,
        externalId:String(this.getNodeParameter('externalId',index)||'').trim()||undefined,
        errorMessage:String(this.getNodeParameter('errorMessage',index)||'')};
      const isAdmission=operation==='guardCheck'||operation==='budgetReserve';
      const endpoint={guardCheck:'/api/v1/guardian/check',budgetReserve:'/api/v1/guardian/reserve',budgetSettle:'/api/v1/guardian/settle',sendEvent:'/api/v1/events'}[operation];
      if(!endpoint)throw new Error('Unknown PROOFLOOP operation.');
      // Redaction is unconditional before HTTP. No item JSON or raw customer payload leaves n8n.
      const safeBody=redactPersonalData(body);
      try {
        const data=await this.helpers.httpRequestWithAuthentication.call(this,'proofloopApi',{
          method:'POST',url:baseUrl+endpoint,
          body:safeBody,json:true,timeout:10000
        });
        if(isAdmission && data?.allowed!==true)throw new Error(data?.allowed===false
          ?`PROOFLOOP preflight denied the next agent step (${String(data.reason||'budget limit').slice(0,100)}).`
          :'PROOFLOOP preflight returned an invalid decision; the next step is not authorized.');
        if(operation==='budgetSettle'&&data?.settled!==true)throw new Error('PROOFLOOP reservation settlement was not confirmed.');
        outputs.push({json:{...input[index].json,proofloop:data},pairedItem:{item:index}});
      } catch(error) {
        // A safety check must not silently turn into a successful passthrough.
        // n8n-level error workflows can still override execution behavior,
        // so setup guidance requires "Continue On Fail" to remain disabled.
        if(isAdmission||operation==='budgetSettle')throw new Error(`GUARDIAN blocked: PROOFLOOP budget operation failed: ${String(error.message||'unavailable').slice(0,220)}`);
        if(this.continueOnFail())outputs.push({json:{...input[index].json,proofloopError:error.message},pairedItem:{item:index}});
        else throw error;
      }
    }
    return [outputs];
  }
}
module.exports={Proofloop};
