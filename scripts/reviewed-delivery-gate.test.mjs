import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
  COMMITTED_REVIEW_PATH,
  COMMITTED_REVIEW_V2_PATH,
  FINAL_REVIEW_PATH,
  FINAL_REVIEW_V2_PATH,
  REVIEW_CONFIG_PATH,
  REVIEWED_DELIVERY_FILES,
  REVIEWED_DELIVERY_V2_FILES,
  REVIEWED_HEAD_MARKER_PATH,
  REVIEWED_HEAD_MARKER_V2_PATH,
  createReviewedDeliveryGateRuntime,
} from "./reviewed-delivery-gate.mjs";
import { deliveryAuthorityForRevision } from "./refresh-local-runtime-core.mjs";

const REVISION = "a".repeat(40);
const NEXT_REVISION = "b".repeat(40);
const HISTORICAL_REVISION = "9".repeat(40);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const reviewConfig = ({ enabled = true, depth = "standard" } = {}) => `${JSON.stringify({ workflow: { code_review: enabled, code_review_depth: depth } }, null, 2)}\n`;
const review = (head = REVISION, {
  status = "clean",
  depth = "standard",
  files = REVIEWED_DELIVERY_V2_FILES,
  findings = { critical: 0, warning: 0, info: 0, total: 0 },
} = {}) => `---\nphase: 08-reliable-local-delivery\nreviewed: 2026-08-30T00:00:00Z\ndepth: ${depth}\nfiles_reviewed: ${files.length}\nfiles_reviewed_list:\n${files.map((path) => `  - ${path}`).join("\n")}\nfindings:\n  critical: ${findings.critical}\n  warning: ${findings.warning}\n  info: ${findings.info}\n  total: ${findings.total}\nstatus: ${status}\n---\n\n# Phase 08: Code Review Report\n\n**Reviewed HEAD:** \`${head}\`\n`;

function missing(code = "ENOENT") { return Object.assign(new Error(code), { code }); }
function memoryFs() {
  const uid = 501;
  const historicalAuthority = deliveryAuthorityForRevision(HISTORICAL_REVISION);
  const historicalPaths = [
    COMMITTED_REVIEW_PATH,
    FINAL_REVIEW_PATH,
    REVIEWED_HEAD_MARKER_PATH,
    historicalAuthority.claimPath,
    historicalAuthority.failurePath,
  ];
  const entries = new Map([
    ["/private", { kind: "dir", uid: 0, mode: 0o755 }],
    ["/private/tmp", { kind: "dir", uid: 0, mode: 0o1777 }],
    [COMMITTED_REVIEW_PATH, { kind: "file", uid, mode: 0o644, nlink: 1, bytes: review(HISTORICAL_REVISION, { files: REVIEWED_DELIVERY_FILES }) }],
    [FINAL_REVIEW_PATH, { kind: "file", uid, mode: 0o600, nlink: 1, bytes: "historical-v1-final-review-bytes\n" }],
    [REVIEWED_HEAD_MARKER_PATH, { kind: "file", uid, mode: 0o600, nlink: 1, bytes: "historical-v1-marker-bytes\n" }],
    [historicalAuthority.claimPath, { kind: "file", uid, mode: 0o600, nlink: 1, bytes: "historical-v1-claim-bytes\n" }],
    [historicalAuthority.failurePath, { kind: "file", uid, mode: 0o600, nlink: 1, bytes: "historical-v1-failure-bytes\n" }],
    [COMMITTED_REVIEW_V2_PATH, { kind: "file", uid, mode: 0o644, nlink: 1, bytes: review() }],
    [REVIEW_CONFIG_PATH, { kind: "file", uid, mode: 0o644, nlink: 1, bytes: reviewConfig() }],
    [FINAL_REVIEW_V2_PATH, { kind: "file", uid, mode: 0o600, nlink: 1, bytes: review() }],
  ]);
  const reads = [];
  const writes = [];
  const unlinks = [];
  const stat = (item) => ({ uid: item.uid, mode: item.mode, nlink: item.nlink ?? 1, isFile: () => item.kind === "file", isDirectory: () => item.kind === "dir", isSymbolicLink: () => item.kind === "symlink" });
  return {
    uid,
    entries,
    historicalPaths,
    reads,
    writes,
    unlinks,
    fs: {
      async lstat(path) { const item = entries.get(path); if (!item) throw missing(); return stat(item); },
      async realpath(path) { const item = entries.get(path); if (!item) throw missing(); return item.realpath ?? path; },
      async readFile(path) { const item = entries.get(path); if (!item) throw missing(); reads.push(path); return item.bytes; },
      async readdir(path) { if (path !== "/private/tmp") throw missing(); return [...entries.keys()].filter((key) => key.startsWith("/private/tmp/")).map((key) => key.slice("/private/tmp/".length)); },
      async open(path, flags, mode) {
        if (flags === "r") return { async sync() {}, async close() {} };
        if (flags === "wx" && entries.has(path)) throw missing("EEXIST");
        entries.set(path, { kind: "file", uid, mode, nlink: 1, bytes: "" });
        return { async writeFile(bytes) { writes.push(path); entries.get(path).bytes = bytes; }, async sync() {}, async close() {} };
      },
      async link(source, target) { if (entries.has(target)) throw missing("EEXIST"); entries.set(target, { ...entries.get(source), nlink: 1 }); },
      async unlink(path) { if (!entries.delete(path)) throw missing(); unlinks.push(path); },
    },
  };
}

function historicalSnapshot(f) {
  return Object.fromEntries(f.historicalPaths.map((path) => [path, f.entries.get(path)?.bytes]));
}

function fixture({ head = REVISION, status = "", branch = "refs/heads/dev" } = {}) {
  const memory = memoryFs();
  const calls = [];
  const git = { head, status, branch };
  const run = async (command, args) => {
    calls.push([command, args]);
    if (command === "git" && args.join(" ") === "status --porcelain=v1 --untracked-files=all") return { stdout: git.status };
    if (command === "git" && args.join(" ") === "symbolic-ref --quiet HEAD") return { stdout: `${git.branch}\n` };
    if (command === "git" && args.join(" ") === "rev-parse HEAD") return { stdout: `${git.head}\n` };
    if (command === process.execPath && args[0]?.endsWith("scripts/refresh-local.mjs")) return { stdout: "LOCAL REFRESH EVIDENCE VERIFIED; RELEASE BLOCKED\n" };
    throw new Error(`unexpected command ${command} ${args.join(" ")}`);
  };
  return { ...memory, calls, git, runtime: createReviewedDeliveryGateRuntime({ fs: memory.fs, run, identity: { uid: memory.uid }, randomHex: () => "c".repeat(24) }) };
}

async function record(f = fixture()) { await f.runtime.execute(["--record-reviewed-head"], {}); return f; }

test("committed review assertion requires strict clean GSD report with zero findings", async () => {
  const good = fixture();
  await good.runtime.execute(["--assert-committed-review-clean"], {});
  for (const bytes of [review(REVISION, { status: "issues_found" }), review(REVISION, { findings: { critical: 0, warning: 1, info: 0, total: 1 } }), "not yaml"]) {
    const bad = fixture(); bad.entries.get(COMMITTED_REVIEW_V2_PATH).bytes = bytes;
    await assert.rejects(bad.runtime.execute(["--assert-committed-review-clean"], {}), /review|clean|finding|format/i);
  }
  assert.equal(REVIEWED_DELIVERY_V2_FILES.length, 27);
  assert.equal(new Set(REVIEWED_DELIVERY_V2_FILES).size, 27);
  assert.deepEqual(REVIEWED_DELIVERY_V2_FILES.filter((path) => !REVIEWED_DELIVERY_FILES.includes(path)), [
    "apps/web/app/admin/_components/ArticleEditor.tsx",
    "scripts/local-delivery-child-tree.mjs",
  ]);
  for (const files of [REVIEWED_DELIVERY_V2_FILES.slice(1), [...REVIEWED_DELIVERY_V2_FILES, "scripts/alias.mjs"], [...REVIEWED_DELIVERY_V2_FILES].reverse(), [...REVIEWED_DELIVERY_V2_FILES.slice(0, -1), REVIEWED_DELIVERY_V2_FILES[0]]]) {
    const bad = fixture(); bad.entries.get(COMMITTED_REVIEW_V2_PATH).bytes = review(REVISION, { files });
    await assert.rejects(bad.runtime.execute(["--assert-committed-review-clean"], {}), /scope|file|standard/i);
  }
  const quick = fixture(); quick.entries.get(COMMITTED_REVIEW_V2_PATH).bytes = review(REVISION, { depth: "quick" });
  await assert.rejects(quick.runtime.execute(["--assert-committed-review-clean"], {}), /standard|depth/i);
  for (const config of [reviewConfig({ enabled: false }), reviewConfig({ depth: "quick" })]) {
    const bad = fixture(); bad.entries.get(REVIEW_CONFIG_PATH).bytes = config;
    await assert.rejects(bad.runtime.execute(["--assert-committed-review-clean"], {}), /configured|standard|enabled/i);
  }
});

test("handoff absence is exact and no production artifact is created by assertions", async () => {
  const f = fixture(); const before = historicalSnapshot(f); f.entries.delete(FINAL_REVIEW_V2_PATH);
  await f.runtime.execute(["--assert-handoff-absent"], {});
  assert.equal(f.entries.has(REVIEWED_HEAD_MARKER_V2_PATH), false);
  assert.deepEqual(historicalSnapshot(f), before);
  f.entries.set(FINAL_REVIEW_V2_PATH, { kind: "file", uid: f.uid, mode: 0o600, bytes: review() });
  await assert.rejects(f.runtime.execute(["--assert-handoff-absent"], {}), /handoff|absent/i);
});

test("record mode binds clean dev HEAD and review digest through one atomic fixed marker", async () => {
  const f = fixture(); const before = historicalSnapshot(f); await record(f);
  const marker = JSON.parse(f.entries.get(REVIEWED_HEAD_MARKER_V2_PATH).bytes);
  const authority = deliveryAuthorityForRevision(REVISION);
  assert.equal(marker.version, 2);
  assert.equal(marker.reviewedHead, REVISION);
  assert.equal(marker.reviewSha256, digest(review()));
  assert.equal(marker.reviewPath, ".planning/phases/08-reliable-local-delivery/08-REVIEW-V2.md");
  assert.equal(marker.finalReviewPath, FINAL_REVIEW_V2_PATH);
  assert.equal(marker.evidencePath, authority.evidencePath);
  assert.equal(marker.claimPath, authority.claimPath);
  assert.equal(marker.failurePath, authority.failurePath);
  assert.match(marker.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(historicalSnapshot(f), before);
  assert.equal(f.reads.some((path) => f.historicalPaths.includes(path)), false);
  assert.equal(f.writes.some((path) => f.historicalPaths.includes(path)), false);
  assert.equal(f.unlinks.some((path) => f.historicalPaths.includes(path)), false);
  assert.deepEqual(f.calls.slice(0, 3), [
    ["git", ["status", "--porcelain=v1", "--untracked-files=all"]],
    ["git", ["symbolic-ref", "--quiet", "HEAD"]],
    ["git", ["rev-parse", "HEAD"]],
  ]);
  await assert.rejects(f.runtime.execute(["--record-reviewed-head"], {}), /already|marker/i);
  for (const variant of [fixture({ status: "?? drift" }), fixture({ branch: "refs/heads/main" }), fixture({ head: NEXT_REVISION })]) {
    await assert.rejects(variant.runtime.execute(["--record-reviewed-head"], {}), /clean|dev|head|review/i);
  }
});

test("marker validation rejects stale HEAD malformed digest aliases permissions symlinks and ambiguity", async () => {
  const f = await record();
  await f.runtime.execute(["--assert-reviewed-head"], {});
  const stale = await record(fixture()); stale.git.head = NEXT_REVISION;
  await assert.rejects(stale.runtime.execute(["--assert-reviewed-head"], {}), /head|reviewed/i);
  const bad = await record(fixture()); bad.entries.get(REVIEWED_HEAD_MARKER_V2_PATH).mode = 0o644;
  await assert.rejects(bad.runtime.execute(["--assert-reviewed-head"], {}), /mode|authority|unsafe/i);
  const link = await record(fixture()); link.entries.get(REVIEWED_HEAD_MARKER_V2_PATH).kind = "symlink";
  await assert.rejects(link.runtime.execute(["--assert-reviewed-head"], {}), /authority|unsafe/i);
  const tampered = await record(fixture()); JSON.parse(tampered.entries.get(REVIEWED_HEAD_MARKER_V2_PATH).bytes); tampered.entries.get(REVIEWED_HEAD_MARKER_V2_PATH).bytes = tampered.entries.get(REVIEWED_HEAD_MARKER_V2_PATH).bytes.replace(/a{40}/, NEXT_REVISION);
  await assert.rejects(tampered.runtime.execute(["--assert-reviewed-head"], {}), /digest|canonical|marker/i);
  const ambiguous = await record(fixture()); ambiguous.entries.set("/private/tmp/blog-x-phase08-reviewed-head-v2.copy.json", { kind: "file", uid: ambiguous.uid, mode: 0o600, bytes: "{}" });
  await assert.rejects(ambiguous.runtime.execute(["--assert-reviewed-head"], {}), /ambiguous/i);
});

test("v2 handoff rejects only v2 aliases temporary names and duplicate publication while v1 remains historical", async () => {
  for (const path of [
    "/private/tmp/blog-x-phase08-final-review-v2.alias.md",
    "/private/tmp/.blog-x-phase08-final-review-v2.md.aaaaaaaaaaaaaaaaaaaaaaaa.tmp",
    "/private/tmp/blog-x-phase08-reviewed-head-v2.copy.json",
    "/private/tmp/.blog-x-phase08-reviewed-head-v2.json.aaaaaaaaaaaaaaaaaaaaaaaa.tmp",
  ]) {
    const f = fixture(); const before = historicalSnapshot(f);
    f.entries.set(path, { kind: "file", uid: f.uid, mode: 0o600, nlink: 1, bytes: "ambiguous" });
    await assert.rejects(f.runtime.execute(["--record-reviewed-head"], {}), /ambiguous|handoff/i, path);
    assert.deepEqual(historicalSnapshot(f), before);
  }
  const duplicate = await record(fixture()); const before = historicalSnapshot(duplicate);
  await assert.rejects(duplicate.runtime.execute(["--record-reviewed-head"], {}), /already|marker/i);
  assert.deepEqual(historicalSnapshot(duplicate), before);
});

test("preflight derives exact revision authority and requires receipt claim and failure absent", async () => {
  const f = await record(); const before = historicalSnapshot(f);
  await f.runtime.execute(["--preflight-delivery"], {});
  assert.deepEqual(historicalSnapshot(f), before);
  const authority = deliveryAuthorityForRevision(REVISION);
  for (const path of [authority.evidencePath, authority.claimPath, authority.failurePath]) {
    const exactPath = path === authority.evidencePath ? resolve(repoRoot, path) : path;
    const blocked = await record(fixture()); blocked.entries.set(exactPath, { kind: "file", uid: blocked.uid, mode: 0o600, bytes: "occupied" });
    await assert.rejects(blocked.runtime.execute(["--preflight-delivery"], {}), /receipt|claim|failure|consumed|absent/i);
  }
});

test("evidence verification uses recorded SHA without current HEAD equality and review immutability is separate", async () => {
  const f = await record(); const before = historicalSnapshot(f);
  await f.runtime.execute(["--verify-evidence"], {});
  const authority = deliveryAuthorityForRevision(REVISION);
  const [command, args] = f.calls.at(-1);
  assert.equal(command, process.execPath);
  assert.match(args[0], /scripts\/refresh-local\.mjs$/);
  assert.equal(args[1], `--verify-evidence=${authority.evidencePath}`);
  f.git.head = NEXT_REVISION;
  await f.runtime.execute(["--verify-evidence"], {});
  await f.runtime.execute(["--assert-review-unchanged"], {});
  assert.deepEqual(historicalSnapshot(f), before);
  f.entries.get(COMMITTED_REVIEW_V2_PATH).bytes += "drift";
  await assert.rejects(f.runtime.execute(["--assert-review-unchanged"], {}), /review|digest|changed/i);
});

test("CLI accepts only one fixed mode rejects overrides and assert-clean includes untracked files", async () => {
  const f = fixture();
  await assert.rejects(f.runtime.execute([], {}), /mode|argument/i);
  await assert.rejects(f.runtime.execute(["--assert-clean", "extra"], {}), /mode|argument/i);
  await assert.rejects(f.runtime.execute(["--assert-clean"], { BLOG_X_REVIEW_PATH: "/tmp/alias" }), /override|environment/i);
  await f.runtime.execute(["--assert-clean"], {});
  const dirty = fixture({ status: "?? untracked" });
  await assert.rejects(dirty.runtime.execute(["--assert-clean"], {}), /clean/i);
});
