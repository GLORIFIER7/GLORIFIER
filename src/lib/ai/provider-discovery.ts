import { createHash } from 'node:crypto';
import { registerConnection, recordConnectionEvent } from '../connection-registry.ts';

export type ProviderAvailability = 'available' | 'unconfigured' | 'quota_exhausted' | 'rate_limited' | 'auth_failure' | 'capability_mismatch' | 'unreachable' | 'error';
export interface DiscoveredProvider { id:string; name:string; kind:'native'|'openai-compatible'|'router'|'self-hosted'; endpoint:string; configured:boolean; authenticated:boolean; availability:ProviderAvailability; capabilities:string[]; models:string[]; latencyMs:number|null; lastCheckedAt:string|null; cooldownUntil:string|null; reason:string|null; authorization:'configured'|'pending'|'not-configured'; }
interface ProviderDefinition { id:string; name:string; kind:DiscoveredProvider['kind']; endpoint:string; keyEnv?:string; baseUrlEnv?:string; modelEnv?:string; workspaceIdEnv?:string; defaultModel?:string; capabilities:string[]; }

const definitions: ProviderDefinition[] = [
 {id:'openai',name:'OpenAI',kind:'openai-compatible',endpoint:'https://api.openai.com/v1',keyEnv:'OPENAI_API_KEY',baseUrlEnv:'OPENAI_BASE_URL',modelEnv:'OPENAI_MODEL',defaultModel:'gpt-4o',capabilities:['chat','reasoning','code']},
 {id:'gemini',name:'Google Gemini',kind:'native',endpoint:'https://generativelanguage.googleapis.com/v1beta',keyEnv:'GEMINI_API_KEY',modelEnv:'GEMINI_MODEL',defaultModel:'gemini-3.1-flash-lite',capabilities:['chat','reasoning','multimodal','code']},
 {id:'anthropic',name:'Anthropic Claude',kind:'native',endpoint:'https://api.anthropic.com/v1',keyEnv:'ANTHROPIC_API_KEY',modelEnv:'ANTHROPIC_MODEL',workspaceIdEnv:'ANTHROPIC_WORKSPACE_ID',defaultModel:'claude-opus-5',capabilities:['chat','reasoning','code']},
 {id:'meta',name:'Meta / Llama',kind:'openai-compatible',endpoint:'',keyEnv:'META_API_KEY',baseUrlEnv:'META_BASE_URL',modelEnv:'META_MODEL',capabilities:['chat','reasoning','code']},
 {id:'qwen',name:'Alibaba Qwen',kind:'openai-compatible',endpoint:'',keyEnv:'QWEN_API_KEY',baseUrlEnv:'QWEN_BASE_URL',modelEnv:'QWEN_MODEL',capabilities:['chat','reasoning','code']},
 {id:'xai',name:'xAI',kind:'openai-compatible',endpoint:'https://api.x.ai/v1',keyEnv:'XAI_API_KEY',baseUrlEnv:'XAI_BASE_URL',modelEnv:'XAI_MODEL',defaultModel:'grok-4',capabilities:['chat','reasoning','code']},
 {id:'mistral',name:'Mistral AI',kind:'openai-compatible',endpoint:'https://api.mistral.ai/v1',keyEnv:'MISTRAL_API_KEY',baseUrlEnv:'MISTRAL_BASE_URL',modelEnv:'MISTRAL_MODEL',defaultModel:'mistral-large-latest',capabilities:['chat','reasoning','code']},
 {id:'deepseek',name:'DeepSeek',kind:'openai-compatible',endpoint:'https://api.deepseek.com/v1',keyEnv:'DEEPSEEK_API_KEY',baseUrlEnv:'DEEPSEEK_BASE_URL',modelEnv:'DEEPSEEK_MODEL',defaultModel:'deepseek-reasoner',capabilities:['chat','reasoning','code']},
 {id:'groq',name:'Groq',kind:'openai-compatible',endpoint:'https://api.groq.com/openai/v1',keyEnv:'GROQ_API_KEY',baseUrlEnv:'GROQ_BASE_URL',modelEnv:'GROQ_MODEL',defaultModel:'llama-4-scout',capabilities:['chat','reasoning','code']},
 {id:'together',name:'Together AI',kind:'openai-compatible',endpoint:'',keyEnv:'TOGETHER_API_KEY',baseUrlEnv:'TOGETHER_BASE_URL',modelEnv:'TOGETHER_MODEL',capabilities:['chat','reasoning','code']},
 {id:'fireworks',name:'Fireworks AI',kind:'openai-compatible',endpoint:'',keyEnv:'FIREWORKS_API_KEY',baseUrlEnv:'FIREWORKS_BASE_URL',modelEnv:'FIREWORKS_MODEL',capabilities:['chat','reasoning','code']},
 {id:'openrouter',name:'OpenRouter',kind:'router',endpoint:'https://openrouter.ai/api/v1',keyEnv:'OPENROUTER_API_KEY',baseUrlEnv:'OPENROUTER_BASE_URL',modelEnv:'OPENROUTER_MODEL',capabilities:['chat','reasoning','code','multimodal','provider-failover']},
 {id:'huggingface',name:'Hugging Face Inference Providers',kind:'router',endpoint:'https://router.huggingface.co/v1',keyEnv:'HF_TOKEN',baseUrlEnv:'HF_BASE_URL',modelEnv:'HF_MODEL',capabilities:['chat','reasoning','code']},
 {id:'llmsrelay',name:'LLMsRelay',kind:'router',endpoint:'https://api.llmsrelay.com/v1',keyEnv:'LLMSRELAY_API_KEY',baseUrlEnv:'LLMSRELAY_BASE_URL',modelEnv:'LLMSRELAY_MODEL',defaultModel:'claude-sonnet-4.6',capabilities:['chat','reasoning','code','provider-gateway']},
 {id:'nvidia',name:'NVIDIA NIM / Nemotron',kind:'openai-compatible',endpoint:'https://integrate.api.nvidia.com/v1',keyEnv:'NVIDIA_API_KEY',baseUrlEnv:'NVIDIA_BASE_URL',modelEnv:'NVIDIA_MODEL',defaultModel:'nvidia/nemotron-3.5-super-vl-120b-a12b',capabilities:['chat','reasoning','code','agent','tool-calling','long-context']},
 {id:'ollama',name:'Ollama / self-hosted',kind:'self-hosted',endpoint:'http://localhost:11434',keyEnv:'OLLAMA_AUTH_TOKEN',baseUrlEnv:'OLLAMA_BASE_URL',modelEnv:'OLLAMA_MODELS',capabilities:['chat','reasoning','code','self-hosted']}
];
const snapshot = new Map<string, DiscoveredProvider>();
const inferenceVerifiedConfiguration = new Map<string, string>();
const env = (name?:string) => name ? process.env[name]?.trim() || '' : '';
const endpointFor = (d:ProviderDefinition) => env(d.baseUrlEnv) || d.endpoint;

/** Expose endpoint identity without leaking userinfo, query credentials, or fragments. */
function safeEndpointForDiagnostics(endpoint: string): string {
 try {
  const parsed = new URL(endpoint);
  parsed.username = '';
  parsed.password = '';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
 } catch {
  return '[invalid provider endpoint]';
 }
}

/** Scrub configured credentials and common credential-shaped values from provider diagnostics. */
function redactProviderDiagnostic(value: string): string {
 let safe = value;
 for (const definition of definitions) {
  const secret = env(definition.keyEnv);
  if (secret) safe = safe.split(secret).join('[REDACTED]');
 }
 safe = safe
  .replace(/([?&](?:key|api[_-]?key|access[_-]?token|token|secret|password)=)[^&#\s]+/gi, '$1[REDACTED]')
  .replace(/((?:api[_-]?key|access[_-]?token|token|secret|password)\s*[:=]\s*["']?)[^"'&,\s}]+/gi, '$1[REDACTED]')
  .replace(/((?:authorization\s*:\s*bearer\s+|bearer\s+))[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]');
 return safe.slice(0, 300);
}
function providerConfigurationFingerprint(d: ProviderDefinition): string {
 const material = [endpointFor(d), d.keyEnv ? env(d.keyEnv) : '', d.id === 'nvidia' ? env('NVIDIA_AUTHORIZED') : ''].join('\u0000');
 return createHash('sha256').update(material).digest('hex');
}
function classify(status:number, body:string):ProviderAvailability { if(status===401||status===403)return 'auth_failure'; if(status===402||status===400&&/spend|billing|credit|quota/i.test(body))return 'quota_exhausted'; if(status===429)return /quota|credit|exhaust/i.test(body)?'quota_exhausted':'rate_limited'; if(status>=500)return 'unreachable'; return status>=400?'error':'available'; }
function reasonFor(status:number, body:string, availability:ProviderAvailability):string|null { if(availability==='available')return null; if(status===401)return 'invalid_or_expired_api_key'; if(status===403)return 'api_key_forbidden_or_access_denied'; if(status===402||/spend|billing|credit|quota/i.test(body))return 'quota_or_billing_limit'; if(status===429)return /quota|credit|exhaust/i.test(body)?'quota_exhausted':'rate_limited'; if(status>=500)return 'provider_service_error'; return redactProviderDiagnostic(body); }
async function fetchJson(url:string,headers:Record<string,string>,init:RequestInit={}) { const response=await fetch(url,{...init,headers,signal:AbortSignal.timeout(5000)}); const text=await response.text(); let body:any=null; try{body=JSON.parse(text);}catch{} return {response,text,body}; }
async function probe(d:ProviderDefinition):Promise<DiscoveredProvider> {
 const requestEndpoint=endpointFor(d), endpoint=safeEndpointForDiagnostics(requestEndpoint), checked=new Date().toISOString();
 const credentialConfigured=Boolean(d.keyEnv ? env(d.keyEnv) : true);
 const endpointConfigured=Boolean(endpoint);
 const configured=credentialConfigured && endpointConfigured;
 if(!configured)return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:false,authenticated:false,availability:'unconfigured',capabilities:d.capabilities,models:[],latencyMs:null,lastCheckedAt:checked,cooldownUntil:null,reason:!credentialConfigured?'No server-side credential configured.':d.baseUrlEnv?`Provider base URL is missing; configure ${d.baseUrlEnv} before probing.`:'Provider endpoint is missing; configure a provider endpoint before probing.',authorization:'not-configured'};
 const started=Date.now();
 try {
  let result:{response:Response;text:string;body:any};
  if(d.id==='gemini') result=await fetchJson(requestEndpoint+'/models?key='+encodeURIComponent(env(d.keyEnv)),{accept:'application/json'});
  else if(d.id==='anthropic') result=await fetchJson(endpoint+'/models',{accept:'application/json','x-api-key':env(d.keyEnv),'anthropic-version':'2023-06-01',...(env(d.workspaceIdEnv)?{'anthropic-workspace-id':env(d.workspaceIdEnv)}:{})});
  else if(d.id==='ollama') result=await fetchJson(requestEndpoint.replace(/\/$/,'')+'/api/tags',{accept:'application/json',...(env(d.keyEnv)?{authorization:'Bearer '+env(d.keyEnv)}:{})});
  else result=await fetchJson(requestEndpoint.replace(/\/$/,'')+'/models',{accept:'application/json',authorization:'Bearer '+env(d.keyEnv)});
  let availability=classify(result.response.status,result.text);
  const rawModels=Array.isArray(result.body?.data)?result.body.data.map((m:any)=>String(m.id||m.name||'')).filter(Boolean):Array.isArray(result.body?.models)?result.body.models.map((m:any)=>String(m.name||m.model||'')).filter(Boolean):[];
  const models=d.id==='gemini'
    ? rawModels.map((model:string)=>model.replace(/^models\//,''))
    : rawModels;

  // NVIDIA model-list access only proves endpoint reachability, not credential validity
  // for inference. The explicit authorization flag remains separate; the first actual
  // inference is attempted only as part of a separately authorized user request.
  if(d.id==='nvidia') {
   return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:true,authenticated:false,availability,capabilities:d.capabilities,models,latencyMs:Date.now()-started,lastCheckedAt:checked,cooldownUntil:null,reason:availability==='available'?'NVIDIA credential not verified by read-only model discovery; inference verification requires a separately authorized user request.':reasonFor(result.response.status,result.text,availability),authorization:'pending'};
  }
  return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:true,authenticated:result.response.ok,availability,capabilities:d.capabilities,models,latencyMs:Date.now()-started,lastCheckedAt:checked,cooldownUntil:null,reason:reasonFor(result.response.status,result.text,availability),authorization:process.env[(d.id==='huggingface'?'HF':d.id.toUpperCase())+'_AUTHORIZED']==='true'?'configured':'pending'};
 } catch(error) { return {id:d.id,name:d.name,kind:d.kind,endpoint,configured:true,authenticated:false,availability:'unreachable',capabilities:d.capabilities,models:[],latencyMs:Date.now()-started,lastCheckedAt:checked,cooldownUntil:null,reason:redactProviderDiagnostic(error instanceof Error?error.message:String(error)),authorization:'pending'}; }
}
export async function recordProviderInferenceVerification(providerId: string, modelId?: string): Promise<void> {
 if (providerId !== 'nvidia' || env('NVIDIA_AUTHORIZED') !== 'true') return;
 const definition = definitions.find((candidate) => candidate.id === providerId);
 if (!definition) return;
 const current = snapshot.get(providerId) || {
  id: definition.id,
  name: definition.name,
  kind: definition.kind,
  endpoint: safeEndpointForDiagnostics(endpointFor(definition)),
  configured: true,
  authenticated: false,
  availability: 'unreachable' as const,
  capabilities: definition.capabilities,
  models: [],
  latencyMs: null,
  lastCheckedAt: null,
  cooldownUntil: null,
  reason: 'Inference has not yet been verified.',
  authorization: 'pending' as const,
 };
 const verifiedAt = new Date().toISOString();
 inferenceVerifiedConfiguration.set(providerId, providerConfigurationFingerprint(definition));
 const normalizedModel = typeof modelId === 'string' ? modelId.trim() : '';
 const models = normalizedModel
  ? [...new Set([...current.models, normalizedModel])]
  : current.models;
 snapshot.set(providerId, {
  ...current,
  configured: true,
  authenticated: true,
  availability: 'available',
  authorization: 'configured',
  models,
  reason: null,
  lastCheckedAt: verifiedAt,
 });

 // Keep the persistent connection registry consistent with the successful,
 // explicitly authorized NVIDIA inference evidence. Registry write failures
 // must not erase or misreport the successful provider response.
 if (!process.env.DATABASE_URL) return;
 try {
  const connectionId = 'provider-nvidia';
  await registerConnection({
   id: connectionId,
   provider: providerId,
   displayName: definition.name,
   authType: 'api_key',
   status: 'authorized',
   scopes: definition.capabilities,
   risk: 'high',
   accountRef: null,
   expiresAt: null,
   lastVerifiedAt: verifiedAt,
   requiresHumanApproval: true,
   metadata: {
    registryType: 'global-provider',
    kind: definition.kind,
    endpoint: safeEndpointForDiagnostics(endpointFor(definition)),
    availability: 'available',
    models,
    lastInferenceModel: normalizedModel || null,
    inferenceVerified: true,
    authorization: 'configured',
   },
  });
  await recordConnectionEvent(connectionId, 'provider_inference_verified', 'provider-registry', {
   modelId: normalizedModel || null,
   verifiedAt,
   evidence: 'successful inference response after explicit NVIDIA_AUTHORIZED=true configuration',
  });
 } catch (error) {
  console.warn('[ProviderDiscovery] Could not persist NVIDIA inference verification to the connection registry:', error instanceof Error ? error.message : String(error));
 }
}
export function getGlobalProviderDiscoverySnapshot():DiscoveredProvider[] {
 return definitions.map(d=>{
  const endpoint=safeEndpointForDiagnostics(endpointFor(d));
  const configured=Boolean((d.keyEnv?env(d.keyEnv):true)&&endpointFor(d));
  return snapshot.get(d.id)||{id:d.id,name:d.name,kind:d.kind,endpoint,configured,authenticated:false,availability:configured?'unreachable':'unconfigured',capabilities:d.capabilities,models:[],latencyMs:null,lastCheckedAt:null,cooldownUntil:null,reason:'Not probed yet.',authorization:configured?'pending':'not-configured'};
 });
}
export function getEligibleGlobalProviders(capability?:string) { return getGlobalProviderDiscoverySnapshot().filter(p=>p.configured&&p.authenticated&&p.availability==='available'&&(!capability||p.capabilities.includes(capability))); }
export async function discoverGlobalProviders(
  actor = 'provider-discovery',
  options: { persistConnections?: boolean } = {},
) {
  const results = await Promise.all(definitions.map(probe));
  for (const discoveredProvider of results) {
    const definition = definitions.find((candidate) => candidate.id === discoveredProvider.id);
    const previous = snapshot.get(discoveredProvider.id);
    const sameVerifiedNvidiaConfiguration = discoveredProvider.id === 'nvidia' &&
      Boolean(definition) &&
      previous?.authenticated === true &&
      previous.authorization === 'configured' &&
      discoveredProvider.availability !== 'auth_failure' &&
      inferenceVerifiedConfiguration.get(discoveredProvider.id) === providerConfigurationFingerprint(definition!);
    const provider: DiscoveredProvider = sameVerifiedNvidiaConfiguration && previous
      ? {
          ...discoveredProvider,
          authenticated: true,
          authorization: 'configured',
          models: [...new Set([...discoveredProvider.models, ...previous.models])],
          reason: discoveredProvider.availability === 'available' ? null : discoveredProvider.reason,
        }
      : discoveredProvider;
    snapshot.set(provider.id, provider);
    if (options.persistConnections === false) continue;
    const connectionId = 'provider-' + provider.id;
    await registerConnection({
      id: connectionId,
      provider: provider.id,
      displayName: provider.name,
      authType: 'api_key',
      status: provider.configured && provider.authenticated && provider.authorization === 'configured' ? 'authorized' : 'discovered',
      scopes: provider.capabilities,
      risk: provider.id === 'ollama' ? 'medium' : 'high',
      accountRef: null,
      expiresAt: null,
      lastVerifiedAt: provider.lastCheckedAt,
      requiresHumanApproval: true,
      metadata: { registryType: 'global-provider', kind: provider.kind, endpoint: provider.endpoint, availability: provider.availability, models: provider.models, latencyMs: provider.latencyMs, reason: provider.reason, authorization: provider.authorization },
    });
    await recordConnectionEvent(connectionId, 'provider_discovery_probe', actor, {
      availability: provider.availability, authenticated: provider.authenticated, latencyMs: provider.latencyMs, models: provider.models,
    });
  }
  return results;
}
export function getGlobalProviderDiscoveryPolicy(){ return {architecture:'GLOBAL_PROVIDER_DISCOVERY_FAILOVER_FABRIC',authenticatedRegistrationRequired:true,authorizationSeparateFromAuthentication:true,nvidiaInferenceVerificationRequired:true,noSyntheticSuccess:true,quotaExhaustionIsNotHidden:true,internetDiscoveryBoundary:'documented/configured provider endpoints only; no quota, authentication, paywall, regional or access-control bypass',fallbackOrder:['configured-provider','router-provider','self-hosted-compute'],truthStates:['available','unconfigured','quota_exhausted','rate_limited','auth_failure','capability_mismatch','unreachable','error']} as const; }