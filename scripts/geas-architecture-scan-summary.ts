export interface ArchitecturePatternClassSummary {
  discoveredPatterns: number;
  analysisPatterns: number;
  claimSupportedPatterns: number;
  recommendationPatterns: number;
  unclassifiedPatterns: number;
}

/**
 * Count architecture pattern evidence classes without promoting discovery
 * into claim verification. Unknown future classes remain explicitly visible.
 */
export function summarizeArchitecturePatterns(
  patterns: readonly { evidenceClass: string }[],
): ArchitecturePatternClassSummary {
  const summary: ArchitecturePatternClassSummary = {
    discoveredPatterns: patterns.length,
    analysisPatterns: 0,
    claimSupportedPatterns: 0,
    recommendationPatterns: 0,
    unclassifiedPatterns: 0,
  };

  for (const pattern of patterns) {
    switch (pattern.evidenceClass) {
      case 'analysis':
        summary.analysisPatterns += 1;
        break;
      case 'observed-fact':
        summary.claimSupportedPatterns += 1;
        break;
      case 'recommendation':
        summary.recommendationPatterns += 1;
        break;
      default:
        summary.unclassifiedPatterns += 1;
        break;
    }
  }

  return summary;
}
