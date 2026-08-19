import assert from "node:assert/strict";
import test from "node:test";
import { searchEncodingHeaderName, validateRawSearchEncoding } from "./search-encoding";

test("raw search encoding accepts ordinary, Unicode, emoji and encoded literal percent components", () => {
  assert.equal(searchEncodingHeaderName, "x-blog-x-search-encoding");
  for (const candidate of [
    "",
    "?q=plain+text&page=1",
    "?q=%E4%B8%AD%E6%96%87",
    "?q=%F0%9F%98%80",
    "?q=%25ZZ",
    "?q=e%CC%81",
    "?q=a%26b%2Bc",
  ]) assert.equal(validateRawSearchEncoding(candidate), true, candidate);
});

test("raw search encoding rejects incomplete triplets and illegal UTF-8 without repairing input", () => {
  for (const candidate of [
    "?q=%",
    "?q=%Z",
    "?q=%ZZ",
    "?q=%E0%A4%A",
    "?q=%ED%A0%80",
    "?q=%C0%AF",
    "?%FF=value",
  ]) assert.equal(validateRawSearchEncoding(candidate), false, candidate);
});
