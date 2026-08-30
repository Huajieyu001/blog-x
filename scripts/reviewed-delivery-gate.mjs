import { createHash, randomBytes } from "node:crypto";
import { lstat, link, open, readFile, readdir, realpath, unlink } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runBoundedChildTree } from "./local-delivery-child-tree.mjs";
import { deliveryAuthorityForRevision } from "./refresh-local-runtime-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const reviewRelativePath = ".planning/phases/08-reliable-local-delivery/08-REVIEW-V2.md";
const reviewPhase = "08-reliable-local-delivery";
const expectedBranch = "refs/heads/dev";
const verifierPath = resolve(root, "scripts/refresh-local.mjs");
const evidenceSuccess = "LOCAL REFRESH EVIDENCE VERIFIED; RELEASE BLOCKED\n";

export const COMMITTED_REVIEW_PATH = resolve(root, ".planning/phases/08-reliable-local-delivery/08-REVIEW.md");
export const COMMITTED_REVIEW_V2_PATH = resolve(root, reviewRelativePath);
export const REVIEW_CONFIG_PATH = resolve(root, ".planning/config.json");
export const FINAL_REVIEW_PATH = "/private/tmp/blog-x-phase08-final-review.md";
export const FINAL_REVIEW_V2_PATH = "/private/tmp/blog-x-phase08-final-review-v2.md";
export const REVIEWED_HEAD_MARKER_PATH = "/private/tmp/blog-x-phase08-reviewed-head-v1.json";
export const REVIEWED_HEAD_MARKER_V2_PATH = "/private/tmp/blog-x-phase08-reviewed-head-v2.json";
export const REVIEWED_DELIVERY_FILES = Object.freeze([
  "apps/api/package.json",
  "apps/web/e2e/article-lifecycle.spec.ts",
  "apps/web/e2e/auth-session.spec.ts",
  "apps/web/e2e/draft-preview.spec.ts",
  "apps/web/e2e/public-list.spec.ts",
  "apps/web/e2e/public-reading.spec.ts",
  "apps/web/e2e/walking-skeleton.spec.ts",
  "ops/local-deliveries/.gitkeep",
  "package.json",
  "scripts/default-test.mjs",
  "scripts/default-test.test.mjs",
  "scripts/local-delivery-acceptance-test-core.mjs",
  "scripts/local-delivery-acceptance.mjs",
  "scripts/local-verify.mjs",
  "scripts/local-verify.test.mjs",
  "scripts/phase7-browser-verify.mjs",
  "scripts/refresh-local-live.mjs",
  "scripts/refresh-local-runtime-core.mjs",
  "scripts/refresh-local-test-core.mjs",
  "scripts/refresh-local.mjs",
  "scripts/refresh-local.test.mjs",
  "scripts/reviewed-delivery-gate.mjs",
  "scripts/reviewed-delivery-gate.test.mjs",
  "scripts/test-inventory.mjs",
  "scripts/test-inventory.test.mjs",
]);
export const REVIEWED_DELIVERY_V2_FILES = Object.freeze([
  "apps/api/package.json",
  "apps/web/e2e/article-lifecycle.spec.ts",
  "apps/web/e2e/auth-session.spec.ts",
  "apps/web/e2e/draft-preview.spec.ts",
  "apps/web/e2e/public-list.spec.ts",
  "apps/web/e2e/public-reading.spec.ts",
  "apps/web/e2e/walking-skeleton.spec.ts",
  "ops/local-deliveries/.gitkeep",
  "package.json",
  "scripts/default-test.mjs",
  "scripts/default-test.test.mjs",
  "scripts/local-delivery-acceptance-test-core.mjs",
  "scripts/local-delivery-acceptance.mjs",
  "scripts/local-delivery-child-tree.mjs",
  "scripts/local-verify.mjs",
  "scripts/local-verify.test.mjs",
  "scripts/phase7-browser-verify.mjs",
  "scripts/refresh-local-live.mjs",
  "scripts/refresh-local-runtime-core.mjs",
  "scripts/refresh-local-test-core.mjs",
  "scripts/refresh-local.mjs",
  "scripts/refresh-local.test.mjs",
  "scripts/reviewed-delivery-gate.mjs",
  "scripts/reviewed-delivery-gate.test.mjs",
  "scripts/test-inventory.mjs",
  "scripts/test-inventory.test.mjs",
]);

const MODES = Object.freeze([
  "--assert-committed-review-clean",
  "--assert-handoff-absent",
  "--record-reviewed-head",
  "--assert-reviewed-head",
  "--preflight-delivery",
  "--verify-evidence",
  "--assert-review-unchanged",
  "--assert-clean",
]);
const markerKeys = Object.freeze([
  "format", "version", "branchRef", "reviewedHead", "reviewPath", "reviewSha256",
  "finalReviewPath", "finalReviewSha256", "authority", "evidencePath", "claimPath",
  "failurePath", "sha256",
]);

function fail(message) { throw new Error(`reviewed delivery gate: ${message}`); }
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function mode(item) { return item.mode & 0o7777; }
function isMissing(error) { return error?.code === "ENOENT"; }
function validRevision(value) { return typeof value === "string" && /^[a-f0-9]{40}$/.test(value); }
function validDigest(value) { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
function same(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !same(Object.keys(value).sort(), [...keys].sort())) {
    fail(`${label} keys are not exact`);
  }
}

function oneMatch(text, pattern, label) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) fail(`review ${label} is missing, duplicated or malformed`);
  return matches[0][1];
}

function parseCleanReview(bytes, label) {
  const text = String(bytes);
  if (text.includes("\r")) fail(`${label} review line endings are not canonical`);
  const envelope = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!envelope) fail(`${label} review format is malformed`);
  const frontmatter = envelope[1];
  const body = envelope[2];
  const phase = oneMatch(frontmatter, /^phase: ([^\n]+)$/gm, "phase");
  const depth = oneMatch(frontmatter, /^depth: (quick|standard|deep)$/gm, "depth");
  const filesReviewedText = oneMatch(frontmatter, /^files_reviewed: ([0-9]+)$/gm, "files_reviewed");
  const status = oneMatch(frontmatter, /^status: ([a-z_]+)$/gm, "status");
  const critical = Number(oneMatch(frontmatter, /^  critical: ([0-9]+)$/gm, "critical findings"));
  const warning = Number(oneMatch(frontmatter, /^  warning: ([0-9]+)$/gm, "warning findings"));
  const info = Number(oneMatch(frontmatter, /^  info: ([0-9]+)$/gm, "info findings"));
  const total = Number(oneMatch(frontmatter, /^  total: ([0-9]+)$/gm, "total findings"));
  const listBlock = /(?:^|\n)files_reviewed_list:\n((?:  - [^\n]+\n?)+)(?=findings:\n)/.exec(`${frontmatter}\n`);
  if (!listBlock) fail(`${label} review files list is missing or malformed`);
  const files = [...listBlock[1].matchAll(/^  - ([^\n]+)$/gm)].map((match) => match[1]);
  const filesReviewed = Number(filesReviewedText);
  const heads = [...body.matchAll(/^\*\*Reviewed HEAD:\*\* `([a-f0-9]{40})`$/gm)].map((match) => match[1]);
  if (phase !== reviewPhase) fail(`${label} review phase is not exact`);
  if (!Number.isSafeInteger(filesReviewed) || filesReviewed < 1 || files.length !== filesReviewed || new Set(files).size !== files.length) {
    fail(`${label} review file count or list is malformed`);
  }
  if (depth !== "standard") fail(`${label} review depth must be standard`);
  if (!same(files, REVIEWED_DELIVERY_V2_FILES)) fail(`${label} review scope is not the exact configured delivery file list`);
  if (status !== "clean" || critical !== 0 || warning !== 0 || info !== 0 || total !== 0 || total !== critical + warning + info) {
    fail(`${label} review is not clean with zero findings`);
  }
  if (heads.length !== 1 || !validRevision(heads[0])) fail(`${label} review has no single valid Reviewed HEAD`);
  return Object.freeze({ bytes: text, phase, depth, filesReviewed, files: Object.freeze(files), reviewedHead: heads[0] });
}

function markerBytes(body) {
  return `${JSON.stringify({ ...body, sha256: digest(JSON.stringify(body)) })}\n`;
}

function minimalEnvironment(ambient = process.env) {
  const take = (key, fallback = "") => typeof ambient[key] === "string" && ambient[key] ? ambient[key] : fallback;
  return Object.freeze({
    PATH: take("PATH"),
    HOME: take("HOME"),
    TMPDIR: take("TMPDIR", "/tmp"),
    LANG: take("LANG", "C"),
    LC_ALL: take("LC_ALL", "C"),
  });
}

async function nativeRun(command, args) {
  const stdout = await runBoundedChildTree(command, args, {
    cwd: root,
    env: minimalEnvironment(),
    maximumOutputBytes: 4 * 1024 * 1024,
    timeoutMs: 120_000,
    terminationGraceMs: 5_000,
    killGraceMs: 3_000,
  });
  return { stdout };
}

const nativeFs = { lstat, link, open, readFile, readdir, realpath, unlink };

/** Fixed paths and Git identity are intentionally not injectable. Tests inject I/O only. */
export function createReviewedDeliveryGateRuntime({
  fs = nativeFs,
  run = nativeRun,
  identity = { uid: process.getuid?.() },
  randomHex = () => randomBytes(12).toString("hex"),
  ...unexpected
} = {}) {
  if (Object.keys(unexpected).length) fail("authority path, SHA and extra option overrides are forbidden");
  if (!Number.isSafeInteger(identity.uid) || identity.uid < 0) fail("filesystem identity is invalid");

  async function entry(path) {
    try { return await fs.lstat(path); }
    catch (error) { if (isMissing(error)) return undefined; throw error; }
  }

  async function assertDirectory(path, uid, expectedMode) {
    const item = await entry(path);
    if (!item?.isDirectory?.() || item.isSymbolicLink?.() || item.uid !== uid || mode(item) !== expectedMode || await fs.realpath(path) !== path) {
      fail(`directory authority ${path} is unsafe`);
    }
  }

  async function assertPrivateParents() {
    await assertDirectory("/private", 0, 0o755);
    await assertDirectory("/private/tmp", 0, 0o1777);
  }

  async function assertSecureFile(path, expectedMode, label, { requireSingleLink = true } = {}) {
    const item = await entry(path);
    if (!item?.isFile?.() || item.isSymbolicLink?.() || item.uid !== identity.uid || mode(item) !== expectedMode
      || (requireSingleLink && item.nlink !== 1) || await fs.realpath(path) !== path) {
      fail(`${label} authority is unsafe`);
    }
    return String(await fs.readFile(path, "utf8"));
  }

  async function scanHandoff({ allowFinal = false, allowMarker = false } = {}) {
    await assertPrivateParents();
    const names = await fs.readdir("/private/tmp");
    const finalName = basename(FINAL_REVIEW_V2_PATH);
    const markerName = basename(REVIEWED_HEAD_MARKER_V2_PATH);
    const finalStem = finalName.replace(/\.md$/, "");
    const markerStem = markerName.replace(/\.json$/, "");
    const conflicting = names.filter((name) =>
      ((name.startsWith(finalStem) || name.startsWith(`.${finalName}.`)) && !(allowFinal && name === finalName))
      || ((name.startsWith(markerStem) || name.startsWith(`.${markerName}.`)) && !(allowMarker && name === markerName)));
    if (conflicting.length) fail(`handoff paths are ambiguous: ${conflicting.sort().join(",")}`);
  }

  async function readCommittedReview() {
    const configBytes = await assertSecureFile(REVIEW_CONFIG_PATH, 0o644, "review configuration");
    let config;
    try { config = JSON.parse(configBytes); } catch { fail("configured code review JSON is malformed"); }
    if (config?.workflow?.code_review !== true || config.workflow.code_review_depth !== "standard") {
      fail("configured code review must remain enabled at standard depth");
    }
    const bytes = await assertSecureFile(COMMITTED_REVIEW_V2_PATH, 0o644, "committed review");
    return parseCleanReview(bytes, "committed");
  }

  async function assertGitClean() {
    const result = await run("git", ["status", "--porcelain=v1", "--untracked-files=all"]);
    if (!result || result.stdout !== "") fail("Git worktree is not clean, including untracked files");
  }

  async function readGitIdentity() {
    await assertGitClean();
    const branch = await run("git", ["symbolic-ref", "--quiet", "HEAD"]);
    if (branch?.stdout !== `${expectedBranch}\n`) fail("Git branch must be exactly dev");
    const revision = await run("git", ["rev-parse", "HEAD"]);
    if (!validRevision(revision?.stdout?.slice(0, -1)) || revision.stdout !== `${revision.stdout.slice(0, -1)}\n`) {
      fail("Git HEAD must be one lowercase full SHA");
    }
    return revision.stdout.slice(0, -1);
  }

  function validateEnvironment(environment) {
    if (!environment || typeof environment !== "object" || Array.isArray(environment)) fail("environment authority is invalid");
    const overrides = Object.keys(environment).filter((key) => /^BLOG_X_(?:REVIEW|DELIVERY|PHASE08|FINAL_REVIEW|REVIEWED_HEAD)/.test(key)).sort();
    if (overrides.length) fail(`environment authority overrides are forbidden: ${overrides.join(",")}`);
  }

  async function syncPrivateTmp() {
    const handle = await fs.open("/private/tmp", "r");
    try { await handle.sync(); } finally { await handle.close(); }
  }

  async function publishMarker(bytes) {
    const suffix = randomHex();
    if (!/^[a-f0-9]{24}$/.test(suffix)) fail("marker temporary token is invalid");
    const tempPath = `/private/tmp/.${basename(REVIEWED_HEAD_MARKER_V2_PATH)}.${suffix}.tmp`;
    let handle;
    let tempExists = false;
    let linked = false;
    try {
      handle = await fs.open(tempPath, "wx", 0o600);
      tempExists = true;
      await handle.writeFile(bytes, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await assertSecureFile(tempPath, 0o600, "marker temporary file");
      if (await entry(REVIEWED_HEAD_MARKER_V2_PATH)) fail("reviewed marker is already published");
      try { await fs.link(tempPath, REVIEWED_HEAD_MARKER_V2_PATH); }
      catch (error) { if (error?.code === "EEXIST") fail("reviewed marker is already published"); throw error; }
      linked = true;
      await assertSecureFile(REVIEWED_HEAD_MARKER_V2_PATH, 0o600, "reviewed marker", { requireSingleLink: false });
      await syncPrivateTmp();
      await fs.unlink(tempPath);
      tempExists = false;
      await syncPrivateTmp();
      await assertSecureFile(REVIEWED_HEAD_MARKER_V2_PATH, 0o600, "reviewed marker");
    } catch (error) {
      try { if (handle) await handle.close(); }
      catch (closeError) { throw new AggregateError([error, closeError], "reviewed marker close invariant failed"); }
      if (linked) {
        try { await fs.unlink(REVIEWED_HEAD_MARKER_V2_PATH); linked = false; await syncPrivateTmp(); }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "reviewed marker cleanup invariant failed"); }
      }
      if (tempExists) {
        try { await fs.unlink(tempPath); tempExists = false; }
        catch (cleanupError) { throw new AggregateError([error, cleanupError], "reviewed marker temporary cleanup invariant failed"); }
      }
      throw error;
    }
  }

  async function readMarker() {
    await scanHandoff({ allowFinal: true, allowMarker: true });
    const bytes = await assertSecureFile(REVIEWED_HEAD_MARKER_V2_PATH, 0o600, "reviewed marker");
    let marker;
    try { marker = JSON.parse(bytes); } catch { fail("reviewed marker JSON is malformed"); }
    exactKeys(marker, markerKeys, "reviewed marker");
    const { sha256, ...body } = marker;
    if (markerBytes(body) !== bytes || !validDigest(sha256)) fail("reviewed marker digest or canonical bytes are invalid");
    if (body.format !== "blog-x-phase08-reviewed-head" || body.version !== 2 || body.branchRef !== expectedBranch
      || !validRevision(body.reviewedHead) || body.reviewPath !== reviewRelativePath || !validDigest(body.reviewSha256)
      || body.finalReviewPath !== FINAL_REVIEW_V2_PATH || !validDigest(body.finalReviewSha256)) {
      fail("reviewed marker schema or fixed authority is invalid");
    }
    const authority = deliveryAuthorityForRevision(body.reviewedHead);
    if (body.authority !== authority.authority || body.evidencePath !== authority.evidencePath
      || body.claimPath !== authority.claimPath || body.failurePath !== authority.failurePath) {
      fail("reviewed marker delivery authority is invalid");
    }
    const finalBytes = await assertSecureFile(FINAL_REVIEW_V2_PATH, 0o600, "final review");
    const finalReview = parseCleanReview(finalBytes, "final");
    if (digest(finalBytes) !== body.finalReviewSha256 || finalReview.reviewedHead !== body.reviewedHead) {
      fail("final review changed after marker recording");
    }
    return Object.freeze({ marker, body, authority });
  }

  async function assertReviewedHead() {
    const state = await readMarker();
    const revision = await readGitIdentity();
    if (revision !== state.body.reviewedHead) fail("current HEAD differs from reviewed HEAD");
    return state;
  }

  async function assertAuthorityAbsent(path, label) {
    if (await entry(path)) fail(`${label} must be absent before delivery`);
  }

  return Object.freeze({
    async execute(argv, environment = process.env) {
      validateEnvironment(environment);
      if (!Array.isArray(argv) || argv.length !== 1 || !MODES.includes(argv[0])) fail("exactly one fixed mode argument is required");
      const selected = argv[0];
      if (selected === "--assert-committed-review-clean") return readCommittedReview();
      if (selected === "--assert-handoff-absent") {
        await scanHandoff();
        if (await entry(FINAL_REVIEW_V2_PATH) || await entry(REVIEWED_HEAD_MARKER_V2_PATH)) fail("handoff artifacts must be absent");
        return { absent: true };
      }
      if (selected === "--assert-clean") { await assertGitClean(); return { clean: true }; }
      if (selected === "--record-reviewed-head") {
        await scanHandoff({ allowFinal: true, allowMarker: true });
        if (await entry(REVIEWED_HEAD_MARKER_V2_PATH)) fail("reviewed marker is already published");
        const revision = await readGitIdentity();
        const finalBytes = await assertSecureFile(FINAL_REVIEW_V2_PATH, 0o600, "final review");
        const finalReview = parseCleanReview(finalBytes, "final");
        const committedReview = await readCommittedReview();
        if (finalReview.reviewedHead !== revision) fail("final review HEAD differs from current HEAD");
        if (finalReview.depth !== committedReview.depth || finalReview.filesReviewed !== committedReview.filesReviewed
          || !same(finalReview.files, committedReview.files)) fail("final review scope differs from committed review scope");
        const authority = deliveryAuthorityForRevision(revision);
        const body = {
          format: "blog-x-phase08-reviewed-head",
          version: 2,
          branchRef: expectedBranch,
          reviewedHead: revision,
          reviewPath: reviewRelativePath,
          reviewSha256: digest(committedReview.bytes),
          finalReviewPath: FINAL_REVIEW_V2_PATH,
          finalReviewSha256: digest(finalBytes),
          authority: authority.authority,
          evidencePath: authority.evidencePath,
          claimPath: authority.claimPath,
          failurePath: authority.failurePath,
        };
        const bytes = markerBytes(body);
        await publishMarker(bytes);
        return JSON.parse(bytes);
      }
      if (selected === "--assert-reviewed-head") return assertReviewedHead();
      if (selected === "--preflight-delivery") {
        const state = await assertReviewedHead();
        await assertAuthorityAbsent(resolve(root, state.authority.evidencePath), "delivery receipt");
        await assertAuthorityAbsent(state.authority.claimPath, "delivery claim");
        await assertAuthorityAbsent(state.authority.failurePath, "delivery failure report");
        return state;
      }
      if (selected === "--verify-evidence") {
        const state = await readMarker();
        const result = await run(process.execPath, [verifierPath, `--verify-evidence=${state.authority.evidencePath}`]);
        if (result?.stdout !== evidenceSuccess) fail("production evidence verifier did not return the exact success marker");
        return state;
      }
      if (selected === "--assert-review-unchanged") {
        const state = await readMarker();
        const review = await readCommittedReview();
        if (digest(review.bytes) !== state.body.reviewSha256) fail("committed review digest changed after marker recording");
        return state;
      }
      fail("unreachable mode");
    },
  });
}

async function main() {
  await createReviewedDeliveryGateRuntime().execute(process.argv.slice(2), process.env);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
