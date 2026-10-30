export type AgentPersistenceInitializer = () => Promise<unknown>;

/**
 * Explicitly select process-local memory mode only when no database URL is
 * configured. A configured database that is still connecting remains fail-closed.
 */
export async function initializeAgentStateFallbackWhenDatabaseMissing(
  databaseUrl: string | undefined,
  initializeRuntime: AgentPersistenceInitializer,
  initializeHarness: AgentPersistenceInitializer,
): Promise<boolean> {
  if (typeof databaseUrl === 'string' && databaseUrl.trim().length > 0) {
    return false;
  }

  await initializeRuntime();
  await initializeHarness();
  return true;
}


/** Initialize PostgreSQL only when configured or when a test injects a store. */
export async function initializeOptionalPostgresAgentStore<
  T extends { initialize(): Promise<unknown> },
>(
  databaseUrl: string | undefined,
  storeOverride: T | undefined,
  createStore: () => T,
): Promise<T | null> {
  if (!(typeof databaseUrl === 'string' && databaseUrl.trim()) && !storeOverride) {
    return null;
  }
  const store = storeOverride ?? createStore();
  await store.initialize();
  return store;
}
