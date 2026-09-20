import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("root layout renders a responsive ICP footer and keyboard skip target for every route", async () => {
  const [layout, css, contracts, skipLink, login, adminShell] = await Promise.all([
    read("./layout.tsx"),
    read("./layout.module.css"),
    read("../../../packages/contracts/src/site-settings.ts"),
    read("./_components/SkipToContentLink.tsx"),
    read("./login/page.tsx"),
    read("./admin/AdminShell.tsx"),
  ]);
  assert.match(layout, /<footer className=\{styles\.icpFooter\}>/);
  assert.match(layout, /<a href="https:\/\/beian\.miit\.gov\.cn\/" target="_blank" rel="noopener noreferrer">\{site\.registrationNumber\}<\/a>/);
  assert.match(layout, /<SkipToContentLink \/>\s*<PublicHeader siteName=\{site\.name\} \/>\s*<div id="main-content" tabIndex=\{-1\}>\{children\}<\/div>\s*<footer/s);
  assert.match(layout, /result\.kind === "ok" \? result\.data : defaultSiteSettings/);
  assert.match(skipLink, /usePathname/);
  assert.match(skipLink, /pathname\.startsWith\("\/admin"\)\) return null/);
  assert.match(skipLink, /<a className=\{styles\.skipLink\} href="#main-content">跳到正文<\/a>/);
  assert.match(adminShell, /<a className=\{styles\.skipLink\} href="#admin-content">跳到管理内容<\/a>/);
  assert.match(adminShell, /id="admin-content" className=\{styles\.content\} tabIndex=\{-1\}/);
  assert.doesNotMatch(login, /autoFocus/);
  assert.match(contracts, /registrationNumber: "黔ICP备2023015906号"/);
  assert.match(contracts, /registrationUrl: "https:\/\/beian\.miit\.gov\.cn\/"/);
  assert.match(css, /width: min\(100%, 72rem\)/);
  assert.match(css, /padding: 1rem clamp\(1rem, 4vw, 2rem\) 1\.5rem/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /\.skipLink \{[\s\S]*position: fixed;[\s\S]*z-index: 100;[\s\S]*translate: 0 -160%/);
  assert.match(css, /\.skipLink:focus-visible \{[\s\S]*translate: 0;[\s\S]*outline: 3px solid #17201d/);
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
  assert.match(config, /Cross-Origin-Opener-Policy", value: "same-origin"/);
  assert.match(config, /X-Frame-Options", value: "DENY"/);
  assert.match(config, /Permissions-Policy", value: "camera=\(\), microphone=\(\), geolocation=\(\), payment=\(\), usb=\(\)"/);
  assert.doesNotMatch(config, /upgrade-insecure-requests|preload|\*\//);
});
