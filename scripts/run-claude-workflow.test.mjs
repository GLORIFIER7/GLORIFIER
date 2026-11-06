import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, chmod } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildClaudeArgs,
  buildPrompt,
  classifyClaudeOutput,
  runClaude,
} from './run-claude-workflow.mjs';

test('places the supplied task inside an explicitly untrusted prompt boundary', () => {
  const prompt = buildPrompt('inspect the worker');
  assert.ok(prompt.indexOf('Repository-owner task instructions:') < prompt.indexOf('BEGIN UNTRUSTED TASK TEXT'));
  assert.match(prompt, /BEGIN UNTRUSTED TASK TEXT\ninspect the worker\nEND UNTRUSTED TASK TEXT/);
  assert.match(prompt, /never merge anything\./);
});

test('builds a bounded CLI command without permission bypass flags', () => {
  const args = buildClaudeArgs('test prompt');
  assert.equal(args[0], '-p');
  assert.equal(args[1], 'test prompt');
  assert.ok(args.includes('--permission-mode'));
  assert.ok(args.includes('acceptEdits'));
  assert.ok(args.includes('Bash(npm run lint)'));
  assert.ok(args.includes('Bash(npm run build)'));
  assert.ok(!args.includes('--dangerously-skip-permissions'));
});

test('accepts a successful Claude JSON result', () => {
  assert.deepEqual(classifyClaudeOutput(JSON.stringify({ is_error: false, result: 'done' })), {
    ok: true,
    code: 'success',
  });
});

test('classifies provider failures without returning their raw message', () => {
  const raw = JSON.stringify({
    is_error: true,
    api_error_status: 400,
    error: 'Credit balance is too low; private diagnostic detail',
  });
  const result = classifyClaudeOutput(raw);
  assert.deepEqual(result, { ok: false, code: 'provider_rejected_request' });
  assert.ok(!JSON.stringify(result).includes('private diagnostic detail'));
});

test('classifies auth, rate-limit, server and malformed responses', () => {
  assert.equal(classifyClaudeOutput(JSON.stringify({ is_error: true, api_error_status: 401 })).code, 'authentication_or_access_error');
  assert.equal(classifyClaudeOutput(JSON.stringify({ is_error: true, api_error_status: 429 })).code, 'provider_rate_limited');
  assert.equal(classifyClaudeOutput(JSON.stringify({ is_error: true, api_error_status: 503 })).code, 'provider_unavailable');
  assert.equal(classifyClaudeOutput('{broken').code, 'invalid_json');
  assert.equal(classifyClaudeOutput('').code, 'empty_output');
  assert.equal(classifyClaudeOutput(JSON.stringify({ subtype: 'success' })).code, 'incomplete_result');
});

test('runs the provided wrapper and keeps its prompt and arguments isolated', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'glorifier-claude-ok-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const wrapper = path.join(dir, 'fake-claude.mjs');
  const argsFile = path.join(dir, 'args.json');
  const promptFile = path.join(dir, 'prompt.txt');
  await writeFile(wrapper, [
    '#!/usr/bin/env node',
    "import { writeFileSync } from 'node:fs';",
    'writeFileSync(process.env.ARGS_FILE, JSON.stringify(process.argv.slice(2)));',
    'writeFileSync(process.env.PROMPT_FILE, process.argv[3]);',
    "process.stdout.write(JSON.stringify({ is_error#¢fÇ6RÂ&W7VÇC¢vFöæRrÒ’“²"À¢rrÀ¢Òæ¦ö–â‚uÆâr’“°¢v—B6†ÖöB‡w&W"Âós“° ¢6öç7B&W7VÇBÒ'Vä6ÆVFR‡°¢F6µFW‡C¢v–ç7V7BF†Rv÷&¶W"rÀ¢w&W"À¢Vçc¢²ââç&ö6W72æVçbÂåD…$õ”5ô•ô´U“¢wFW7BÖöæÇ’rÂ$u5ôd”ÄS¢&w4f–ÆRÂ$ôÕEôd”ÄS¢&ö×Df–ÆRÒÀ¢Ò“° ¢76W'BæFVWWVÂ‡&W7VÇBÂ²W†—D6öFS¢Â6öFS¢w7V66W72rÒ“°¢6öç7B&w2Ò¥4ôâç'6R†v—B&VDf–ÆR†&w4f–ÆRÂwWFc‚r’“°¢6öç7B&ö×BÒv—B&VDf–ÆR‡&ö×Df–ÆRÂwWFc‚r“°¢76W'BæWVÂ†&w5³ÒÂr×r“°¢76W'BæWVÂ†&w5³ÒÂ&ö×B“°¢76W'Bæö²†&w2æ–æ6ÇVFW2‚rÒÖ÷WGWBÖf÷&ÖBr’“°¢76W'Bæö²†&w2æ–æ6ÇVFW2‚v§6öâr’“°¢76W'Bæö²†&w2æ–æ6ÇVFW2‚rÒÖÆÆ÷vVEFööÇ2r’“°¢76W'BæÖF6‚‡&ö×BÂô$Tt”âTåE%U5DTBD4²DU…EÆæ–ç7V7BF†Rv÷&¶W%ÆäTäBTåE%U5DTBD4²DU…Bò“°§Ò“° §FW7B‚vf–Ç26Æ÷6VBöâ&÷f–FW"W'&÷'2æBæWfW"&WGW&ç26Vç6—F—fR4Ä’÷WGWBrÂ7–æ2‡B’Óâ°¢6öç7BF—"Òv—BÖ¶GFV×‡F‚æ¦ö–â†÷2çF×F—"‚’ÂvvÆ÷&–f–W"Ö6ÆVFRÖÆW'&÷"Òr’“°¢BægFW"‚‚’Óâ&Ò†F—"Â²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ’“°¢6öç7Bw&W"ÒF‚æ¦ö–â†F—"Âvf¶RÖ6ÆVFRæÖ§2r“°¢v—Bw&—FTf–ÆR‡w&W"Â°¢r2÷W7"ö&–âöVçbæöFRrÀ¢'&ö6W72ç7FF÷WBçw&—FR„¥4ôâç7G&–æv–g’‡²—5öW'&÷#¢G'VRÂ•öW'&÷%÷7FGW3¢CÂW'&÷#¢w&—fFRW'&÷"FW‡BrÒ’“²"À¢'&ö6W72ç7FFW'"çw&—FR‚w&—fFR7FFW'"FW‡Br“²"À¢rrÀ¢Òæ¦ö–â‚uÆâr’“°¢v—B6†ÖöB‡w&W"Âós“° ¢6öç7B&W7VÇBÒ'Vä6ÆVFR‡°¢F6µFW‡C¢v–ç7V7BF†Rv÷&¶W"rÀ¢w&W"À¢Vçc¢²ââç&ö6W72æVçbÂåD…$õ”5ô•ô´U“¢wFW7BÖöæÇ’rÒÀ¢Ò“°¢76W'BæFVWWVÂ‡&W7VÇBÂ²W†—D6öFS¢Â6öFS¢w&÷f–FW%÷&V¦V7FVE÷&WVW7BrÒ“°¢76W'Bæö²‚¥4ôâç7G&–æv–g’‡&W7VÇB’æ–æ6ÇVFW2‚w&—fFRr’“°§Ò“°  §FW7B‚w76W2F†RÆÆ÷vVBFööÇ22F†RFö7VÖVçFVB76R×6W&FVB4Ä’Æ—7BrÂ‚’Óâ°¢6öç7B&w2Ò'V–ÆD6ÆVFT&w2‚wFW7B&ö×Br“°¢6öç7BÆÆ÷vVEFööÇ4–æFW‚Ò&w2æ–æFW„öb‚rÒÖÆÆ÷vVEFööÇ2r“°¢76W'BæFVWWVÂ†&w2ç6Æ–6R†ÆÆ÷vVEFööÇ4–æFW‚²’Â°¢u&VBrÀ¢tvÆö"rÀ¢tw&WrÀ¢tVF—BrÀ¢uw&—FRrÀ¢t&6‚†çÒ'VâÆ–çB’rÀ¢t&6‚†çÒ'Vâ'V–ÆB’rÀ¢t&6‚†çÒ'VâFW7C¦&6†—FV7GW&R’rÀ¢t&6‚†v—B7FGW2’rÀ¢t&6‚†v—BF–fb’rÀ¢Ò“°§Ò“° §FW7B‚w&WGW&ç2&÷VæFVBF–ÖV÷WB&W7VÇBv†VâF†R6ÆVFR4Ä’FöW2æ÷BW†—BrÂ7–æ2‡B’Óâ°¢6öç7BF—"Òv—BÖ¶GFV×‡F‚æ¦ö–â†÷2çF×F—"‚’ÂvvÆ÷&–f–W"Ö6ÆVFR×F–ÖV÷WBÒr’“°¢BægFW"‚‚’Óâ&Ò†F—"Â²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ’“°¢6öç7Bw&W"ÒF‚æ¦ö–â†F—"Âw6Æ÷rÖ6ÆVFRæÖ§2r“°¢v—Bw&—FTf–ÆR‡w&W"Â°¢r2÷W7"ö&–âöVçbæöFRrÀ¢'6WEF–ÖV÷WB‚‚’Óâ&ö6W72ç7FF÷WBçw&—FR„¥4ôâç7G&–æv–g’‡²—5öW'&÷#¢fÇ6RÂ&W7VÇC¢vÆFRrÒ’’ÂS“²"À¢rrÀ¢Òæ¦ö–â‚uÆâr’“°¢v—B6†ÖöB‡w&W"Âós“° ¢6öç7B&W7VÇBÒ'Vä6ÆVFR‡°¢F6µFW‡C¢v–ç7V7BF†Rv÷&¶W"rÀ¢w&W"À¢F–ÖV÷WD×3¢SÀ¢Vçc¢²ââç&ö6W72æVçbÂåD…$õ”5ô•ô´U“¢wFW7BÖöæÇ’rÒÀ¢Ò“° ¢76W'BæFVWWVÂ‡&W7VÇBÂ²W†—D6öFS¢Â6öFS¢v6Æ•÷F–ÖV÷WBrÒ“°§Ò“°  §FW7B‚v6Æ76–f–W26–væÂ×FW&Ö–æFVB4Ä’&ö6W72W‡Æ–6—FÇ’rÂ7–æ2‡B’Óâ°¢6öç7BF—"Òv—BÖ¶GFV×‡F‚æ¦ö–â†÷2çF×F—"‚’ÂvvÆ÷&–f–W"Ö6ÆVFR×6–væÂÒr’“°¢BægFW"‚‚’Óâ&Ò†F—"Â²&V7W'6—fS¢G'VRÂf÷&6S¢G'VRÒ’“°¢6öç7Bw&W"ÒF‚æ¦ö–â†F—"Âw6–væÂÖ6ÆVFRæÖ§2r“°¢v—Bw&—FTf–ÆR‡w&W"Â°¢r2÷W7"ö&–âöVçbæöFRrÀ¢'&ö6W72æ¶–ÆÂ‡&ö6W72ç–BÂu4”uDU$Òr“²"À¢rrÀ¢Òæ¦ö–â‚uÆâr’“°¢v—B6†ÖöB‡w&W"Âós“° ¢6öç7B&W7VÇBÒ'Vä6ÆVFR‡°¢F6µFW‡C¢v–ç7V7BF†Rv÷&¶W"rÀ¢w&W"À¢Vçc¢²ââç&ö6W72æVçbÂåD…$õ”5ô•ô´U“¢wFW7BÖöæÇ’rÒÀ¢Ò“° ¢76W'BæFVWWVÂ‡&W7VÇBÂ²W†—D6öFS¢Â6öFS¢v6Æ•÷FW&Ö–æFVEö'•÷6–væÂrÒ“°§Ò“° §FW7B‚w&V¦V7G2Ö—76–ærF6²Âw&W"÷"7&VFVçF–Â&Vf÷&RÆVæ6†–ærF†R4Ä’rÂ‚’Óâ°¢76W'BæWVÂ‡'Vä6ÆVFR‡²F6µFW‡C¢rrÂw&W#¢rö&–â÷G'VRrÂVçc¢²åD…$õ”5ô•ô´U“¢w‚rÒÒ’æ6öFRÂvÖ—76–æu÷F6²r“°¢76W'BæWVÂ‡'Vä6ÆVFR‡²F6µFW‡C¢w‚rÂw&W#¢rrÂVçc¢²åD…$õ”5ô•ô´U“¢w‚rÒÒ’æ6öFRÂvÖ—76–æuö6Æ•÷w&W"r“°¢76W'BæWVÂ‡'Vä6ÆVFR‡²F6µFW‡C¢w‚rÂw&W#¢rö&–â÷G'VRrÂVçc¢·ÒÒ’æ6öFRÂvÖ—76–æuö•ö¶W’r“°§Ò“°