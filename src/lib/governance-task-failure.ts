export type AgentTaskFailureWriter = (taskId: string, message: string) => Promise<unknown>;

/**
 * Runs one governance operation and persists a failed task state when it throws.
 * The original operation error is always rethrown, even if the failure-state
 * write also fails.
 */
export async function withGovernanceTaskFailureRecovery<T>(
  taskId: string,
  operation: () => Promise<T>,
  markTaskFailed: AgentTaskFailureWriter,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
      await markTaskFailed(taskId, message);
    } catch (persistenceError) {
      console.error('[GovernanceLoop] Could not persist failed task state; preserving original execution error.', {
        taskId,
        executionError: message,
        persistenceError: persistenceError instanceof Error ? persistenceError.message : String(persistenceError),
      });
    }
    throw error;
  }
}
