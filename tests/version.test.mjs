import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { VERSION } from "../js/version.js";

test("VERSION matches the service worker's cache name (one release, two files)", () => {
  const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
  const cache = sw.match(/^const CACHE = "chopinly-(v\d+)";/m)?.[1];
  assert.ok(cache, "sw.js CACHE line not found");
  assert.equal(VERSION, cache, "bump js/version.js and sw.js together");
  assert.match(VERSION, /^v\d+$/);
  assert.ok(sw.includes('"/js/version.js"'), "version.js must be precached");
});
