import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CANONICAL_ORIGIN,
  GlorifierApiError,
  GlorifierNeuralClient,
  MAX_RESPONSE_BODY_BYTES,
} from '../index.mjs';

const fixtureUrl = new URL('../../../docs/architecture/interoperability-contract-fixtures.json', import.meta.url);
const sharedFixtures = JSON.parse(await readFile(fixtureUrl, 'utf8'));

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function client(fetchImpl, options = {}) {
  return new GlorifierNeuralClient({ fetchImpl, ...options });
}

test('accepts the canonical HTTPS origin and rejects unlisted or non-origin URLs', () => {
  assert.doesNotThrow(() => new GlorifierNeuralClient());
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'http://glorifier.example.com' }), /HTTPS/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://user:pass@example.com' }), /origin/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://example.com/api' }), /origin/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://example.com?token=x' }), /origin/);
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'https://example.com' }), /exact origin/);
  assert.doesNothrow(() => new GlorifierNeuralClient({
    baseUrl: 'https://staging.example.com', allowedOrigins: ['https://staging.example.com'],
  }));
});

test('allows HTTP only for explicitly enabled loopback development', () => {
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'http://127.0.0.1:8787' }), /HTTPS/);
  assert.doesNotThrow(() => new GlorifierNeuralClient({ baseUrl: 'http://127.0.0.1:8787', allowLoopbackHttp: true, }));
  assert.throws(() => new GlorifierNeuralClient({ baseUrl: 'http://192.168.1.8:8787', allowLoopbackHttp: true, }), /HTTPS/);
});

test('sends bearer credentials only to task submissions and never follows redirects', async () => {
  const calls = [];
  const sdk = client(async (url, init) => {
    calls.push({ url, init });
    return jsonResponse({ status: 'ok' }, 200, { 'X-Correlation-ID': 'corr-123' });
  }, { token: 'caller-token' });

  await sdk.health();
  await sdk.ready();
  await sdk.submitTask({ task: 'Check contract' });

  assert.equal(calls.length, 3);
  assert.equal(calls[0].init.headers.get('Authorization'), null);
  assert.equal(calls[1].init.headers.get('Authorization'), null);
  assert.equal(calls[2].init.headers.get('Authorization'), 'Bearer caller-token');
  assert.equal(calls[2].init.redirect, 'manual');
  assert.equal(calls[2].url, `${CANONICAL_ORIGIN}/api/neural/v1/tasks`);
  assert.equal(calls[2].init.headers.get('Content-Type'), 'application/json; charset=utf-8');
  assert.equal(calls[2].init.headers.get('Accept'), 'application/json');
});

test('returns readiness HTTP 503 as an unsuccessful readiness observation', async () => {
  const sdk = client(async () => jsonResponse({ status: 'not_ready', code: 'PROVIDER_NOT_READY' }, 503));
  const response = await sdk.ready();
  assert.equal(response.status, 503);
  assert.equal(response.ok, false);
  assert.equal(response.body.code, 'PROVIDER_NOT_READY');
});

test('executes the canonical shared cross-language wire fixtures', async () => {
  const byId = new Map(sharedFixtures.cases.map(item => [item.id, item]));
  assert.deepEqual([...byId.keys()].sort(), [
    'large-quantity-string',
    'nested-collections',
    'null-versus-absent',
    'stable-error-envelope',
    'unicode-round-trip',
  ]);

  let sent;
  const sdk = client(async (_url, init) => {
    sent = JSON.parse(new TextDecoder().decode(init.body));
    return jsonResponse({ accepted: true });
  }, { token: 'token' });
  const unicode = byId.get('unicode-round-trip').payload;
  await sdk.submitTask({ task: unicode.message, purpose: 'general', require_approval: true, action_class: 'read_only' });
  assert.equal(sent.task, unicode.message);
  assert.equal(sent.require_approval, true);

  const quantity = byId.get('large-quantity-string').payload.quantity;
  assert.equal(typeof quantity, 'string');
  assert.equal(JSON.parse(JSON.stringify({ quantity })).quantity, quantity);

  const nullCase = byId.get('null-versus-absent');
  assert.equal(Object.hasOwn(nullCase.payload, 'presentNull'), true);
  assert.equal(nullCase.payload.presentNull, null);
  for (const absentField of nullCase.absentFields) {
    assert.equal(Object.hasOwn(nullCase.payload, absentField), false);
  }

  const nested = JSON.parse(JSON.stringify(byId.get('nested-collections').payload));
  assert.equal(nested.items[0].enabled, true);
  assert.equal(nested.items[0].count, 0);
  assert.equal(nested.items[1].enabled, false);
  assert.equal(nested.metadata.tags[1], 'language-neutral');

  const stableError = byId.get('stable-error-envelope').payload;
  assert.equal(stableError.code, 'REQUEST_BODY_TOO_LARG’r“°¢76W'BæWVÂ‡7F&ÆTW'&÷"æö²ÂfÇ6R“°§Ò“° §FW7B‚w&V¦V7G2–çfÆ–BF6²f–VÆG2ÂG—W2æBVæ–6öFR6†&7FW"Æ–Ö—G2rÂ‚’Óâ°¢6öç7B6F²Ò6Æ–VçB†7–æ2‚’Óâ§6öå&W7öç6R‡²66WFVC¢G'VRÒ’Â²Fö¶Vã¢wFö¶VârÒ“°¢76W'BçF‡&÷w2‚‚’Óâ6F²ç7V&Ö—EF6²‡²F6³¢rrÒ’ÂöæöâÖV×G’ò“°¢76W'BçF‡&÷w2‚‚’Óâ6F²ç7V&Ö—EF6²‡²F6³¢wfÆ–BrÂW‡G&¢G'VRÒ’Â÷Vç7W÷'FVBf–VÆBò“°¢76W'BçF‡&÷w2‚‚’Óâ6F²ç7V&Ö—EF6²‡²F6³¢wfÆ–BrÂ&WV—&Uö&÷fÃ¢w–W2rÒ’Âö&ööÆVâò“°¢76W'BçF‡&÷w2‚‚’Óâ6F²ç7V&Ö—EF6²‡²F6³¢	ùˆrç&WVBƒ#ó’Ò’Âó#Ãóò“°¢76W'BçF‡&÷w2‚‚’Óâ6F²ç7V&Ö—EF6²‡²F6³¢wfÆ–BrÂW'÷6S¢rrÒ’Â÷W'÷6Rò“°§Ò“° §FW7B‚vVæf÷&6W2F†RUDbÓ‚&WVW7BÖ&öG’6—¦R–æFWVæFVçFÇ’öb6†&7FW"6÷VçBrÂ‚’Óâ°¢6öç7B6F²Ò6Æ–VçB†7–æ2‚’Óâ§6öå&W7öç6R‡²66WFVC¢G'VRÒ’Â²Fö¶Vã¢wFö¶VârÒ“°¢76W'BçF‡&÷w2‚‚’Óâ6F²ç7V&Ö—EF6²‡²F6³¢	øÉrç&WVBƒ…ó’Ò’ÂócRÃóS3bÖ'—FRò“°§Ò“° §FW7B‚w&WV—&W2&V&W"Fö¶Vâf÷"F6²7V&Ö—76–öç2æBfÆ–FFW2&rFö¶Vâ6†RrÂ‚’Óâ°¢6öç7Bv—F†÷WAQ½­•¸€ô±¥•¹Ğ¡…Íå¹Œ€ ¤€ôø©Í½¹I•ÍÁ½¹Í”¡ì…•ÁÑ•èÑÉÕ”ô¤¤ì(€…ÍÍ•ÉĞ¹Ñ¡É½İÌ  ¤€ôøİ¥Ñ¡½ÕÑQ½­•¸¹ÍÕ‰µ¥ÑQ…Í¬¡ìÑ…Í¬è€É•…œô¤°€½Ñ½­•¸¥ÌÉ•ÅÕ¥É•¼¤ì(€…ÍÍ•ÉĞ¹Ñ¡É½İÌ  ¤€ôø¹•Ü±½É¥™¥•É9•ÕÉ…±±¥•¹Ğ¡ìÑ½­•¸è€Ñ½­•¸İ¥Ñ ÍÁ…•Ìœô¤°€½İ¥Ñ¡½ÕĞİ¡¥Ñ•ÍÁ…”¼¤ì)ô¤ì()Ñ•ÍĞ •¹™½É•ÌÑ¡”É•ÍÁ½¹Í”‰åÑ”±¥µ¥Ğ…¹É•©•ÑÌ¹½¸µ½‰©•Ğ)M=8œ°…Íå¹Œ€ ¤€ôøì(€½¹ÍĞÑ½½1…É”€ô¹•ÜI•ÍÁ½¹Í”¡¹•ÜU¥¹ĞáÉÉ…ä¡5a}IMA=9M}	=e}	eQL€¬€Ä¤°ìÍÑ…ÑÕÌè€ÈÀÀô¤ì(€½¹ÍĞÍ‘¬€ô±¥•¹Ğ¡…Íå¹Œ€ ¤€ôøÑ½½1…É”¤ì(€…İ…¥Ğ…ÍÍ•ÉĞ¹É•©•ÑÌ¡Í‘¬¹¡•…±Ñ  ¤°±½É¥™¥•ÉÁ¥ÉÉ½È¤ì((€½¹ÍĞ¥¹Ù…±¥€ô±¥•¹Ğ¡…Íå¹Œ€ ¤€ôø¹•ÜI•ÍÁ½¹Í” mtœ°ìÍÑ…ÑÕÌè€ÈÀÀô¤¤ì(€…İ…¥Ğ…ÍÍ•ÉĞ¹É•©•ÑÌ¡¥¹Ù…±¥¹¡•…±Ñ  ¤°€½µÕÍĞ‰”„)M=8½‰©•Ğ¼¤ì)ô¤ì()Ñ•ÍĞ •¹™½É•Ì„‰½Õ¹‘•É•ÅÕ•ÍĞÑ¥µ•½ÕĞİ¥Ñ¡½ÕĞ±•…­¥¹œÑ¡”Õ¹‘•É±å¥¹œ•ÉÉ½Èœ°…Íå¹Œ€ ¤€ôøì(€½¹ÍĞÍ‘¬€ô±¥•¹Ğ ¡}ÕÉ°°¥¹¥Ğ¤€ôø¹•ÜAÉ½µ¥Í” ¡}É•Í½±Ù”°É•©•Ğ¤€ôøì(€€€¥¹¥Ğ¹Í¥¹…°¹…‘‘Ù•¹Ñ1¥ÍÑ•¹•È …‰½ÉĞœ°€ ¤€ôøÉ•©•Ğ¡¹•ÜÉÉ½È ÑÉ…¹ÍÁ½ÉĞ‘•Ñ…¥±Ìœ¤¤°ì½¹”èÑÉÕ”ô¤ì(€ô¤°ìÑ¥µ•½ÕÑ5Ìè€Ôô¤ì(€…İ…¥Ğ…ÍÍ•ÉĞ¹É•©•ÑÌ¡Í‘¬¹¡•…±Ñ  ¤°€½Ñ¥µ•½ÕĞ¼¤ì)ô¤ì()Ñ•ÍĞ ÁÉ½Á……Ñ•Ì…±±•È½ÉÉ•±…Ñ¥½¸%Ìİ¥Ñ¡½ÕĞÁ±…¥¹œÉ•‘•¹Ñ¥…±Ì¥¸ÁÉ½‰”¡•…‘•ÉÌœ°…Íå¹Œ€ ¤€ôøì(€±•ĞÍ••¸ì(€½¹ÍĞÍ‘¬€ô±¥•¹Ğ¡…Íå¹Œ€¡}ÕÉ°°¥¹¥Ğ¤€ôøì(€€€Í••¸€ô¥¹¥Ğ¹¡•…‘•ÉÌ¹•Ğ `µ½ÉÉ•±…Ñ¥½¸µ%œ¤ì(€€€É•ÑÕÉ¸©Í½¹I•ÍÁ½¹Í”¡ìÍÑ…ÑÕÌè€½¬œô¤ì(€ô°ìÑ½­•¸è€Ñ½­•¸œô¤ì(€…İ…¥ĞÍ‘¬¹¡•…±Ñ ¡ì½ÉÉ•±…Ñ¥½¹%è€É•ÅÕ•ÍĞµ½ÉÉ•±…Ñ¥½¸´Äœô¤ì(€…ÍÍ•ÉĞ¹•ÅÕ…°¡Í••¸°€É•ÅÕ•ÍĞµ½ÉÉ•±…Ñ¥½¸´Äœ¤ì)ô¤ì(