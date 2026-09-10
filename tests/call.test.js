import assert from "node:assert/strict";
import test from "node:test";
import { displayName, mediaError, readCallId } from "../src/call-utils.js";

test("call links accept our invitation format and reject foreign, malformed, or empty input", () => {
  const origin = "https://sampark.netlify.app";
  const id = "sp-129f7560-6040-4f26-a6d4-2a4248e81968";
  assert.equal(readCallId(` ${id} `, origin), id);
  assert.equal(readCallId(`${origin}/?call=${id}`, origin), id);
  for (const value of [
    "",
    " ",
    "some-random-id",
    "javascript:alert(1)",
    `${origin}/`,
    `https://elsewhere.example/?call=${id}`,
    `${id}<script>`,
    `${id}/extra`,
  ]) {
    assert.throws(() => readCallId(value, origin));
  }
});

test("untrusted names are bounded and device errors explain recovery", () => {
  assert.equal(displayName({ name: "bad metadata" }), "Guest");
  assert.equal(displayName("   "), "Guest");
  assert.equal(displayName("  Ayush  "), "Ayush");
  assert.equal(displayName("a".repeat(200)).length, 40);
  assert.match(mediaError({ name: "NotAllowedError" }), /site settings/);
  assert.match(mediaError({ name: "NotFoundError" }), /Check your devices/);
  assert.match(
    mediaError({ name: "NotReadableError" }),
    /Close other calling apps/,
  );
});
