import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("root layout renders a responsive ICP footer for every route", async () => {
  const [layout, css] = await Promise.all([read("./layout.tsx"), read("./layout.module.css")]);
  assert.match(layout, /<footer className=\{styles\.icpFooter\}>/);
  assert.match(layout, /<a href="https:\/\/beian\.miit\.gov\.cn\/" target="_blank" rel="noopener noreferrer">黔ICP备2023015906号<\/a>/);
  assert.match(layout, /<PublicHeader \/>\s*\{children\}\s*<footer/s);
  assert.match(css, /width: min\(100%, 72rem\)/);
  assert.match(css, /padding: 1rem clamp\(1rem, 4vw, 2rem\) 1\.5rem/);
  assert.match(css, /:focus-visible/);
});

test("Next security headers retain only the required development CSP exception", async () => {
  const config = await read("../next.config.ts");
  for (const directive of [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self'",
    "font-src 'self'",
    "media-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self' blob:",
  ]) assert.match(config, new RegExp(`\\"${directive.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\"`));
  assert.match(config, /script-src 'self' 'unsafe-inline'\$\{development \? " 'unsafe-eval'" : ""\}/);
  assert.match(config, /connect-src 'self'\$\{development \? " ws:\/\/127\.0\.0\.1:3100" : ""\}/);
  assert.match(config, /poweredByHeader: false/);
  assert.match(config, /Strict-Transport-Security", value: "max-age=31536000; includeSubDomains"/);
  assert.match(config, /X-Content-Type-Options", value: "nosniff"/);
  assert.match(config, /Referrer-Policy", value: "strict-origin-when-cross-origin"/);
  assert.match(config, /X-Frame-Options", value: "DENY"/);
  assert.match(config, /Permissions-Policy", value: "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)"/);
  assert.doesNotMatch(config, /upgrade-insecure-requests|preload|\*\//);
});
