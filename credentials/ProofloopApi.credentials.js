'use strict';

class ProofloopApi {
  constructor() {
    this.name = 'proofloopApi';
    this.displayName = 'PROOFLOOP API';
    this.documentationUrl = 'https://docs.n8n.io/integrations/community-nodes/installation/';
    this.properties = [
      {displayName:'PROOFLOOP URL',name:'baseUrl',type:'string',default:'',required:true,placeholder:'https://your-proofloop-domain.com',description:'Your real PROOFLOOP HTTPS Worker origin'},
      {displayName:'Integration API Key',name:'apiKey',type:'string',typeOptions:{password:true},default:'',required:true,description:'Workspace key with events:write scope'}
    ];
    this.authenticate={type:'generic',properties:{headers:{Authorization:'=Bearer {{$credentials.apiKey}}'}}};
  }
}
module.exports = {ProofloopApi};
