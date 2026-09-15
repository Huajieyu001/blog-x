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
