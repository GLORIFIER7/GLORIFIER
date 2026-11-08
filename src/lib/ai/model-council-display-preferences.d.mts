export interface DisplayWeightNode {
  id: string;
  weight: number;
}

export declare function resetDisplayWeights<T extends DisplayWeightNode>(
  currentNodes: readonly T[],
  initialNodes: readonly DisplayWeightNode[],
): T[];
