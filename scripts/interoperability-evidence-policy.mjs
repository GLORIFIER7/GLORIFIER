export const LIVE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function isEvidenceTimestampFresh(observedAt, {
  live = false,
  now = Date.now(),
  maxAgeMs = LIVE_EVIDENCE_MAX_AGE_MS,
  futureClockSkewMs = FUTURE_CLOCK_SKEW_MS,
} = {}) {
  if (typeof observedAt !== 'string' || !observedAt.trim()) return false;
  const timestamp = Date.parse(observedAt);
  if (!Number.isFinite(timestamp)) return false;
  const ageMs = now - timestamp;
  if (ageMs < -futureClockSkewMs) return false;
  return !live || ageMs <= maxAgeMs;
}

const environmentPatterns = {
  platform: [
    { family: 'ubuntu', pattern: /\bubuntu(?:[-\s]?(\d{2}\.\d{2}|latest|lts))?\b/gi },
    { family: 'debian', pattern: /\bdebian(?:[-\s]?(\d+(?:\.\d+)*))?\b/gi },
    { family: 'alpine', pattern: /\balpine(?:\s+linux)?(?:[-\s]?(\d+(?:\.\d+)*))?\b/gi },
    { family: 'fedora', pattern: /\bfedora[-\s]?(\d+(?:\.\d+)*)\b/gi },
    { family: 'centos', pattern: /\bcentos[-\s]?(\d+(?:\.\d+)*)\b/gi },
    { family: 'rhel', pattern: /\b(?:rhel|red\s+hat\s+enterprise\s+linux)[-\s]?(\d+(?:\.\d+)*)\b/gi },
    { family: 'amazon-linux', pattern: /\bamazon\s+linux(?:[-\s]?(\d+(?:\.\d+)*))?\b/gi },
    { family: 'arch-linux', pattern: /\barch\s+linux\b/gi },
    { family: 'opensuse', pattern: /\bopensuse(?:\s+(?:leap|tumbleweed))?\b/gi },
    { family: 'suse', pattern: /\bsuse\s+linux\s+enterprise(?:[-\s]?(\d+(?:\.\d+)*))?\b/gi },
    { family: 'linux', pattern: /\blinux\b/gi },
    { family: 'windows', pattern: /\bwindows(?:\s+server)?(?:[-\s]?(\d{4}|1[01]|\d|latest))?\b/gi },
    { family: 'macos', pattern: /\bmacos(?:[-\s]?(\d{1,2}))?\b/gi },
    { family: 'darwin', pattern: /\bdarwin(?:[-\s]?(\d+(?:\.\d+)*))?\b/gi },
    { family: 'unix', pattern: /\bunix\b/gi },
    { family: 'android', pattern: /\bandroid(?:[-\s]?(\d+(?:\.\d+)*))?\b/gi },
    { family: 'ios', pattern: /\bios(?:[-\s]?(\d+(?:\.\d+)*))?\b/gi },
    { family: 'freebsd', pattern: /\bfreebsd[-\s]?(\d+(?:\.\d+)*)\b/gi },
    { family: 'openbsd', pattern: /\bopenbsd[-\s]?(\d+(?:\.\d+)*)\b/gi },
    { family: 'netbsd', pattern: /\bnetbsd[-\s]?(\d+(?:\.\d+)*)\b/gi },
  ],
  runtime: [
    { family: 'python', pattern: /\bpython\s*v?(\d+(?:\.\d+){0,2}(?:\.x)?)\b/gi },
    { family: 'go', pattern: /\bgo\s*v?(\d+(?:\.\d+){0,2}(?:\.x)?)\b/gi },
    { family: 'node', pattern: /\bnode(?:\.js)?\s*v?(\d+(?:\.\d+){0,2}(?:\.x)?)\b/gi },
    { family: 'jdk', pattern: /\bjdk\s*v?(\d+(?:\.\d+){0,2})\b/gi },
    { family: 'kotlin', pattern: /\bkotlin\s*v?(\d+(?:\.\d+){0,2})\b/gi },
    { family: 'dotnet', pattern: /\.net\s*v?(\d+(?:\.\d+){0,2})\b/gi },
    { family: 'php', pattern: /\bphp\s*v?(\d+(?:\.\d+){0,2})\b/gi },
    { family: 'ruby', pattern: /\bruby\s*v?(\d+(?:\.\d+){0,2})\b/gi },
    { family: 'rust', pattern: /\brust(?:c)?\s+(stable|beta|nightly|\d+(?:\.\d+){0,2})\b/gi },
    { family: 'dart', pattern: /\bdart\s*v?(\d+(?:\.\d+){0,2})\b/gi },
    { family: 'swift', pattern: /\bswift\s*v?(\d+(?:\.\d+){0,2}\+?)(?=\b|\s|\/|,|;|$)/gi },
  ],
};

function extractEnvironmentIdentity(value) {
  const identity = { platforms: [], architectures: [], runtimes: {} };
  const source = String(value ?? '');

  for (const { family, pattern } of environmentPatterns.platform) {
    for (const match of source.matchAll(pattern)) {
      identity.platforms.push(`${family}:${match[1] ?? ''}`);
    }
  }

  for (const match of source.matchAll(/\b(x86_64|amd64|arm64|aarch64)\b/gi)) {
    const architecture = match[1].toLowerCase();
    identity.architectures.push(
      architecture === 'amd64' ? 'x86_64' :
      architecture === 'aarch64' ? 'arm64' : architecture,
    );
  }

  for (const { family, pattern } of environmentPatterns.runtime) {
    for (const match of source.matchAll(pattern)) {
      const versions = identity.runtimes[family] ??= [];
      versions.push(match[1].toLowerCase().replace(/\+$/, ''));

      // Evidence labels often compress a runtime matrix as 3.10/3.11/3.12
      // or 1.26.x/1.27.x after naming the runtime family once.
      let cursor = match.index + match[0].length;
      while (cursor < source.length) {
        const continuation = /^\s*(?:\/|,|\band\b)\s*v?(\d+(?:\.\d+){0,2}(?:\.x)?)/i.exec(source.slice(cursor));
        if (!continuation) break;
        versions.push(continuation[1].toLowerCase().replace(/\+$/, ''));
        cursor += continuation[0].length;
      }
    }
  }

  identity.platforms = [...new Set(identity.platforms)];
  const specificLinuxDistribution = identity.platforms.some((platform) =>
    /^(?:ubuntu|debian|alpine|fedora|centos|rhel|amazon-linux|arch-linux|opensuse|suse):/.test(platform),
  );
  if (specificLinuxDistribution) {
    identity.platforms = identity.platforms.filter((platform) => platform !== 'linux:');
  }
  identity.architectures = [...new Set(identity.architectures)];
  for (const family of Object.keys(identity.runtimes)) {
    identity.runtimes[family] = [...new Set(identity.runtimes[family])];
  }
  return identity;
}

function versionMatches(declaredVersion, observedVersion) {
  if (declaredVersion === 'latest' || declaredVersion === 'lts') {
    return observedVersion === declaredVersion || /^\\d/.test(observedVersion);
  }
  if (declaredVersion.endsWith('+')) {
    const minimum = declaredVersion.slice(0, -1).split('.').map(Number);
    const observed = observedVersion.replace(/\\+$/, '').split('.').map(Number);
    if (minimum.some((value) => !Number.isInteger(value)) ||
        observed.some((value) => !Number.isInteger(value))) return false;
    for (let index = 0; index < Math.max(minimum.length, observed.length); index += 1) {
      const minimumPart = minimum[index] ?? 0;
      const observedPart = observed[index] ?? 0;
      if (observedPart > minimumPart) return true;
      if (observedPart < minimumPart) return false;
    }
    return true;
  }
  if (declaredVersion.endsWith('.x')) {
    return observedVersion === declaredVersion.slice(0, -2) ||
      observedVersion.startsWith(`${declaredVersion.slice(0, -2)}.`);
  }
  if (observedVersion.endsWith('.x')) {
    const observedPrefix = observedVersion.slice(0, -2);
    return declaredVersion === observedPrefix ||
      declaredVersion.startsWith(`${observedPrefix}.`);
  }
  if (declaredVersion.endsWith('.0') && observedVersion === declaredVersion.slice(0, -2)) {
    return true;
  }
  if (!/^\\d/.test(declaredVersion) || !/^\\d/.test(observedVersion)) {
    return declaredVersion === observedVersion;
  }
  return observedVersion === declaredVersion ||
    observedVersion.startsWith(`${declaredVersion}.`);
}

/**
 * Returns true only when an evidence record identifies at least one
 * declared target environment by platform, architecture, and any declared
 * runtime family/version. Extra run metadata in evidence labels is ignored.
 */
export function hasEvidenceForDeclaredTargetEnvironment(
  evidenceTargetEnvironment,
  declaredTargetEnvironments,
) {
  if (typeof evidenceTargetEnvironment !== 'string' || !evidenceTargetEnvironment.trim() ||
      !Array.isArray(declaredTargetEnvironments) || declaredTargetEnvironments.length === 0) {
    return false;
  }

  const evidence = extractEnvironmentIdentity(evidenceTargetEnvironment);
  return declaredTargetEnvironments.some((target) => {
    if (typeof target !== 'string' || !target.trim()) return false;
    const declared = extractEnvironmentIdentity(target);
    const hasIdentity = declared.platforms.length > 0 ||
      declared.architectures.length > 0 ||
      Object.keys(declared.runtimes).length > 0;

    if (!hasIdentity) {
      const normalize = (value) => value.toLowerCase().replace(/[^a-z0-9.]+/g, ' ').trim().replace(/\s+/g, ' ');
      const targetText = normalize(target);
      const evidenceText = normalize(evidenceTargetEnvironment);
      return targetText === evidenceText ||
        evidenceText.includes(targetText) ||
        targetText.includes(evidenceText);
    }

    const platformHints = /\b(?:linux|windows|macos|os\s+x|darwin|ubuntu|debian|alpine|fedora|centos|rhel|red\s+hat|amazon\s+linux|arch\s+linux|opensuse|suse\s+linux|android|ios|freebsd|openbsd|netbsd|unix)\b/i;
    const targetNamesPlatform = platformHints.test(target);
    const platformMatches = declared.platforms.length > 0
      ? declared.platforms.every((platform) => {
          if (platform === 'linux:') {
            return evidence.platforms.some((observed) =>
              /^(?:linux|ubuntu|debian|alpine|fedora|centos|rhel|amazon-linux|arch-linux|opensuse|suse):/.test(observed),
            );
          }
          if (platform === 'unix:') {
            return evidence.platforms.some((observed) =>
              /^(?:linux|ubuntu|debian|alpine|fedora|centos|rhel|amazon-linux|arch-linux|opensuse|suse|macos|darwin|freebsd|openbsd|netbsd):/.test(observed),
            );
          }
          const [family, version] = platform.split(':');
          return evidence.platforms.some((observed) => {
            const [observedFamily, observedVersion] = observed.split(':');
            return observedFamily === family &&
              (!version || !observedVersion || versionMatches(version, observedVersion));
          });
        })
      : !targetNamesPlatform;
    const architectureMatches = declared.architectures.length === 0 ||
      declared.architectures.every((architecture) => evidence.architectures.includes(architecture));
    const runtimeMatches = Object.entries(declared.runtimes).every(([family, versions]) => {
      const observedVersions = evidence.runtimes[family] ?? [];
      return versions.every((declaredVersion) =>
        observedVersions.some((observedVersion) => versionMatches(declaredVersion, observedVersion)),
      );
    });

    return platformMatches && architectureMatches && runtimeMatches;
  });
}


/**
 * Requires qualifying, timestamped evidence for every declared environment.
 * A single CI record must not implicitly verify sibling OS/runtime targets
 * unless its targetEnvironment itself identifies the entire matrix.
 */
export function hasEvidenceForEveryDeclaredTargetEnvironment(
  evidenceItems,
  declaredTargetEnvironments,
  { live = false, now } = {},
) {
  if (!Array.isArray(evidenceItems) || !Array.isArray(declaredTargetEnvironments) ||
      declaredTargetEnvironments.length === 0) {
    return false;
  }

  const freshnessOptions = Number.isFinite(now) ? { live, now } : { live };
  return declaredTargetEnvironments.every((target) => {
    if (typeof target !== 'string' || !target.trim()) return false;
    return evidenceItems.some((item) => {
      if (!item || typeof item !== 'object') return false;
      const acceptableKind = live
        ? item.kind === 'live-probe'
        : ['automated-test', 'ci-run', 'live-probe'].includes(item.kind);
      return acceptableKind &&
        isEvidenceTimestampFresh(item.observedAt, freshnessOptions) &&
        typeof item.reference === 'string' && item.reference.trim().length > 0 &&
        hasEvidenceForDeclaredTargetEnvironment(item.targetEnvironment, [target]);
    });
  });
}
