import request from "supertest";
import { randomUUID } from "node:crypto";
import { E2eHarness } from "./harness";

const describeE2e = describe;

describeE2e("authentication boundaries (real PostgreSQL)", () => {
  let harness: E2eHarness;

  beforeAll(async () => {
    harness = await E2eHarness.boot();
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("returns an identical OTP response for existing and unknown phone numbers", async () => {
    const existing = await request(harness.httpServer)
      .post("/api/v1/auth/otp/request")
      .send({ phone: "+989120000001" });
    const unknown = await request(harness.httpServer)
      .post("/api/v1/auth/otp/request")
      .send({ phone: "+989129999998" });

    expect(existing.status).toBe(200);
    expect(unknown.status).toBe(existing.status);
    expect(unknown.body).toEqual(existing.body);
    expect(Object.keys(unknown.body).sort()).toEqual(
      Object.keys(existing.body).sort(),
    );
  });

  it("never includes the OTP code in the response body", async () => {
    const response = await request(harness.httpServer)
      .post("/api/v1/auth/otp/request")
      .send({ phone: "+989129999997" })
      .expect(200);

    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("246810");
    expect(serialized.toLowerCase()).not.toMatch(/\b(otp|code)\b/);
  });

  it("rejects forged signatures and alg=none JWTs", async () => {
    const forged = await request(harness.httpServer)
      .get("/api/v1/users/me")
      .set("Authorization", "Bearer forged.header.signature");
    expect(forged.status).toBe(401);

    const header = Buffer.from(
      JSON.stringify({ alg: "none", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: randomUUID(),
        sid: randomUUID(),
        roles: ["SUPER_ADMIN"],
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
    const noneToken = `${header}.${payload}.`;

    await request(harness.httpServer)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${noneToken}`)
      .expect(401);
  });

  it("does not write a product when the create endpoint is called without a token", async () => {
    const before = await harness.prisma.product.count();

    await request(harness.httpServer)
      .post("/api/v1/admin/catalog/products")
      .send({
        name: "Unauthorized product",
        slug: `unauthorized-${Date.now()}`,
      })
      .expect(401);

    await expect(harness.prisma.product.count()).resolves.toBe(before);
  });
});
