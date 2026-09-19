import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runMonitor } from "./ops-monitor.mjs";
test("monitor records a secret-free terminal outcome", async () => { const resultRoot = await mkdtemp(join(tmpdir(), "blog-x-monitor-")); const stateRoot = await mkdtemp(join(tmpdir(), "blog-x-monitor-")); const lines=[]; const result=await runMonitor({ policy:{role:"edge",resultRoot,stateRoot}, facts:{}, provider:{kind:"stdout"}, write:(line)=>lines.push(line) }); assert.equal(result.outcome.format,"blog-x-monitor-outcome"); assert.doesNotMatch(lines.join(""),/secret|postgres|http/i); assert.equal(result.exitCode,1); });
