export type AutopilotGraphEffect = 'read-only' | 'reversible' | 'irreversible';

export type AutopilotGraphNode = {
  id: string;
  dependsOn?: readonly string[];
  effect?: AutopilotGraphEffect;
};

export type AutopilotGraphNodeStatus =
  | 'pending'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'reconciliation-required';

export type NormalizedAutopilotGraphNode<T extends AutopilotGraphNode = AutopilotGraphNode> =
  Omit<T, 'dependsOn'> & { dependsOn: string[] };

const MAX_GRAPH_NODES = 6;
const MAX_DEPENDENCIES_PER_NODE = MAX_GRAPH_NODES - 1;

/**
 * Validates an Autopilot DAG and returns a stable topological order.
 *
 * Missions created before graph dependencies existed remain sequential: when
 * no node declares dependsOn, each node depends on the preceding node.
 */
export function normalizeAutopilotGraph<T extends AutopilotGraphNode>(
  input: readonly T[],
  maxNodes = MAX_GRAPH_NODES,
): Array<NormalizedAutopilotGraphNode<T>> {
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_GRAPH_NODES) {
    throw new Error(`Autopilot graph maxNodes must be between 1 and ${MAX_GRAPH_NODES}.`);
  }
  if (!Array.isArray(input) || input.length < 1 || input.length > maxNodes) {
    throw new Error(`Autopilot graph must contain between 1 and ${maxNodes} nodes.`);
  }

  const indexById = new Map<string, number>();
  for (const [index, node] of input.entries()) {
    if (!node || typeof node !== 'object' || Array.isArray(node) ||
        typeof node.id !== 'string' || !node.id.trim() || node.id.length > 128) {
      throw new Error(`Autopilot graph node ${index + 1} has an invalid id.`);
    }
    const id = node.id.trim();
    if (indexById.has(id)) throw new Error(`step identifiers must be unique; Autopilot graph contains duplicate node id '${id}'.`);
    indexById.set(id, index);
    if (node.effect !== undefined && !['read-only', 'reversible', 'irreversible'].includes(node.effect)) {
      throw new Error(`Autopilot graph node '${id}' has an unsupported effect classification.`);
    }
  }

  const hasExplicitDependencies = input.some((node) => node.dependsOn !== undefined);
  const nodes = input.map((node, index): NormalizedAutopilotGraphNode<T> => {
    const id = node.id.trim();
    const rawDependencies = hasExplicitDependencies
      ? (node.dependsOn ?? [])
      : (index === 0 ? [] : [input[index - 1].id.trim()]);

    if (!Array.isArray(rawDependencies) || rawDependencies.length > MAX_DEPENDENCIES_PER_NODE) {
      throw new Error(`Autopilot graph node '${id}' has an invalid dependency list.`);
    }

    const dependencies: string[] = [];
    const seen = new Set<string>();
    for (const rawDependency of rawDependencies) {
      if (typeof rawDependency !== 'string' || !rawDependency.trim() || rawDependency.length > 128) {
        throw new Error(`Autopilot graph node '${id}' has an invalid dependency identifier.`);
      }
      const dependency = rawDependency.trim();
      if (seen.has(dependency)) {
        throw new Error(`Autopilot graph node '${id}' has a duplicate dependency '${dependency}'.`);
      }
      if (dependency === id) {
        throw new Error(`Autopilot graph node '${id}' cannot depend on itself.`);
      }
      if (!indexById.has(dependency)) {
        throw new Error(`Autopilot graph node '${id}' references unknown dependency '${dependency}'.`);
      }
      seen.add(dependency);
      dependencies.push(dependency);
    }

    return { ...node, id, dependsOn: dependencies };
  });

  const indegree = new Map(nodes.map((node) => [node.id, node.dependsOn.length]));
  const dependents = new Map(nodes.map((node) => [node.id, [] as string[]]));
  for (const node of nodes) {
    for (const dependency of node.dependsOn) dependents.get(dependency)!.push(node.id);
  }

  const ready = nodes.filter((node) => indegree.get(node.id) === 0).map((node) => node.id);
  const ordered: Array<NormalizedAutopilotGraphNode<T>> = [];
  while (ready.length > 0) {
    // Stable ordering is important for reproducible plans and evidence traces.
    ready.sort((a, b) => indexById.get(a)! - indexById.get(b)!);
    const id = ready.shift()!;
    ordered.push(nodes[indexById.get(id)!]);
    for (const dependent of dependents.get(id) ?? []) {
      const remaining = (indegree.get(dependent) ?? 0) - 1;
      indegree.set(dependent, remaining);
      if (remaining === 0) ready.push(dependent);
    }
  }

  if (ordered.length !== nodes.length) {
    throw new Error('Autopilot graph contains a dependency cycle.');
  }
  return ordered;
}

/**
 * Returns one bounded dispatch wave. Independent read-only nodes may run
 * concurrently. All mutating/irreversible nodes are deliberately serialized.
 * A node is ready only when every dependency has completed successfully.
 */
export function getReadyAutopilotGraphWave<T extends AutopilotGraphNode>(
  graph: readonly T[],
  statuses: ReadonlyMap<string, AutopilotGraphNodeStatus>,
  maxConcurrency = 2,
): Array<NormalizedAutopilotGraphNode<T>> {
  if (!Number.isSafeInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > MAX_GRAPH_NODES) {
    throw new Error(`Autopilot graph concurrency must be between 1 and ${MAX_GRAPH_NODES}.`);
  }

  const normalized = normalizeAutopilotGraph(graph);
  const ready = normalized.filter((node) =>
    (statuses.get(node.id) ?? 'pending') === 'pending' &&
    node.dependsOn.every((dependency) => statuses.get(dependency) === 'completed'),
  );

  if (ready.length === 0) return [];
  const first = ready[0];
  if (first.effect !== 'read-only') return [first];

  return ready
    .filter((node) => node.effect === 'read-only')
    .slice(0, maxConcurrency);
}

/** Returns every transitive prerequisite in deterministic topological order. */
export function getAutopilotGraphAncestors<T extends AutopilotGraphNode>(
  graph: readonly T[],
  nodeId: string,
): string[] {
  const normalized = normalizeAutopilotGraph(graph);
  const selected = normalized.find((node) => node.id === nodeId);
  if (!selected) throw new Error(`Autopilot graph node '${nodeId}' does not exist.`);

  const ancestors = new Set<string>();
  const visit = (id: string): void => {
    const current = normalized.find((node) => node.id === id);
    for (const dependency of current?.dependsOn ?? []) {
      if (ancestors.has(dependency)) continue;
      ancestors.add(dependency);
      visit(dependency);
    }
  };
  visit(selected.id);
  return normalized.filter((node) => ancestors.has(node.id)).map((node) => node.id);
}
