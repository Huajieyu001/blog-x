import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_DELIVERY_IMAGE_LABEL,
  runDockerImageRetentionCli,
} from "./docker-image-retention.mjs";

const imageId = (character) => `sha256:${character.repeat(64)}`;
const containerId = (character) => character.repeat(64);

function image(id, size, label = "v1.1-offline-local-delivery", extra = {}) {
  return { Id: id, Size: size, RepoTags: [], RepoDigests: [], Config: { Labels: { "io.blog-x.refresh-kind": label } }, ...extra };
}

function runner({ listed = [], dangling = [], images = {}, containers = [], references = {}, removeError } = {}) {
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args: [...args] });
    if (command !== "docker") throw new Error("unexpected command");
    if (args.join(" ") === `image ls --quiet --no-trunc --filter label=${LOCAL_DELIVERY_IMAGE_LABEL}`) return { stdout: listed.map((id) => `${id}\n`).join("") };
    if (args.join(" ") === "image ls --quiet --no-trunc --filter dangling=true") return { stdout: dangling.map((id) => `${id}\n`).join("") };
    if (args[0] === "image" && args[1] === "inspect") return { stdout: JSON.stringify([images[args[2]]]) };
    if (args.join(" ") === "container ls --all --quiet --no-trunc") return { stdout: containers.map((id) => `${id}\n`).join("") };
    if (args[0] === "container" && args[1] === "inspect") return { stdout: JSON.stringify([{ Image: references[args[2]] }]) };
    if (args[0] === "image" && args[1] === "rm") {
      if (removeError) throw new Error(removeError);
      return { stdout: "removed\n" };
    }
    throw new Error("unexpected docker argv");
  };
  return { calls, run };
}

test("dry run is deterministic, sanitized, and excludes duplicate or container-referenced images", async () => {
  const unused = imageId("a");
  const used = imageId("b");
  const stopped = containerId("d");
  const fixture = runner({
    listed: [used, unused, unused],
    images: { [unused]: image(unused, 31), [used]: image(used, 7) },
    containers: [stopped],
    references: { [stopped]: used },
  });
  const output = [];
  const report = await runDockerImageRetentionCli({ argv: [], run: fixture.run, output: { write: (line) => output.push(line) } });
  assert.deepEqual(report, {
    format: "blog-x-docker-image-retention", version: 1, mode: "report",
    candidateImageIds: [unused], candidateCount: 1, reclaimableBytes: "31",
  });
  assert.deepEqual(JSON.parse(output.join("")), report);
  assert.doesNotMatch(output.join(""), /other|container|label|path|stderr/i);
  assert.equal(fixture.calls.some(({ args }) => args[0] === "image" && args[1] === "rm"), false);
  assert.equal(fixture.calls.filter(({ args }) => args[0] === "image" && args[1] === "inspect").length, 2);
});

test("includes exact Blog X dangling refresh images but excludes unrelated dangling images", async () => {
  const refresh = imageId("1");
  const unrelated = imageId("2");
  const referenced = imageId("3");
  const container = containerId("4");
  const fixture = runner({
    dangling: [unrelated, referenced, refresh, refresh],
    images: {
      [refresh]: image(refresh, 13, undefined, { Config: { Labels: {}, WorkingDir: "/refresh-workspace" } }),
      [referenced]: image(referenced, 17, undefined, { Config: { Labels: {}, WorkingDir: "/refresh-workspace" } }),
      [unrelated]: image(unrelated, 19, undefined, { Config: { Labels: {}, WorkingDir: "/another-project" } }),
    },
    containers: [container],
    references: { [container]: referenced },
  });
  const report = await runDockerImageRetentionCli({ argv: [], run: fixture.run, output: { write() {} } });
  assert.deepEqual(report.candidateImageIds, [refresh]);
  assert.equal(report.reclaimableBytes, "13");
});

test("apply recomputes candidates and removes only immutable unused IDs without force", async () => {
  const removable = imageId("e");
  const fixture = runner({ listed: [removable], images: { [removable]: image(removable, 5) } });
  const output = [];
  const report = await runDockerImageRetentionCli({ argv: ["--apply"], run: fixture.run, output: { write: (line) => output.push(line) } });
  assert.equal(report.mode, "apply");
  const removal = fixture.calls.find(({ args }) => args[0] === "image" && args[1] === "rm");
  assert.deepEqual(removal.args, ["image", "rm", removable]);
  assert.equal(removal.args.some((value) => /force|prune|container|volume|network|cache/i.test(value)), false);
  assert.deepEqual(JSON.parse(output.join("")), report);

  const empty = runner();
  await runDockerImageRetentionCli({ argv: ["--apply"], run: empty.run, output: { write() {} } });
  assert.equal(empty.calls.some(({ args }) => args[0] === "image" && args[1] === "rm"), false);
});

test("help and invalid flags never contact Docker", async () => {
  const fixture = runner();
  const output = [];
  await runDockerImageRetentionCli({ argv: ["--help"], run: fixture.run, output: { write: (line) => output.push(line) } });
  assert.equal(output.join(""), "Usage: corepack pnpm docker:retention [-- --apply]\n");
  await assert.rejects(() => runDockerImageRetentionCli({ argv: ["--apply", "--help"], run: fixture.run, output: { write() {} } }), /usage is invalid/i);
  await assert.rejects(() => runDockerImageRetentionCli({ argv: ["--apply=true"], run: fixture.run, output: { write() {} } }), /usage is invalid/i);
  assert.equal(fixture.calls.length, 0);
});

test("malformed daemon facts and Docker refusal fail closed without child output", async () => {
  const candidate = imageId("f");
  const malformed = runner({ listed: [candidate], images: { [candidate]: image(candidate, -1) } });
  const output = [];
  await assert.rejects(() => runDockerImageRetentionCli({ argv: [], run: malformed.run, output: { write: (line) => output.push(line) } }), /Docker image retention failed/);
  assert.equal(output.join(""), "DOCKER IMAGE RETENTION FAILED\n");

  const wrongLabel = runner({ listed: [candidate], images: { [candidate]: image(candidate, 1, "untrusted") } });
  await assert.rejects(() => runDockerImageRetentionCli({ argv: [], run: wrongLabel.run, output: { write() {} } }), /Docker image retention failed/);

  const raced = runner({ listed: [candidate], images: { [candidate]: image(candidate, 1) }, removeError: "image now used by running container /secret/path" });
  const racedOutput = [];
  await assert.rejects(() => runDockerImageRetentionCli({ argv: ["--apply"], run: raced.run, output: { write: (line) => racedOutput.push(line) } }), /Docker image retention failed/);
  assert.equal(racedOutput.join(""), "DOCKER IMAGE RETENTION FAILED\n");
  assert.doesNotMatch(racedOutput.join(""), /secret|path|running/i);
});
