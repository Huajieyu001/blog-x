import assert from "node:assert/strict";
import test from "node:test";
import { installTrustedApiForwarding } from "./server.mjs";

test("the Web edge replaces browser-controlled forwarding headers before an API rewrite", () => {
  const request = {
    url: "/api/public/articles/example/view",
    headers: {
      forwarded: "for=198.51.100.99",
      "x-forwarded-for": "198.51.100.99",
      "x-forwarded-host": "spoofed.invalid",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
    },
    socket: { remoteAddress: "198.51.100.8" },
  };
  installTrustedApiForwarding(request);
  assert.deepEqual(request.headers, { "x-forwarded-for": "198.51.100.8" });
});

test("the Web edge does not add forwarding data to non-API traffic", () => {
  const request = { url: "/posts/example", headers: { "x-forwarded-for": "198.51.100.99" }, socket: { remoteAddress: "198.51.100.8" } };
  installTrustedApiForwarding(request);
  assert.deepEqual(request.headers, { "x-forwarded-for": "198.51.100.99" });
});
