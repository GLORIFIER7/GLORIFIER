export function resetDisplayWeights(currentNodes, initialNodes) {
  const initialWeights = new Map(initialNodes.map(({ id, weight }) => [id, weight]));
  return currentNodes.map((node) => {
    if (!initialWeights.has(node.id)) return node;
    return { ...node, weight: initialWeights.get(node.id) };
  });
}
