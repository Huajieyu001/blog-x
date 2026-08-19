import { createHash } from "node:crypto";
import { Pool } from "pg";

export async function expireSessionToken(databaseUrl: string, token: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query(
      "update sessions set expires_at = now() - interval '1 second' where token_digest = $1",
      [createHash("sha256").update(token).digest("hex")],
    );
  } finally {
    await pool.end();
  }
}
