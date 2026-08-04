/**
 * db.ts — read-only access to the agent's SQLite decision log.
 *
 * Opens the database at `path` in read-only mode. Throws DB_MISSING if the
 * file does not exist. Never executes CREATE TABLE or INSERT — this CLI only
 * reads what the live agent loop writes.
 */

import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";

export class DbError extends Error {
  constructor(
    public readonly code: "DB_MISSING",
    public readonly detail: string,
  ) {
    super(detail);
    this.name = "DbError";
  }
}

export function openDecisionsRead(path: string): Database {
  if (!existsSync(path)) {
    throw new DbError("DB_MISSING", `Database file not found: ${path}`);
  }
  return new Database(path, { readonly: true });
}
