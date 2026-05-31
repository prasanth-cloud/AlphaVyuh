import { describe, expect, it } from "vitest";

function postRequest(path: string, body: object) {
  return new Request(`https://alphavyuh.test${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeParams = { params: Promise.resolve({ symbol: "RELIANCE" }) };

async function expectReadOnlyRecovery(response: Response, detail: string) {
  expect(response.status).toBe(503);
  const payload = await response.json();
  expect(payload).toMatchObject({
    status: "unavailable",
    mode: "unavailable",
    detail,
  });
  expect(JSON.stringify(payload)).not.toContain("local_only");
}

describe("recovery chart routes", () => {
  it("rejects drawing saves in read-only recovery mode", async () => {
    const { POST } = await import("@/app/api/v1/charts/[symbol]/drawings/route");

    await expectReadOnlyRecovery(
      await POST(
        postRequest("/api/v1/charts/RELIANCE/drawings", { timeframe: "D" }) as never,
        routeParams,
      ),
      "Chart drawing changes are unavailable in read-only recovery mode.",
    );
  });

  it("rejects layout saves in read-only recovery mode", async () => {
    const { POST } = await import("@/app/api/v1/charts/[symbol]/layout/route");

    await expectReadOnlyRecovery(
      await POST(
        postRequest("/api/v1/charts/RELIANCE/layout", { timeframe: "D" }) as never,
        routeParams,
      ),
      "Chart layout changes are unavailable in read-only recovery mode.",
    );
  });

  it("rejects workspace saves in read-only recovery mode", async () => {
    const { POST } = await import("@/app/api/v1/charts/[symbol]/workspace/route");

    await expectReadOnlyRecovery(
      await POST(
        postRequest("/api/v1/charts/RELIANCE/workspace", { timeframe: "D" }) as never,
        routeParams,
      ),
      "Chart workspace changes are unavailable in read-only recovery mode.",
    );
  });
});
