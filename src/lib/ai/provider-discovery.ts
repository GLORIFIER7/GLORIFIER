import { registerConnection, recordConnectionEvent } from '../connection-registry.ts';

export type ProviderAvailability = 'available' | 'unconfigured' | 'quota_exhausted' | 'rate_limited' | 'auth_failure' | 'capability_mismatch' | 'unreachable' | 'error';
export interface DiscoveredProvider { id:string; name:string; kind:'native'|'openai-compatible'|'router'|'self-hosted'; endpoint:string; configured:boolean; authenticated:boolean; availability:ProviderAvailability; capabilities:string[]; models:string[]; latencyMs:number|null; lastCheckedAt:string|null; cooldownUntil:string|null; reason:string|null; authorization:'configured'|'pending'|'not-configured'; }
interface ProviderDefinition { id:string; name:string; kind:DiscoveredProvider['kind']; endpoint:string; keyEnv?:string; baseUrlEnv?:string; modelEnv?:string; defaultModel?:string; capabilities:string[]; }

const definitions: ProviderDefinition[] = [
 {id:'openai',name:'OpenAI',kind:'openai-compatible',endpoint:'https://api.openai.com/v1',keyEnv:'OPENAI_API_KEY',baseUrlEnv:'OPENAI_BASE_URL',modelEnv:'OPENAI_MODEL',defaultModel:'gpt-4o',capabilities:['chat','reasoning','code']},
 {id:'gemini',name:'Google Gemini',kind:'native',endpoint:'https://generativelanguage.googleapis.com/v1beta',keyEnv:'GEMINI_API_KEY',modelEnv:'GEMINI_MODEL',defaultModel:'gemini-2.5-flash',capabilities:['chat','reasoning','multimodal','code']},
 {id:'anthropic',name:'Anthropic Claude',kind:'native',endpoint:'https://api.anthropic.com/v1',keyEnv:'ANTHROPIC_API_KEY',modelEnv:'ANTHROPIC_MODEL',defaultModel:'claude-opus-5',capabilities:['chat','reasoning','code']},
 {id:'meta',name:'Meta / Llama',kind:'openai-compatible',endpoint:'',keyEnv:'META_API_KEY',baseUrlEnv:'META_BASE_URL',modelEnv:'META_MODEL',capabilities:['chat','reasoning','code']},
 {id:'xai',name:'xAI',kind:'openai-compatible',endpoint:'https://api.x.ai/v1',keyEnv:'XAI_API_KEY',baseUrlEnv:'XAI_BASE_URL',modelEnv:'XAI_MODEL',defaultModel:'grok-4',capabilities:['chat','reasoning','code']},
 {id:'mistral',name:'Mistral AI',kind:'openai-compatible',endpoint:'https://api.mistral.ai/v1',keyEnv:'MISTRAL_API_KEY',baseUrlEnv:'MISTRAL_BASE_URL',modelEnv:'MISTRAL_MODEL',defaultModel:'mistral-large-latest',capabilities:['chat','reasoning','code']},
 {id:'deepseek',name:'DeepSeek',kind:'openai-compatible',endpoint:'https://api.deepseek.com/v1',keyEnv:'DEEPSEEK_API_KEY',baseUrlEnv:'DEEPSEEK_BASE_URL',modelEnv:'DEEPSEEK_MODEL',defaultModel:'deepseek-reasoner',capabilities:['chat','reasoning','code']},
 {id:'groq',name:'Groq',kind:'openai-compatible',endpoint:'https://api.groq.com/openai/v1',keyEnv:'GROQ_API_KEY',baseUrlEnv:'GROQ_BASE_URL',modelEnv:'GROQ_MODEL',defaultModel:'llama-4-scout',capabilities:['chat','reasoning','code']},
 {id:'together',name:'Together AI',kind:'openai-compatible',endpoint:'',keyEnv:'TOGETHER_API_KEY',baseUrlEnv:'TOGETHER_BASE_URL',modelEnv:'TOGETHER_MODEL',capabilities:['chat','reasoning','code']},
 {id:'fireworks',name:'Fireworks AI',kind:'openai-compatible',endpoint:'',keyEnv:'FIREWORKS_API_KEY',baseUrlEnv:'FIREWORKS_BASE_URL',modelEnv:'FIREWORKS_MODEL',capabilities:['chat','reasoning','code']},
 {id:'openrouter',name:'OpenRouter',kind:'router',endpoint:'https://openrouter.ai/api/v1',keyEnv:'OPENROUTER_API_KEY',baseUrlEnv:'OPENROUTER_BASE_URL',modelEnv:'OPENROUTER_MODEL',capabilities:['chat','reasoning','code','multimodal','provider-failover']},
 {id:'llmsrelay',name:'LLMsRelay',kind:'router',endpoint:'https://api.llmsrelay.com/v1',keyEnv:'LLMSRELAY_API_KEY',baseUrlEnv:'LLMSRELAY_BASE_URL',modelEnv:'LLMSRELAY_MODEL',defaultModel:'claude-sonnet-4.6',capabilities:['chat','reasoning','code','provider-gateway']},
 {id:'nvidia',name:'NVIDIA NIM / Nemotron',kind:'openai-compatible',endpoint:'https://integrate.api.nvidia.com/v1',keyEnv:'NVIDIA_API_KEY',baseUrlEnv:'NVIDIA_BASE_URL',modelEnv:'NVIDIA_MODEL',defaultModel:'nvidia/nemotron-3.5-lightning-30b-a3b',capabilities:['chat','reasoning','code','agent','tool-calling','long-context']},
 {id:'ollama',name:'Ollama / self-hosted',kind:'self-hosted',endpoint:'http://localhost:11434',keyEnv:'OLLAMA_AUTH_TOKEN',baseUrlEnv:'OLLAMA_BASE_URL',modelEnv:'OLLAMA_MODELS',capabilities:['chat','reasoning','code','self-hosted']}
];
const snapshot = new Map<string, DiscoveredProvider>();
const env = (name?:string) => name ? process.env[name]?.trim() || '' : '';
const endpointFor = (d:ProviderDefinition) => env(d.baseUrlEnv) || d.endpoint;
function classify(status:number, body:string):ProviderAvailability { if(status===401||status===403)return 'auth_failure'; if(status===402)return 'quota_exhausted'; if(status===429)return /quota|credit|exhaust/i.test(body)?'quota_exhausted':'rate_limited'; if(status>=500)return 'unreachable'; return status>=400?'error':'available'; }
async function fetchJson(url:string,headers:Record<string,string>,init:RequestInit={}) { const response=await fetch(url,{...init,headers,signal:AbortSignal.timeout(5000)}); const text=await response.text(); let body:any=null; try{body=JSON.parse(text);}catch{} return {response,text,body}; }
async function probe(d:ProviderDefinition):Promise<DiscoveredProvider> {
 const configured=Boolean(d.keyEnv ? env(d.keyEnv) : true), endpoint=endpointFor(d), checked=new Date().toISOString();
 if(!configured)return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:false,authenticated:false,availability:'unconfigured',capabilities:d.capabilities,models:[],latencyMs:null,lastCheckedAt:checked,cooldownUntil:null,reason:'No server-side credential configured.',authorization:'not-configured'};
 const started=Date.now();
 try {
  let result:{response:Response;text:string;body:any};
  if(d.id==='gemini') result=await fetchJson(endpoint+'/models?key='+encodeURIComponent(env(d.keyEnv)),{accept:'application/json'});
  else if(d.id==='anthropic') result=await fetchJson(endpoint+'/models',{accept:'application/json','x-api-key':env(d.keyEnv),'anthropic-version':'2023-06-01'});
  else if(d.id==='ollama') result=await fetchJson(endpoint.replace(/\/$/,'')+'/api/tags',{accept:'application/json',...(env(d.keyEnv)?{authorization:'Bearer '+env(d.keyEnv)}:{})});
  else result=await fetchJson(endpoint.replace(/\/$/,'')+'/models',{accept:'application/json',authorization:'Bearer '+env(d.keyEnv)});
  let availability=classify(result.response.status,result.text);
  const models=Array.isArray(result.body?.data)?result.body.data.map((m:any)=>String(m.id||m.name||'')).filter(Boolean):Array.isArray(result.body?.models)?result.body.models.map((m:any)=>String(m.name||m.model||'')).filter(Boolean):[];

  // NVIDIA authentication is not considered proven by /models alone. NVIDIA's hosted API
  // requires a real chat-completions inference request against the configured model.
  if(d.id==='nvidia' && availability==='available') {
   const model=env(d.modelEnv)||d.defaultModel||models[0];
   if(!model) {
    availability='capability_mismatch';
    return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:true,authenticated:false,availability,capabilities:d.capabilities,models,latencyMs:Date.now()-started,lastCheckedAt:checked,cooldownUntil:null,reason:'No NVIDIA inference model configured or advertised.',authorization:'pending'};
   }
   const inference=await fetchJson(endpoint.replace(/\/$/,'')+'/chat/completions',
    {accept:'application/json','content-type':'application/json',authorization:'Bearer '+env(d.keyEnv)},
    {method:'POST',body:JSON.stringify({model,messages:[{role:'user',content:'GLORIFIER NVIDIA connectivity test. Reply OK.'}],max_tokens:8,stream:false,temperature:0})});
   availability=classify(inference.response.status,inference.text);
   const authenticated=inference.response.status!==401&&inference.response.status!==403;
   const inferenceOk=inference.response.status>=200&&inference.response.status<300;
   return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:true,authenticated:inferenceOk&&authenticated,availability,capabilities:d.capabilities,models,latencyMs:Date.now()-started,lastCheckedAt:checked,cooldownUntil:null,reason:inferenceOk?null:inference.text.slice(0,300),authorization:inferenceOk&&process.env.NVIDIA_AUTHORIZED==='true'?'configured':'pending'};
  }

  return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:true,authenticated:result.response.status!==401&&result.response.status!==403,availability,capabilities:d.capabilities,models,latencyMs:Date.now()-started,lastCheckedAt:checked,cooldownUntil:null,reason:availability==='available'?null:result.text.slice(0,300),authorization:process.env[d.id.toUpperCase()+'_AUTHORIZED']==='true'?'configured':'pending'};
 } catch(error) { return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:true,authenticated:false,availability:'unreachable',capabilities:d.capabilities,models:[],latencyMs:Date.now()-started,lastCheckedAt:checked,cooldownUntil:null,reason:error instanceof Error?error.message.slice(0,300):String(error).slice(0,300),authorization:'pending'}; }
}
export function getGlobalProviderDiscoverySnapshot():DiscoveredProvider[] { return definitions.map(d=>snapshot.get(d.id)||{id:d.id,name:d.name,kind:d.kind,endpoint:endpointFor(d),configured:Boolean(d.keyEnv?env(d.keyEnv):true),authenticated:false,availability:d.keyEnv&&env(d.keyEnv)?'unreachable':'unconfigured',capabilities:d.capabilities,models:[],latencyMs:null,lastCheckedAt:null,cooldownUntil:null,reason:'Not probed yet.',authorization:d.keyEnv&&env(d.keyEnv)?'pending':'not-configured'}); }
export function getEligibleGlobalProviders(capability?:string) { return getGlobalProviderDiscoverySnapshot().filter(p=>p.configured&&p.authenticated&&p.availability==='available'&&(!capability||p.capabilities.includes(capability))); }
export async function discoverGlobalProviders(actor='provider-discovery') { const results=await Promise.all(definitions.map(probe)); for(const p of results){ snapshot.set(p.id,p); const connectionId='provider-'+p.id; await registerConnection({id:connectionId,provider:p.id,displayName:p.name,authType:'api_key',status:p.configured&&p.authenticated&&p.authorization==='configured'?'authorized':'discovered',scopes:p.capabilities,risk:p.id==='ollama'?'medium':'high',accountRef:null,expiresAt:null,lastVerifiedAt:p.lastCheckedAt,requiresHumanApproval:true,metadata:{registryType:'global-provider',kind:p.kind,endpoint:p.endpoint,availability:p.availability,models:p.models,latencyMs:p.latencyMs,reason:p.reason,authorization:p.authorization}}); await recordConnectionEvent(connectionId,'provider_discovery_probe',actor,{availability:p.availability,authenticated:p.authenticated,latencyMs:p.latencyMs,models:p.models}); } return results; }
export function getGlobalProviderDiscoveryPolicy(){ return {architecture:'GLOBAL_PROVIDER_DISCOVERY_FAILOVER_FABRIC',authenticatedRegistrationRequired:true,authorizationSeparateFromAuthentication:true,noSyntheticSuccess:true,quotaExhaustionIsNotHidden:true,internetDiscoveryBoundary:'documented/configured provider endpoints only; no quota, authentication, paywall, regional or access-control bypass',fallbackOrder:['configured-provider','router-provider','self-hosted-compute'],truthStates:['available','unconfigured','quota_exhausted','rate_limited','auth_failure','capability_mismatch','unreachable','error']} as const; }