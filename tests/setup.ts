import { beforeEach, vi } from "vitest";

beforeEach(() => {
  // Any unmocked outbound request must fail rather than contact a real service.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Unexpected network request")),
  );
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
