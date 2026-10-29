import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/test-db/route";
import { supabase } from "@/lib/supabase/superbase";
import { expectJson } from "../helpers";

vi.mock("@/lib/supabase/superbase", () => ({ supabase: { from: vi.fn() } }));
const limit = vi.fn();
const select = vi.fn();
beforeEach(() => {
  select.mockReturnValue({ limit });
  vi.mocked(supabase.from).mockReturnValue({ select } as unknown as ReturnType<
    typeof supabase.from
  >);
});
describe("Diagnostic database endpoint (mocked Supabase)", () => {
  it("returns connectivity data and limits its query", async () => {
    limit.mockResolvedValue({ data: [{ id: "conversation-1" }], error: null });
    await expectJson(await GET(), 200, {
      connected: true,
      data: [{ id: "conversation-1" }],
    });
    expect(select).toHaveBeenCalledWith("id");
    expect(limit).toHaveBeenCalledWith(1);
  });
  it("reports database failures", async () => {
    limit.mockResolvedValue({
      data: null,
      error: { message: "Database unavailable" },
    });
    await expectJson(await GET(), 500, { error: "Database unavailable" });
  });
});
