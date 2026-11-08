export function resetDisplayWeights(currentNodes, initialNodes) {
  const initialWeights = new Map(initialNodes.map(({ id, weight }) => [id, weight]));
  return currentNodes.map((node) => {
    const initialWeight = initialWeights.get(node.id);
    if (initialWeight === undefined) return node;
    return { ...node, weight: initialWeight };
  });
}
