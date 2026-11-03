import React from 'react';
import { ExternalLink } from 'lucide-react';
import { getSafeExternalUrl } from '../lib/safe-external-url';

type IntegrationExternalLinkProps = {
  url: unknown;
  name: string;
};

/**
 * Render an external integration destination only after validating its URL.
 * Invalid, relative, insecure, or credential-bearing URLs produce no anchor.
 */
export const IntegrationExternalLink: React.FC<IntegrationExternalLinkProps> = ({ url, name }) => {
  const href = getSafeExternalUrl(url);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-slate-500 hover:text-emerald-400 shrink-0"
      aria-label={`Open ${name}`}
    >
      <ExternalLink className="w-4 h-4" />
    </a>
  );
};
