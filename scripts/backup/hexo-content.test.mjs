import assert from "node:assert/strict";
import { cp, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createHexoContentBackup, parseHexoBackupArguments, verifyHexoContentBackup } from "./hexo-content.mjs";

const projectRoot = new URL("../../", import.meta.url);

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "blog-x-hexo-fixture-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "backups"), { recursive: true });
  for (const file of ["hexo-source-20260805.tar.gz", "hexo-published-20260805.tar.gz", "SHA256SUMS"]) {
    await cp(new URL(`../../backups/${file}`, import.meta.url), join(root, "backups", file));
  }
  return root;
}

const setId = "20260915T000000Z-a1b2c3d4";

const digest = (value) => createHash("sha256").update(value).digest("hex");

async function retainedDigests(root) {
  return Promise.all(["hexo-source-20260805.tar.gz", "hexo-published-20260805.tar.gz"].map(async (file) => digest(await readFile(join(root, "backups", file)))));
}

test("only accepts the package-manager delimiter plus one exact create or verify argument", () => {
  assert.deepEqual(parseHexoBackupArguments([]), { mode: "create" });
  assert.deepEqual(parseHexoBackupArguments(["--", `--set-id=${setId}`]), { mode: "create", setId });
  assert.deepEqual(parseHexoBackupArguments([`--verify-set=${setId}`]), { mode: "verify", setId });
  for (const argumentsList of [["--unknown"], ["--set-id=bad"], [`--set-id=${setId}`, `--verify-set=${setId}`], ["--", "--"]]) {
    assert.throws(() => parseHexoBackupArguments(argumentsList), /arguments|set id/i);
  }
});

test("creates and verifies a source-only, provenance-bound backup from retained Hexo archives", async (context) => {
  const root = await fixture(context);
  const originalsBefore = await retainedDigests(root);
  const result = await createHexoContentBackup({ repositoryRoot: root, setId, now: () => new Date("2026-09-15T00:00:00.000Z") });
  assert.equal(result.setId, setId);
  const verified = await verifyHexoContentBackup({ repositoryRoot: root, setId });
  assert.equal(verified.manifest.format, "blog-x-hexo-content-backup");
  assert.equal(verified.manifest.members.some((member) => member.path.endsWith(".md")), true);
  assert.equal(verified.manifest.members.every((member) => member.path.startsWith("myBlog/source/")), true);
  assert.deepEqual((await readFile(join(root, "backups", "SHA256SUMS"), "utf8")).trim().split("\n").length, 2);
  assert.deepEqual(await retainedDigests(root), originalsBefore);
});

test("rejects malformed input, final collisions, source tampering, and unsafe output IDs", async (context) => {
  const root = await fixture(context);
  const originalsBefore = await retainedDigests(root);
  await assert.rejects(createHexoContentBackup({ repositoryRoot: root, setId: "../escape" }), /set id/i);
  await createHexoContentBackup({ repositoryRoot: root, setId });
  const manifest = await readFile(join(root, "backups", "hexo-migration", setId, "manifest.json"));
  await assert.rejects(createHexoContentBackup({ repositoryRoot: root, setId }), /collision/i);
  assert.deepEqual(await readFile(join(root, "backups", "hexo-migration", setId, "manifest.json")), manifest);
  assert.deepEqual(await retainedDigests(root), originalsBefore);
  await writeFile(join(root, "backups", "hexo-source-20260805.tar.gz"), "tampered");
  await assert.rejects(verifyHexoContentBackup({ repositoryRoot: root, setId }), /checksum/i);
});

test("verification rejects tampered payloads, missing or extra members, and links", async (context) => {
  const root = await fixture(context);
  await createHexoContentBackup({ repositoryRoot: root, setId });
  const directory = join(root, "backups", "hexo-migration", setId);
  await writeFile(join(directory, "extra.txt"), "extra");
  await assert.rejects(verifyHexoContentBackup({ repositoryRoot: root, setId }), /exactly/i);
  await rm(join(directory, "extra.txt"));
  await writeFile(join(directory, "SHA256SUMS"), "0".repeat(64) + "  hexo-content.tar.gz\n" + "0".repeat(64) + "  manifest.json\n");
  await assert.rejects(verifyHexoContentBackup({ repositoryRoot: root, setId }), /checksum/i);
  await createHexoContentBackup({ repositoryRoot: root, setId: "20260915T000001Z-b1b2c3d4" });
  const linkDirectory = join(root, "backups", "hexo-migration", "20260915T000001Z-b1b2c3d4");
  await rm(join(linkDirectory, "manifest.json"));
  await symlink(join(linkDirectory, "hexo-content.tar.gz"), join(linkDirectory, "manifest.json"));
  await assert.rejects(verifyHexoContentBackup({ repositoryRoot: root, setId: "20260915T000001Z-b1b2c3d4" }), /non-linked|link/i);
  assert.equal((await lstat(join(linkDirectory, "manifest.json"))).isSymbolicLink(), true);
});

test("verification re-reads packed bytes instead of trusting a re-checksummed manifest", async (context) => {
  const root = await fixture(context);
  await createHexoContentBackup({ repositoryRoot: root, setId });
  const directory = join(root, "backups", "hexo-migration", setId);
  const manifestPath = join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.members[0].sha256 = "0".repeat(64);
  const manifestText = `${JSON.stringify(manifest)}\n`;
  await writeFile(manifestPath, manifestText);
  await writeFile(join(directory, "SHA256SUMS"), `${manifest.contentArchive.sha256}  hexo-content.tar.gz\n${digest(manifestText)}  manifest.json\n`);
  await assert.rejects(verifyHexoContentBackup({ repositoryRoot: root, setId }), /mismatch/i);
});
