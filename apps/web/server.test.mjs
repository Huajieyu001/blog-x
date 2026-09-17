import assert from "node:assert/strict";
import test from "node:test";
import { installFrameworkHeaderGuard, installTrustedApiForwarding } from "./server.mjs";

const development = { NODE_ENV: "development" };
const ingressSecret = "a".repeat(32);

function responseDouble(initialHeaders = {}) {
  const headers = new Map(Object.entries(initialHeaders).map(([name, value]) => [name.toLowerCase(), value]));
  const writes = [];
  return {
    headers,
    writes,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); return this; },
    removeHeader(name) { headers.delete(String(name).toLowerCase()); },
    writeHead(...args) {
      writes.push(args);
      const candidate = args.length >= 3 ? args[2] : args[1];
      if (Array.isArray(candidate)) {
        for (let index = 0; index < candidate.length; index += 2) headers.set(String(candidate[index]).toLowerCase(), candidate[index + 1]);
      } else if (candidate && typeof candidate === "object") {
        for (const [name, value] of Object.entries(candidate)) headers.set(name.toLowerCase(), value);
      }
      return this;
    },
  };
}

test("the Web custom-server boundary removes framework headers across Node response APIs", () => {
  const response = responseDouble({ "X-Powered-By": "preexisting" });
  assert.equal(installFrameworkHeaderGuard(response), response);
  assert.equal(response.headers.has("x-powered-by"), false);

  assert.equal(response.setHeader("x-PoWeReD-bY", "Next.js"), response);
  assert.equal(response.setHeader("cache-control", "no-store"), response);
  response.writeHead(200, { "X-Powered-By": "Next.js", "Content-Type": "text/html" });
  response.writeHead(201, "Created", ["x-powered-by", "Next.js", "Referrer-Policy", "strict-origin-when-cross-origin"]);

  assert.equal(response.headers.has("x-powered-by"), false);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("content-type"), "text/html");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.deepEqual(response.writes, [
    [200, { "Content-Type": "text/html" }],
    [201, "Created", ["Referrer-Policy", "strict-origin-when-cross-origin"]],
  ]);
});

test("the Web edge globally removes browser-controlled forwarding headers and uses only the development socket peer", () => {
  const request = {
    url: "/api/public/articles/example/view",
    headers: {
      forwarded: "for=198.51.100.99",
      "x-forwarded-for": "198.51.100.99",
      "x-forwarded-host": "spoofed.invalid",
      "x-forwarded-port": "443",
      "x-forwarded-proto": "https",
    },
    rawHeaders: ["Forwarded", "for=198.51.100.99", "X-Forwarded-For", "198.51.100.99", "X-Blog-X-Client-IP", "203.0.113.88"],
    socket: { remoteAddress: "198.51.100.8" },
  };
  assert.equal(installTrustedApiForwarding(request, development), true);
  assert.deepEqual(request.headers, { "x-forwarded-for": "198.51.100.8" });
  assert.deepEqual(request.rawHeaders, []);
});

test("the Web edge accepts exactly one bare canonical client address from an authenticated ingress", () => {
  const request = {
    url: "/api/public/articles/example/view",
    headers: { "x-blog-x-client-ip": "2001:db8::5", "x-blog-x-ingress-auth": ingressSecret },
    rawHeaders: ["X-Blog-X-Client-IP", "2001:db8::5", "X-Blog-X-Ingress-Auth", ingressSecret],
    socket: { remoteAddress: "172.30.0.1" },
  };
  assert.equal(installTrustedApiForwarding(request, { NODE_ENV: "production", BLOG_X_INGRESS_AUTH_SECRET: ingressSecret }), true);
  assert.deepEqual(request.headers, { "x-forwarded-for": "2001:db8::5" });
  assert.deepEqual(request.rawHeaders, []);
});

test("the Web edge fails closed for invalid ingress handshakes and production configuration", () => {
  const environment = { NODE_ENV: "production", BLOG_X_INGRESS_AUTH_SECRET: ingressSecret };
  const request = (rawHeaders) => ({
    url: "/api/public/articles/example/view",
    headers: Object.fromEntries(rawHeaders.reduce((pairs, value, index) => index % 2 ? pairs : [...pairs, [value.toLowerCase(), rawHeaders[index + 1]]], [])),
    rawHeaders,
    socket: { remoteAddress: "172.30.0.1" },
  });
  for (const rawHeaders of [
    ["X-Blog-X-Client-IP", "198.51.100.8", "X-Blog-X-Ingress-Auth", "wrong".repeat(8)],
    ["X-Blog-X-Client-IP", "198.51.100.8, 198.51.100.9", "X-Blog-X-Ingress-Auth", ingressSecret],
    ["X-Blog-X-Client-IP", "198.51.100.8", "X-Blog-X-Client-IP", "198.51.100.9", "X-Blog-X-Ingress-Auth", ingressSecret],
    ["X-Blog-X-Client-IP", "[2001:db8::5]", "X-Blog-X-Ingress-Auth", ingressSecret],
  ]) assert.equal(installTrustedApiForwarding(request(rawHeaders), environment), false);
  assert.equal(installTrustedApiForwarding({ url: "/api/health", headers: {}, socket: { remoteAddress: "127.0.0.1" } }, { NODE_ENV: "production" }), false);
});

test("the Web edge strips private forwarding data from ordinary pages", () => {
  const request = { url: "/posts/example", headers: { "x-forwarded-for": "198.51.100.99", "x-blog-x-ingress-auth": ingressSecret }, socket: { remoteAddress: "198.51.100.8" } };
  assert.equal(installTrustedApiForwarding(request, development), true);
  assert.deepEqual(request.headers, {});
});
