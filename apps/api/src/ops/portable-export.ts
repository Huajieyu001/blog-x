import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../db/schema.js";
import { createExportRepository } from "../content/export-repository.js";

export async function writePortableExport(db: NodePgDatabase<typeof schema>, output: Pick<NodeJS.WriteStream, "write"> = process.stdout) {
  const archive = await createExportRepository(db).archive();
  output.write(`${JSON.stringify(archive)}\n`);
  return archive;
}
