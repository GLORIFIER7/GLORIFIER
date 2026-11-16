import { createHash } from 'node:crypto';

export const SKILLHUB_PACKAGE_POLICY = Object.freeze({
  maxFiles: 500,
  maxSingleFileBytes: 10 * 1024 * 1024,
  maxPackageBytes: 100 * 1024 * 1024,
  maxPathLength: 240,
  maxPathSegmentLength: 100
});

const ALLOWED_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.yaml', '.yml', '.toml', '.xml', '.csv',
  '.html', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.ts', '.tsx', '.js', '.cjs', '.mjs', '.py', '.sh', '.bash',
  '.zsh', '.ps1', '.bat', '.cmd', '.rb', '.go', '.rs', '.java', '.kt',
  '.lua', '.sql'
]);

const SCRIPT_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.cjs', '.mjs', '.py', '.sh', '.bash', '.zsh',
  '.ps1', '.bat', '.cmd', '.rb', '.go', '.rs', '.java', '.kt', '.lua', '.sql'
]);

const PINNED_REVISION = /^(?:[a-f0-9]{40}|[a-f0-9]{64}|sha256:[a-f0-9]{64})$/i;
const EXACT_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const HEX_SHA256 = /^(?:sha256:)?[a-f0-9]{64}$/i;

export interface SkillPackageFile {
  path: string;
  sizeBytes: number;
  sha256: string;
  /** Actual bytes from the quarantined package; required to verify the digest. */
  contentBytes: Uint8Array;
  executable?: boolean;
  isSymlink?: boolean;
}

export interface SkillDependency {
  name: string;
  version: string;
}

export interface SkillCandidate {
  name: string;
  version: string;
  description: string;
  sourceUrl: string;
  sourceRevision: string;
  license: string;
  dependencies: SkillDependency[];
  permissions: string[];
  networkHosts: string[];
  skillMdContent: string;
  files: SkillPackageFile[];
}

export interface SkillPackageValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  canonicalFilePaths: string[];
}

export interface SkillPromotionEvidence {
  sourceRevisionPinned: boolean;
  licenseReviewed: boolean;
  dependenciesReviewed: boolean;
  permissionsReviewed: boolean;
  securityScan: 'passed' | 'failed' | 'not-run';
  contractTests: 'passed' | 'failed' | 'not-run';
  leastPrivilegeReviewed: boolean;
  humanApproved: boolean;
  humanReviewer: string;
  auditReference: string;
}

export interface SkillPromotionDecision {
  eligible: boolean;
  blockers: string[];
  catalogState: 'approved' | 'pending-review';
  installationAuthorized: false;
  runtimeExecutionAuthorized: false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function digestValue(value: string): string {
  return value.toLowerCase().replace(/^sha256:/, '');
}

function fileExtension(path: string): string {
  const name = path.split('/').at(-1) ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

function assertExternalHttpsUrl(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('sourceUrl must be a valid HTTPS URL');
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isIpv4 = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
  const isIpv6 = host.includes(':');
  const isLocalHost =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === '0.0.0.0';

  if (
    url.protocol !== 'https:' ||
    !host ||
    url.username ||
    url.password ||
    isIpv4 ||
    isIpv6 ||
    isLocalHost ||
    url.port && url.port !== '443'
  ) {
    throw new Error('sourceUrl must use public HTTPS without credentials or local/private destinations');
  }
}

function parseSkillFrontmatter(content: string): { name: string; description: string } {
  if (content.length > 1024 * 1024) {
    throw new Error('SKILL.md exceeds the 1 MiB metadata inspection limit');
  }

  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) throw new Error('root SKILL.md must begin with bounded YAML frontmatter');

  const readScalar = (key: string): string => {
    const lines = match[1].split(/\r?\n/).filter((line) => new RegExp('^' + key + '\\s*:').test(line));
    if (lines.length !== 1) throw new Error('SKILL.md frontmatter must contain exactly one ' + key);
    const raw = lines[0].slice(lines[0].indexOf(':') + 1).trim();
    const value = raw.length >= 2 && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1).trim()
      : raw;
    if (!value || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error('SKILL.md frontmatter ' + key + ' must be a non-empty single-line scalar');
    }
    return value;
  };

  return { name: readScalar('name'), description: readScalar('description') };
}

/**
 * Canonicalize a package path without normalizing away traversal attempts.
 * Backslashes are accepted as separators; absolute paths, dot segments,
 * aliases and platform-reserved names are rejected.
 */
export function normalizeSkillEntryPath(rawPath: string): string {
  if (typeof rawPath !== 'string' || !rawPath.trim()) {
    throw new Error('package entry path is missing');
  }

  const path = rawPath.replace(/\\/g, '/').normalize('NFC');
  if (
    path.length > SKILLHUB_PACKAGE_POLICY.maxPathLength ||
    path.startsWith('/') ||
    /^[a-z]:/i.test(path) ||
    path.includes(':') ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new Error('package entry path is absolute, too long, or contains an invalid character: ' + rawPath);
  }

  const segments = path.split('/');
  if (segments.some((segment) =>
    !segment ||
    segment === '.' ||
    segment === '..' ||
    segment.trim() !== segment ||
    segment.length > SKILLHUB_PACKAGE_POLICY.maxPathSegmentLength ||
    /[. ]$/.test(segment) ||
    /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(segment)
  )) {
    throw new Error('package entry path contains an unsafe or non-portable segment: ' + rawPath);
  }

  return segments.join('/');
}

function validateStringList(value: unknown, label: string, errors: string[]): string[] {
  if (!Array.isArray(value)) {
    errors.push(label + ' must be an array');
    return [];
  }

  const values = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  if (values.length !== value.length) errors.push(label + ' must contain only non-empty strings');
  if (new Set(values.map((item) => item.toLowerCase())).size !== values.length) {
    errors.push(label + ' contains duplicates');
  }
  return values;
}

/**
 * Validate an untrusted skill candidate. This function is deterministic and
 * performs no filesystem access, network requests, installation, or execution.
 */
export function validateSkillCandidate(input: unknown): SkillPackageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const canonicalFilePaths: string[] = [];

  if (!isRecord(input)) {
    return { valid: false, errors: ['candidate must be an object'], warnings, canonicalFilePaths };
  }

  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const version = typeof input.version === 'string' ? input.version.trim() : '';
  const description = typeof input.description === 'string' ? input.description.trim() : '';
  const sourceUrl = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
  const sourceRevision = typeof input.sourceRevision === 'string' ? input.sourceRevision.trim() : '';
  const license = typeof input.license === 'string' ? input.license.trim() : '';
  const skillMdContent = typeof input.skillMdContent === 'string' ? input.skillMdContent : '';

  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(name)) errors.push('name must be a lowercase, stable skill slug');
  if (!EXACT_VERSION.test(version)) errors.push('version must be an exact semantic version');
  if (!description || description.length > 500) errors.push('description must contain 1–500 characters');
  if (!sourceUrl) errors.push('sourceUrl is required');
  else {
    try { assertExternalHttpsUrl(sourceUrl); } catch (error) { errors.push((error as Error).message); }
  }
  if (!PINNED_REVISION.test(sourceRevision)) errors.push('source revision must be an immutable 40/64-character commit or SHA-256 digest');
  if (!license || license.length > 120 || /[\u0000-\u001f\u007f]/.test(license) || /^(?:unknown|unlicensed|noassertion)$/i.test(license)) {
    errors.push('license must be an explicit, reviewable license identifier or expression');
  }

  const dependencies = input.dependencies;
  if (!Array.isArray(dependencies)) {
    errors.push('dependencies must be an array');
  } else {
    for (const dependency of dependencies) {
      if (!isRecord(dependency) || typeof dependency.name !== 'string' || !dependency.name.trim()) {
        errors.push('each dependency must declare a name and an immutable version');
        continue;
      }
      const dependencyVersion = typeof dependency.version === 'string' ? dependency.version.trim() : '';
      if (!EXACT_VERSION.test(dependencyVersion) && !PINNED_REVISION.test(dependencyVersion)) {
        errors.push('dependency ' + dependency.name + ' must use an exact pinned version or commit digest');
      }
    }
  }

  const permissions = validateStringList(input.permissions, 'permissions', errors);
  const networkHosts = validateStringList(input.networkHosts, 'networkHosts', errors);
  for (const host of networkHosts) {
    if (
      host.includes('*') ||
      host.includes('/') ||
      host.includes('@') ||
      host.includes(':') ||
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host)
    ) {
      errors.push('networkHosts must contain exact public DNS hostnames, not wildcards or URLs');
    }
  }

  if (!skillMdContent) {
    errors.push('skillMdContent is required for safe frontmatter validation');
  } else {
    try {
      const frontmatter = parseSkillFrontmatter(skillMdContent);
      if (frontmatter.name !== name) errors.push('SKILL.md name does not match the candidate name');
      if (frontmatter.description !== description) errors.push('SKILL.md description does not match the candidate description');
      if (skillMdContent.slice(skillMdContent.indexOf('\n---', 4) + 4).trim().length < 20) {
        errors.push('SKILL.md must contain meaningful instructions after frontmatter');
      }
    } catch (error) {
      errors.push((error as Error).message);
    }
  }

  if (!Array.isArray(input.files)) {
    errors.push('files must be an array');
  } else {
    const files = input.files as unknown[];
    if (files.length > SKILLHUB_PACKAGE_POLICY.maxFiles) {
      errors.push('file count exceeds the package limit of ' + SKILLHUB_PACKAGE_POLICY.maxFiles);
    }

    const seen = new Set<string>();
    let totalBytes = 0;
    let rootSkillFile: Record<string, unknown> | undefined;

    for (const entry of files) {
      if (!isRecord(entry)) {
        errors.push('each package file must be an object');
        continue;
      }

      const rawPath = typeof entry.path === 'string' ? entry.path : '';
      let path: string;
      try {
        path = normalizeSkillEntryPath(rawPath);
      } catch (error) {
        errors.push((error as Error).message);
        continue;
      }

      canonicalFilePaths.push(path);
      const portableKey = path.toLowerCase();
      if (seen.has(portableKey)) errors.push('duplicate package path after case normalization: ' + path);
      seen.add(portableKey);

      if (entry.isSymlink === true) errors.push('symbolic links are not allowed in skill packages: ' + path);

      const extension = fileExtension(path);
      if (!ALLOWED_EXTENSIONS.has(extension)) errors.push('file extension is not allowed: ' + path);

      const sizeBytes = entry.sizeBytes;
      if (!Number.isSafeInteger(sizeBytes) || (sizeBytes as number) < 0) {
        errors.push('file size must be a non-negative safe integer: ' + path);
      } else {
        totalBytes += sizeBytes as number;
        if ((sizeBytes as number) > SKILLHUB_PACKAGE_POLICY.maxSingleFileBytes) {
          errors.push('file size exceeds the 10 MiB single-file limit: ' + path);
        }
      }

      const sha256 = typeof entry.sha256 === 'string' ? entry.sha256 : '';
      if (!HEX_SHA256.test(sha256)) errors.push('file must include a SHA-256 digest: ' + path);

      const contentBytes = entry.contentBytes;
      if (!(contentBytes instanceof Uint8Array)) {
        errors.push('actual file content bytes are required to verify package integrity: ' + path);
      } else {
        if (Number.isSafeInteger(sizeBytes) && sizeBytes !== contentBytes.byteLength) {
          errors.push('declared file size does not match actual content bytes: ' + path);
        }
        if (HEX_SHA256.test(sha256)) {
          const actualDigest = createHash('sha256').update(contentBytes).digest('hex');
          if (digestValue(sha256) !== actualDigest) errors.push('file content does not match its SHA-256 digest: ' + path);
        }
      }

      const executable = entry.executable === true || SCRIPT_EXTENSIONS.has(extension);
      if (executable) warnings.push('executable or script content requires isolated security review: ' + path);

      if (path === 'SKILL.md' && isRecord(entry)) {
        rootSkillFile = entry;
      }
    }

    if (totalBytes > SKILLHUB_PACKAGE_POLICY.maxPackageBytes) {
      errors.push('total package size exceeds the 100 MiB limit');
    }
    if (!rootSkillFile) {
      errors.push('package must contain a root-level SKILL.md');
    } else if (skillMdContent) {
      const expectedBytes = Buffer.from(skillMdContent, 'utf8');
      const rootBytes = rootSkillFile.contentBytes;
      if (!(rootBytes instanceof Uint8Array) || !Buffer.from(rootBytes).equals(expectedBytes)) {
        errors.push('root SKILL.md content does not match the parsed frontmatter source');
      }
    }
  }

  if (networkHosts.length > 0 || permissions.some((permission) => /network|write|execute|shell/i.test(permission))) {
    warnings.push('declared network or mutating capabilities require explicit least-privilege review');
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    canonicalFilePaths: canonicalFilePaths.sort()
  };
}

/** Deterministic package fingerprint over sorted, normalized path/hash pairs. */
export function createSkillFingerprint(files: readonly SkillPackageFile[]): string {
  const entries = files.map((file) => {
    const path = normalizeSkillEntryPath(file.path);
    if (!HEX_SHA256.test(file.sha256)) throw new Error('invalid SHA-256 digest for ' + path);
    return { path, digest: digestValue(file.sha256) };
  }).sort((left, right) => left.path.localeCompare(right.path));

  const seen = new Set<string>();
  for (const entry of entries) {
    const key = entry.path.toLowerCase();
    if (seen.has(key)) throw new Error('duplicate package path: ' + entry.path);
    seen.add(key);
  }

  const canonical = entries.map((entry) => entry.path + ':' + entry.digest + '\n').join('');
  return 'sha256:' + createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Return the sorted set of paths whose content hash differs between versions. */
export function diffSkillFiles(
  baseline: Readonly<Record<string, string>> | undefined,
  current: Readonly<Record<string, string>>
): string[] {
  if (!baseline) return [];
  const paths = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  return [...paths].filter((path) => baseline[path] !== current[path]).sort();
}

/**
 * Decide whether a skill may enter the reviewed catalogue.
 * Approval never grants installation or runtime execution authority.
 */
export function evaluateSkillPromotion(evidence: SkillPromotionEvidence): SkillPromotionDecision {
  const blockers: string[] = [];

  if (evidence.sourceRevisionPinned !== true) blockers.push('source revision must be pinned');
  if (evidence.licenseReviewed !== true) blockers.push('license review is required');
  if (evidence.dependenciesReviewed !== true) blockers.push('dependency review is required');
  if (evidence.permissionsReviewed !== true) blockers.push('permission disclosure review is required');
  if (evidence.securityScan !== 'passed') blockers.push('a completed passing security scan is required');
  if (evidence.contractTests !== 'passed') blockers.push('passing contract tests are required');
  if (evidence.leastPrivilegeReviewed !== true) blockers.push('least-privilege review is required');
  if (evidence.humanApproved !== true) blockers.push('explicit human approval is required');
  if (!evidence.humanReviewer?.trim()) blockers.push('a named human reviewer is required');
  if (!evidence.auditReference?.trim()) blockers.push('an audit reference is required');

  const eligible = blockers.length === 0;
  return {
    eligible,
    blockers,
    catalogState: eligible ? 'approved' : 'pending-review',
    installationAuthorized: false,
    runtimeExecutionAuthorized: false
  };
}
