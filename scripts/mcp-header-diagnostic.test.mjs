import test from 'node:test';
import assert from 'node:assert/strict';
import { runHeaderDiagnostic } from './mcp-header-diagnostic.mjs';

test('checks all five malformed routing headers with HTTPS and no redirect', async () => {
  const seen = [];
  const report = await runHeaderDiagnostic({ endpoint: 'https://glorifier.pages.dev/mcp', fetchImpl: async (url, init) => {
    seen.push({url, ...init});
    const request = JSON.parse(init.body);
    return Response.json({jsonrpc:'2.0', id:request.id, error:{code:-32020,message:'Header mismatch'}},{status:400});
  }});
  assert.equal(report.passed,5);
  assert.equal(seen.length,5);
  assert.ok(seen.every(r=>r.redirect==='manual' && r.url==='https://glorifier.pages.dev/mcp'));
  assert.equal(seen[1].headers['Mcp-Method'],undefined);
  assert.equal(seen[3].headers['Mcp-Name'],undefined);
});
test('reports redirects and incorrect JSON-RPC errors as failures', async () => {
  let count=0;
  const report=await runHeaderDiagnostic({endpoint:'https://glorifier.pages.dev/mcp',fetchImpl:async(url,init)=>{
    const id=JSON.parse(init.body).id;
    return ++count===1?new Response(null,{status:301}):Response.json({jsonrpc:'2.0',id,error:{code:-32601}},{status:400});
  }});
  assert.equal(report.passed,0);
  assert.equal(report.failed,5);
});
test('rejects non HTTPS targets before calling fetch',async()=>{
  await assert.rejects(runHeaderDiagnostic({endpoint:'http://glorifier.pages.dev/mcp',fetchImpl:()=>{throw Error('must not fetch')}}),/HTTPS/);
});
