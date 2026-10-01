import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendSms } from "@/lib/platform/sms";

/**
 * The gateway contract for announcement SMS (`/sms/charge`): one recipient per
 * request, in the `recipients` array shape. NODE_ENV is "test" in vitest, which
 * simulates, so these tests switch it off to reach the real request code and
 * replace `fetch`: nothing leaves the machine.
 */

describe("sendSms", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
  const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

  it("posts one recipient to /sms/charge in the gateway's shape", async () => {
    reply({ success: true, message: "Messages sent successfully" }); // the live gateway's reply
    const result = await sendSms({ recipient: "+233542958451", message: "Hello", name: "Augustine", subject: "Test" });

    expect(result.ok).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://nana-trade-server.vercel.app/sms/charge");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      recipients: [{ recipient_number: "0542958451", name: "Augustine", message: "Hello", subject: "Test", from: "Basilissa" }],
    });
  });

  it("reports a rejection from the gateway, whether by status or by a success:false body", async () => {
    reply({ error: "Insufficient balance" }, 402);
    expect(await sendSms({ recipient: "0542958451", message: "x" })).toEqual({ ok: false, error: "Insufficient balance" });
    reply({ success: false, message: "Invalid number" });
    expect(await sendSms({ recipient: "0542958451", message: "x" })).toEqual({ ok: false, error: "Invalid number" });
  });

  it("reports an unreachable gateway instead of throwing", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    expect(await sendSms({ recipient: "0542958451", message: "x" })).toEqual({ ok: false, error: "connect ECONNREFUSED" });
  });

  it("logs instead of sending when SIMULATE_SMS is on", async () => {
    vi.stubEnv("SIMULATE_SMS", "true");
    expect(await sendSms({ recipient: "0542958451", message: "x" })).toMatchObject({ ok: true, simulated: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
