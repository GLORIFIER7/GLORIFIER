/**
 * Resolve an external integration URL only when it is a credential-free HTTPS URL.
 * Public integration metadata is still treated as untrusted at the rendering boundary.
 */
export const getSafeExternalUrl = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.port) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
};
