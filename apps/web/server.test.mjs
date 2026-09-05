import assert from "node:assert/strict";
import test from "node:test";
import { installTrustedApiForwarding } from "./server.mjs";

const development = { NODE_ENV: "development" };
const ingressSecret = "a".repeat(32);

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
