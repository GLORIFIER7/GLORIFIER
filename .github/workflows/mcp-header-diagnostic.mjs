import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '2026-07-28';
const PUBLIC_ENDPOINT = 'https://glorifier.pages.dev/mcp';
const TOOL = 'github_get_repository';
const cases = [
  { name: 'mismatched-method', method: 'tools/list', headers: {'Mcp-Method':'prompts/list'} },
  { name: 'missing-method', method: 'tools/list', headers: {} },
  { name: 'mismatched-name', method: 'tools/call', headers: {'Mcp-Method':'tools/call','Mcp-Name':'wrong_tool_name'} },
  { name: 'missing-name', method: 'tools/call', headers: {'Mcp-Method':'tools/call'} },
  { name: 'case-mismatched-method', method: 'tools/list', headers: {'Mcp-Method':'TOOLS/LIST'} },
];

// Independent, read-only diagnostic, not an official conformance score.
// Deliberately restricted to the canonical public Pages endpoint. All five
// requests must be rejected before any tool execution or upstream quota use.
export async function runHeaderDiagnostic({ endpoint, fetchImpl = globalThis.fetch }) {
  if (endpoint !== PUBLIC_ENDPOINT) throw new Error('Diagnostic requires the exact canonical HTTPS MCP endpoint.');
  const results = [];
  for (const [index, scenario] of cases.entries()) {
    const id = index + 1;
    const params = {
      ...(scenario.method === 'tools/call' ? {name:TOOL,arguments:{}} : {}),
      _meta: {
        'io.modelcontextprotocol/protocolVersion': VERSION,
        'io.modelcontextprotocol/clientCapabilities': {},
        'io.modelcontextprotocol/clientInfo': {name:'GLORIFIER header diagnostic',version:'1.0.0'},
      },
    };
    let status = null, code = null, passed = false;
    try {
      const response = await fetchImpl(endpoint, {
        method:'POST', redirect:'manual', signal:AbortSignal.timeout(15_000),
        headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',Origin:new URL(endpoint).origin,'MCP-Protocol-Version':VERSION,...scenario.headers},
        body:JSON.stringify({jsonrpc:'2.0',id,method:scenario.method,params}),
      });
      status=response.status;
      if (status===400 && response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()==='application/json') {
        const body=await response.json();
        code=body?.error?.code ?? null;
        passed=body?.jsonrpc==='2.0' && body.id===id && code===-32020 && !Object.hasOwn(body,'result');
      } else await response.body?.cancel();
    } catch { /* Report a failed probe; never log raw response or credentials. */ }
    results.push({name:scenario.name,status,code,passed});
  }
  const passed=results.filter(result=>result.passed).length;
  return {endpoint,protocolVersion:VERSION,classification:'INDEPENDENT_HTTPS_HEADER_DIAGNOSTIC_NOT_OFFICIAL_CONFORMANCE',passed,failed:results.length-passed,results};
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const report=await runHeaderDiagnostic({endpoint:process.env.GLORIFIER_MCP_CONFORMANCE_URL});
    process.stdout.write(`${JSON.stringify(report,null,2)}\n`);
    if (report.failed) process.exitCode=1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode=1;
  }
}
