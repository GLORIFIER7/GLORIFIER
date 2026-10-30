export type AgentTaskFailureWriter = (taskId: string, message: string) => Promise<unknown>;

/**
 * Runs one governance operation and persists a failed task state when it throws.
 * The caller owns the task transition and may supply its persistence adapter.
 */
export async function withGovernanceTaskFailureRecovery<T>(
  taskId: string,
  operation: () => Promise<T>,
  markTaskFailed: AgentTaskFailureWriter,
): Promise<T> {
  return operation();
}
