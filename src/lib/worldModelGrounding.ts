export interface WorldModelState {
  phase: 'receptive_hunger' | 'empirical_precedent' | 'targeted_epistemic' | 'continuous_synthesis';
  acquisition_pressure: number;
  epistemic_surprise: number;
  precedent_depth: number;
}

export interface RetrievalDirective {
  strategy: 'broad_exploration' | 'precedent_building' | 'targeted_gap_closing' | 'synthesis_verification';
  focus_domains: string[];
  confidence_floor: number;
  rationale: string;
}

export interface VisionGrounding {
  channel_type: 'archival_scan' | 'live_camera' | 'digital_document';
  estimated_age_years: number | null;
  degradation_factors: string[];
  ocr_confidence: number;
  lexicon_coverage: number;
  novel_token_ratio: number;
}

export const buildVisionGrounding = (input: {
  confidence: number;
  knownCoverage: number;
  novelTokens: string[];
  totalTokens: number;
  channelType?: 'archival_scan' | 'live_camera' | 'digital_document';
}): VisionGrounding => {
  const channelType = input.channelType ?? 'archival_scan';
  const degradationFactors: string[] = [];
  
  if (channelType === 'archival_scan') {
    if (input.confidence < 0.7) {
      degradationFactors.push('ink_fading');
    }
  }

  const novelRatio = input.totalTokens > 0 ? input.novelTokens.length / input.totalTokens : 0;
  if (novelRatio > 0.15) {
    degradationFactors.push('archaic_typography');
  }

  return {
    channel_type: channelType,
    estimated_age_years: channelType === 'archival_scan' ? 50 : null,
    degradation_factors: degradationFactors,
    ocr_confidence: input.confidence,
    lexicon_coverage: input.knownCoverage,
    novel_token_ratio: novelRatio,
  };
};
