import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROTECTED_PATHS = [
  // Repository policy and agent instructions must not be editable by the agents they constrain.
  /(^|\/)\.github(?:\/|$)/i,
  /(^|\/)\.claude(?:\/|$)/i,
  /(^|\/)\.opencode(?:\/|$)/i,
  /(^|\/)(?:AGENTS\.md|CLAUDE\.md|GEMINI\.md|AGENT_RUNTIME\.md|opencode\.json)$/i,
  /(^|\/)\.env(?:\.[^/]*)?$/i,
  /(^|\/)\.dev\.vars$/i,
  /(^|\/)wrangler\.(?:jsonc?|toml)$/i,
  /(^|\/)(?:database|db|supabase)\/(?:.*\/)?migrations?(?:\/|$)/i,
  /(^|\/)services\/neural\/db\/(?:.*\/)?migrations?(?:\/|$)/i,
  /(^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|uv\.lock|Cargo\.lock|Gemfile\.lock)$/i,
  /(^|\/).*(?:credential|private[-_]?key|service[-_]?account)(?:\.[^/]*)?$/i,
  /\.(?:pem|key|p12|pfx)$/i,
];

const SENSITIVE_READ_PATHS = [
  /(^|\\/)\\.env(?:\\.[^/]*)?$/i,
  /(^|\\/)\\.dev\\.vars$/i,
  /(^|\\/)\\.(?:npmrc|pypirc|netrc)$/i,
  /(^|\\/)\\.(?:ssh|aws)(?:\\/|$)/i,
  /(^|\\/)(?:secrets?|credentials?)(?:\\/|$)/i,
  /(^|\\/)(?:id_rsa|id_ed25519|id_ecdsa)(?:\\.pub)?$/i,
  /(^|\\/).*(?:credential|private[-_]?key|service[-_]?account)(?:\\.[^/]*)?$/i,
  /\\.(?:pem|key|p12|pfx)$/i,
];

// Read tools need a separate content boundary; a prompt instruction is not
// sufficient to keep secrets out of model context.
const BLOCKED_COMMANDS = [
  { matches: /\bgit\b[\s\S]*\bpush\b/i, requiresForceFlag: true, reason: 'Force-push is prohibited because it can overwrite remote branch history.' },
  { matches: /\bgit\b[\s\S]*\breset\b/i, reason: 'Git reset is prohibited because it can discard or rewrite work.' },
  { matches: /\bgit\b[\s\S]*\bclean\b/i, reason: 'Git clean is prohibited because it can delete untracked work.' },
  { matches: /\bgh\s+pr\s+merge\b/i, reason: 'Pull-request merging remains a human-controlled action.' },
  { matches: /\bgh\s+(?:secret|variable)\s+(?:set|delete|remove)\b/i, reason: 'Repository secret and variable changes require owner administration.' },
  { matches: /\b(?:wrangler|npx\s+wrangler)\s+deploy\b/i, reason: 'Production or preview deployment must use the reviewed release workflow.' },
  { matches: /\b(?:npm\s+publish|pnpm\s+publish|yarn\s+publish)\b/i, reason: 'Package publication is outside autonomous coding authority.' },
  { matches: /\bterraform\s+(?:apply|destroy)\b/i, reason: 'Infrastructure mutation is outside autonomous coding authority.' },
  { matches: /\b(?:railway\s+up|fly\s+deploy|docker\s+push)\b/i, reason: 'Infrastructure deployment and image publication require a separate release approval.' },
];

// Shell is not a sandbox. Only vetted single-command inspections and local
// verification commands may run without a separate human-controlled path.
// In particular, never allow shell redirection, pipelines, command substitution,
// inline interpreters or arbitrary scripts to bypass protected file-edit tools.
const SAFE_BASH_COMMANDS = [
  /^pwd$/,
  /^git status(?: --short)?$/,
  /^git diff(?: --check| --stat| --name-only)?$/,
  /^git log(?: --oneline(?: -[1-9][0-9]*)?)?$/,
  /^git show(?: --stat)?(?: (?:HEAD|[a-fA-F0-9]{7,40}))?$/,
  /^git rev-parse (?:--show-toplevel|--abbrev-ref HEAD)$/,
  /^git ls-files$/,
  /^git grep [A-Za-z0-9_.-]+(?: [A-Za-z0-9_./-]+)*$/,
  /^npm run (?:lint|build|typecheck|test(?::[A-Za-z0-9_-]+)?|check(?::[A-Za-z0-9_-]+)?|validate(?::[A-Za-z0-9_-]+)?|verify(?::[A-Za-z0-9_-]+)?)$/,
  /^node --test(?: [A-Za-z0-9_./@-]+)+$/,
  /^node --check [A-Za-z0-9_./@-]+$/,
  /^node --import tsx\/esm --test(?: [A-Za-z0-9_./@-]+)+$/,
  /^tsx [A-Za-z0-9_./@-]+\.test\.ts$/,
  /^uv run --locked pytest(?: [A-Za-z0-9_./@-]+)*$/,
  /^pytest(?: [A-Za-z0-9_./@-]+)*$/,
  /^go test(?: [A-Za-z0-9_./@-]+)*$/,
  /^cargo test(?: [A-Za-z0-9_./@-]+)*$/,
  /^npx --no-install tsc --noEmit$/,
  /^rg [A-Za-z0-9_./@-]+(?: [A-Za-z0-9_./@-]+)*$/,
  /^ls(?: -[al]+| [A-Za-z0-9_./@-]+)*$/,
  /^cat [A-Za-z0-9_./@-]+$/,
];

function isForceFlagPresent(command) {
  return /--force(?:-with-lease|-if-includes)?(?:=|\b)/i.test(command)
    || /(?:^|\s)-[a-z]*f[a-z]*(?:\s|$)/i.test(command);
}

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

  if (toolName === 'Read') {
    const target = normalizeTarget(toolInput.file_path ?? toolInput.path, cwd);
    if (target.error) return deny(target.error);
    if (SENSITIVE_READ_PATHS.some((pattern) => pattern.test(target.relative))) {
      return deny('Direct reads of credential and secret files are prohibited: ' + target.relative);
    }
    return null;
  }

  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultilineEdit' || toolName === 'MultiEdit' || toolName === 'NotebookEdit') {
    const target = normalizeTarget(toolInput.file_path ?? toolInput.path, cwd);
    if (target.error) return deny(target.error);
    if (PROTECTED_PATHS.some((pattern) => pattern.test(target.relative))) {
      return deny('This path is protected and requires a separately reviewed owner change: ' + target.relative);
    }
    return null;
  }

  if (toolName === 'Bash') {
    const command = toolInput.command;
    if (typeof command !== 'string' || !command.trim()) {
      return deny('A shell command is required; refusing an uninspectable tool call.');
    }
    const blocked = BLOCKED_COMMANDS.find((entry) =>
      entry.matches.test(command) && (!entry.requiresForceFlag || isForceFlagPresent(command)),
    );
    if (blocked) return deny(blocked.reason);
    if (!SAFE_BASH_COMMANDS.some((pattern) => pattern.test(command.trim()))) {
      return deny('This shell command is not an approved read-only inspection or local validation command. Use reviewed file-edit tools or obtain owner authorization.');
    }
    return null;
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
