import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyBackupSet } from "./manifest.mjs";

const prefix = "--backup-root=";
const root = process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
verifyBackupSet(root).then(({ manifest }) => process.stdout.write(`BACKUP VERIFIED ${manifest.setId}\n`)).catch((error) => {
  process.stderr.write(`BACKUP INVALID ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.exitCode = 1;
});

void resolve;
void fileURLToPath;
