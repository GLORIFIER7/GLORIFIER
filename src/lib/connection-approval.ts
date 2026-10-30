export type ConnectionApprovalQuery = (
  sql: string,
  values?: unknown[],
) => Promise<{ rows: Array<Record<string, unknown>> }>;

export interface PersistConnectionApprovalInput {
  approvalId: string;
  eventId: string;
  connectionId: string;
  requestedBy: string;
  action: string;
  scope: string[];
  relatedTaskId?: string;
}

/**
 * Commit the pending approval and its audit event in one PostgreSQL statement.
 * A failure in either insert rolls back both records.
 */
export async function persistConnectionApprovalAtomically(
  query: ConnectionApprovalQuery,
  input: PersistConnectionApprovalInput,
): Promise<Record<string, unknown>> {
  const result = await query(
    `WITH inserted_approval AS (
       INSERT INTO connection_approvals
         (id,connection_id,requested_by,scope,action,related_task_id)
       VALUES($1,$2,$3,$4::jsonb,$5,$7)
       RETURNING *
     ), inserted_event AS (
       INSERT INTO connection_events(id,connection_id,event_type,actor,details)
       SELECT
         $6,
         approval.connection_id,
         'approval_requested',
         $3,
         jsonb_build_object(
           'approvalId', approval.id,
           'action', $5::text,
           'scope', $4::jsonb,
           'taskId', $7::text
         )
       FROM inserted_approval AS approval
       RETURNING id
     )
     SELECT approval.*
     FROM inserted_approval AS approval
     INNER JOIN inserted_event AS event ON TRUE`,
    [
      input.approvalId,
      input.connectionId,
      input.requestedBy,
      JSON.stringify(input.scope),
      input.action,
      input.eventId,
      input.relatedTaskId ?? null,
    ],
  );

  if (!result.rows[0]) {
    throw new Error('Connection approval and its audit event were not persisted.');
  }
  return result.rows[0];
}


/** Cache successful schema initialization and allow a failed attempt to retry. */
export function createMemoizedAsyncInitializer(initializer: () => Promise<unknown>): () => Promise<void> {
  let initialization: Promise<void> | null = null;
  return () => {
    if (initialization) return initialization;
    initialization = Promise.resolve()
      .then(initializer)
      .then(() => undefined)
      .catch((error) => {
        initialization = null;
        throw error;
      });
    return initialization;
  };
}
