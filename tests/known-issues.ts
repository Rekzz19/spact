import { it } from "vitest";

// Expected failures must be visible and independently reproducible. In strict mode,
// run their desired behavior as normal assertions; never change app logic here.
export const knownIssue =
  process.env.SPACT_STRICT_TESTS === "1" ? it : it.fails;
