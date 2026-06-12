import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./App.css", import.meta.url), "utf8");

test("filter field label rules do not apply to toggle pills", () => {
  expect(css).toContain(".filters label:not(.toggle-pill)");
  expect(css).not.toContain(".filters label,\n.command-row");
  expect(css).not.toMatch(/\.filters label\s*\{/);
});
