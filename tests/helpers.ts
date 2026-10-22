import { expect, vi } from "vitest";

export function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function expectJson(
  response: Response,
  status: number,
  body: unknown,
) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual(body);
}

export function supabaseMock() {
  const getUser = vi
    .fn()
    .mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  const signInAnonymously = vi.fn();
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const order = vi.fn().mockReturnValue({ limit });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const single = vi
    .fn()
    .mockResolvedValue({ data: { id: "conversation-1" }, error: null });
  const insertedSelect = vi.fn().mockReturnValue({ single });
  const insert = vi
    .fn()
    .mockReturnValue({ error: null, select: insertedSelect });
  const from = vi.fn().mockReturnValue({ select, insert });
  return {
    auth: { getUser, signInAnonymously },
    from,
    select,
    eq,
    order,
    limit,
    insert,
    insertedSelect,
    single,
  };
}
