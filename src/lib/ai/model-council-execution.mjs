import {
  executeModelCouncilProviders,
  isValidModelCouncilResponse,
} from './model-council-routing.mjs';

const PROVIDER_COLORS = Object.freeze({
  openai: 'emerald',
  gemini: 'teal',
  anthropic: 'purple',
  meta: 'cyan',
  nvidia: 'amber',
});

function mapCouncilParticipants(participants) {
  return participants.map((participant) => ({
    modelId: `${participant.provider}/${participant.model}`,
    model: participant.model,
    name: participant.model,
    provider: participant.provider,
    role: 'Independent provider analysis',
    color: PROVIDER_COLORS[participant.provider] || 'amber',
    badge: 'Live provider response',
    status: 'completed',
    output: participant.text,
    perspective: 'Independent provider output; not, by itself, proof of consensus.',
    latencyMs: participant.latencyMs,
  }));
}

function noSynthesisMessage(providerDiversity) {
  if (providerDiversity >= 2) {
    return 'Independent provider responses were received. Cross-provider synthesis was not completed; no consensus is claimed.';
  }
  return 'A response from only one provider was received. Independent multi-provider consensus is unavailable.';
}

async function synthesizeCouncilResponses({ council, topic, generate, timeoutMs }) {
  const fallback = {
    synthesis: null,
    unifiedConsensus: noSynthesisMessage(council.providerDiversity),
  };
  if (council.providerDiversity < 2) return fallback;

  const synthesisParticipant = council.participants[0];
  const evidencePacket = council.participants.map((participant) => (
    `[${participant.provider}/${participant.model}]\n${participant.text}`
  )).join('\n\n');
  const messages = [
    {
      role: 'system',
      content: [
        'You are the GLORIFIER advisory synthesis reviewer.',
        'Compare the independently returned provider analyses.',
        'Identify agreement, disagreement, contradictions, uncertainty, missing evidence, and next verification steps.',
        'Do not state that consensus exists merely because multiple responses were received.',
        'Do not invent facts, sources, test results, approvals, or verified outcomes.',
        'No action is authorized by this synthesis; humans retain final authority.',
      ].join('\n'),
    },
    {
      role: 'user',
      content: `Agenda: ${topic}\n\nIndependent provider responses:\n${evidencePacket}`,
    },
  ];

  try {
    const response = await generate(
      synthesisParticipant.provider,
      synthesisParticipant.model,
      messages,
      AbortSignal.timeout(timeoutMs),
    );
    if (!isValidModelCouncilResponse(response, synthesisParticipant.provider, synthesisParticipant.model)) {
      return fallback;
    }
    const synthesis = {
      provider: response.provider,
      model: response.model,
      output: response.text.trim(),
    };
    return { synthesis, unifiedConsensus: synthesis.output };
  } catch {
    return fallback;
  }
}

export async function executeModelCouncilRequest({
  participants,
  messages,
  topic,
  generate,
  timeoutMs = 45_000,
  timestamp = () => new Date().toISOString(),
}) {
  const council = await executeModelCouncilProviders({
    participants,
    messages,
    generate,
    timeoutMs,
  });

  if (council.participantCount === 0) {
    return {
      status: 503,
      body: {
        ok: false,
        error: 'No selected provider returned a usable response. Check provider configuration, authorization, quota, and availability.',
        requestedParticipants: council.requestedParticipants,
        requestedProviderIds: council.requestedProviderIds,
        participantCount: 0,
        providerDiversity: 0,
        failures: council.failures,
        syntheticOutput: false,
      },
    };
  }

  const responseParticipants = mapCouncilParticipants(council.participants);
  const synthesisResult = await synthesizeCouncilResponses({
    council,
    topic,
    generate,
    timeoutMs,
  });

  return {
    status: 200,
    body: {
      ok: true,
      agenda: topic,
      timestamp: timestamp(),
      participants: responseParticipants,
      participantCount: council.participantCount,
      providerDiversity: council.providerDiversity,
      requestedParticipants: council.requestedParticipants,
      requestedProviderIds: council.requestedProviderIds,
      councilStatus: council.status,
      failures: council.failures,
      synthesis: synthesisResult.synthesis,
      synthesisStatus: synthesisResult.synthesis ? 'completed' : 'not-completed',
      unifiedConsensus: synthesisResult.unifiedConsensus,
      consensusScore: null,
      recommendedEpsilon: null,
      recommendedFloorUsd: null,
      actionDirectives: [],
      governance: {
        selectedProvidersOnly: true,
        actualProviderAttribution: true,
        noImplicitProviderFallback: true,
        noSyntheticOutput: true,
        consensusNotInferredFromResponseCount: true,
        humanFinalAuthority: true,
        evidenceFirst: true,
      },
    },
  };
}
