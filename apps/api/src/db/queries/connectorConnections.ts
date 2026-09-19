import type { ConnectedConnector } from "@teardown/core/api-contract";
import { sql } from "../client.js";

// The connectors a user has authorised, without their tokens.
export async function listConnectorsForUser(
  userId: string,
): Promise<ConnectedConnector[]> {
  const rows = await sql<
    { connector: "notion"; workspace_name: string | null }[]
  >`
    select connector, workspace_name
    from connector_connections
    where user_id = ${userId}
    order by created_at
  `;
  return rows.map((row) => ({
    connector: row.connector,
    workspaceName: row.workspace_name,
  }));
}
