import { expect, test } from "bun:test";
import { lookup } from "./index.js";

test("lookup returns a placeholder result", () => {
  expect(lookup("example")).toEqual({
    query: "example",
    status: "pending"
  });
});
