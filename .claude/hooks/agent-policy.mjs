import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROTECTED_PATHS = [
  /(^|\/)\.github\/workflows(?:\/|$)/i,
  /(^|\/)\.env(?:\.[^/]*)?$/i,
  /(^|\/)\.dev\.vars$/i,
  /(^|\/)wrangler\.(?:jsonc?|toml)$/i,
  /(^|\/)(?:database|db|supabase)\/(?:.*\/)?migrations?(?:\/|$)/i,
  /(^|\/)services\/neural\/db\/(?:.*\/)?migrations?(?:\/|$)/i,
  /(^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|uv\.lock|Cargo\.lock|Gemfile\.lock)$/i,
  /(^|\/).*(?:credential|private[-_]?key|service[-_]?account)(?:\.[^/]*)?$/i,
  /\.(?:pem|key|p12|pfx)$/i,
];

const BLOCKED_COMMANDS = [
  { pattern: /\bgit\s+(?:-[^\s]+\s+)*push\b[^\n;&|]*--force(?:-with-lease)?\b/i, reason: 'Force-push is prohibited because it can overwrite remote branch history.' },
  { pattern: /\bgit\s+(?:-[^\s]+\s+)*reset\b[^\n;&|]*--hard\b/i, reason: 'Hard reset is prohibited because it can discard work.' },
  { pattern: /\bgit\s+(?:-[^\s]+\s+)*clean\b[^\n;&|]*(?:--force|(?:^|\s)-[a-z]*f[a-z]*)/i, reason: 'Forced git clean is prohibited because it can delete untracked work.' },
  { pattern: /\bgh\s+pr\s+merge\b/i, reason: 'Pull-request merging remains a human-controlled action.' },
  { pattern: /\bgh\s+(?:secret|variable)\s+(?:set|delete|remove)\b/i, reason: 'Repository secret and variable changes require owner administration.' },
  { pattern: /\b(?:wrangler|npx\s+wrangler)\s+deploy\b/i, reason: 'Production or preview deployment must use the reviewed release workflow.' },
  { pattern: /\b(?:npm\s+publish|pnpm\s+publish|yarn\s+publish)\b/i, reason: 'Package publication is outside autonomous coding authority.' },
  { pattern: /\bterraform\s+(?:apply|destroy)\b/i, reason: 'Infrastructure mutation is outside autonomous coding authority.' },
  { pattern: /\b(?:railway\s+up|fly\s+deploy|docker\s+push)\b/i, reason: 'Infrastructure deployment and image publication require a separate release approval.' },
];

function deny(reason) {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

function normalizeTarget(rawPath, cwd) {
  if (typeof rawPath !== 'string' || rawPath.trim() === '' || rawPath.includes('\0')) {
    return { error: 'A valid target path is required for file writes.' };
  }
  const candidate = rawPath.trim().replaceAll('\\', '/');
  if (candidate.startsWith('//') || (/^[a-z]:\//i.test(candidate) && process.platform !== 'win32')) {
    return { error: 'This absolute path format cannot be safely resolved inside the checked-out repository.' };
  }
  const root = path.resolve(cwd);
  const absolute = path.isAbsolute(candidate) ? path.resolve(candidate) : path.resolve(root, candidate);
  const relative = path.relative(root, absolute).replaceAll('\\', '/');
  if (relative === '..' || relative.startsWith('../') || path.isAbsolute(relative)) {
    return { error: 'Writes must remain inside the checked-out repository.' };
  }
  return { relative: relative === '' ? '.' : relative };
}

export function decidePreToolUse(event) {
  if (!event || typeof event !== 'object') return deny('Invalid Claude Code hook input; refusing the tool call.');
  const toolName = event.tool_name;
  const toolInput = event.tool_input && typeof event.tool_input === 'object' ? event.tool_input : {};
  const cwd = typeof event.cwd === 'string' && event.cwd.trim() ? event.cwd : process.cwd();

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'NotebookEdit') {
    const target = normalizeTarget(toolInput.file_path ?? toolInput.path, cwd);
    if (target.error) return deny(target.error);
    if (PROTECTED_PATHS.some((pattern) => pattern.test(target.relative))) {
      return deny(`This path is protected and requires a separately reviewed owner change: ${target.relative}`);
    }
    return null;
  }

  if (toolName === 'Bash') {
    const command = toolInput.command;
    if (typeof command !== 'string' || !command.trim()) {
      return deny('A shell command is required; refusing an uninspectable tool call.');
    }
    const blocked = BLOCKED_COMMANDS.find(({ pattern }) => pattern.test(command));
    return blocked ? deny(blocked.reason) : null;
  }

  return null;
}

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    process.stdout.write(JSON.stringify(deny('Invalid hook JSON; refusing the tool call.')) + '\n');
    return;
  }
  const decision = decidePreToolUse(event);
  if (decision) process.stdout.write(JSON.stringify(decision) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
