import request from "supertest";
import { E2eHarness, isE2eAvailable } from "./harness";

const availability = isE2eAvailable();
if (!availability.available)
  console.warn(`[payment e2e skipped] ${availability.reason}`);
const describeE2e = availability.available ? describe : describe.skip;

describeE2e("payments and money constraints (real PostgreSQL)", () => {
  let harness: E2eHarness;

  beforeAll(async () => {
    harness = await E2eHarness.boot();
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("does not create a transaction for an unknown callback authority", async () => {
    const before = await harness.prisma.paymentTransaction.count();

    await request(harness.httpServer)
      .get("/api/v1/payments/callback")
      .query({ authority: "authority-that-was-never-issued", Status: "OK" })
      .expect(302);

    await expect(harness.prisma.paymentTransaction.count()).resolves.toBe(
      before,
    );
  });

  it("cannot mark an order PAID by tampering with callback query parameters", async () => {
    const user = await harness.prisma.user.create({
      data: { status: "ACTIVE" },
    });
    const order = await harness.prisma.order.create({
      data: {
        orderNumber: `E2E-TAMPER-${Date.now()}`,
        userId: user.id,
        totalAmount: 500_000,
        contactPhone: "+989121111111",
      },
    });
    const paidBefore = await harness.prisma.order.count({
      where: { status: "PAID" },
    });

    await request(harness.httpServer)
      .get("/api/v1/payments/callback")
      .query({
        authority: "unknown-tampered-authority",
        Status: "OK",
        orderId: order.id,
        orderStatus: "PAID",
        amount: 1,
      })
      .expect(302);

    await expect(
      harness.prisma.order.count({ where: { status: "PAID" } }),
    ).resolves.toBe(paidBefore);
    await expect(
      harness.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      }),
    ).resolves.toEqual({ status: "PENDING_PAYMENT" });
  });

  it("requires authentication on the customer verify endpoint", async () => {
    await request(harness.httpServer)
      .post("/api/v1/payments/verify")
      .send({ authority: "anything" })
      .expect(401);
  });

  it("enforces paidAmount <= totalAmount and refundedAmount <= paidAmount in PostgreSQL", async () => {
    const user = await harness.prisma.user.create({
      data: { status: "ACTIVE" },
    });
    const order = await harness.prisma.order.create({
      data: {
        orderNumber: `E2E-CHECK-${Date.now()}`,
        userId: user.id,
        totalAmount: 100,
        contactPhone: "+989122222222",
      },
    });

    await expect(
      harness.prisma.order.update({
        where: { id: order.id },
        data: { paidAmount: 101 },
      }),
    ).rejects.toBeDefined();

    await harness.prisma.order.update({
      where: { id: order.id },
      data: { paidAmount: 50 },
    });
    await expect(
      harness.prisma.order.update({
        where: { id: order.id },
        data: { refundedAmount: 51 },
      }),
    ).rejects.toBeDefined();

    await expect(
      harness.prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { totalAmount: true, paidAmount: true, refundedAmount: true },
      }),
    ).resolves.toEqual({ totalAmount: 100, paidAmount: 50, refundedAmount: 0 });
  });

  it("stores prices as PostgreSQL integers and rejects negative prices", async () => {
    const columns = await harness.prisma.$queryRaw<
      Array<{ table_name: string; data_type: string }>
    >`
      SELECT table_name::text, data_type::text
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND column_name = 'basePrice'
         AND table_name IN ('Product', 'VariantPrice')
       ORDER BY table_name
    `;
    expect(columns).toEqual([
      { table_name: "Product", data_type: "integer" },
      { table_name: "VariantPrice", data_type: "integer" },
    ]);

    await expect(
      harness.prisma.product.create({
        data: {
          name: "Negative price must fail",
          slug: `negative-price-${Date.now()}`,
          status: "DRAFT",
          basePrice: -1,
        },
      }),
    ).rejects.toBeDefined();

    const variant = await harness.prisma.productVariant.findFirstOrThrow({
      select: { id: true },
    });
    await expect(
      harness.prisma.variantPrice.create({
        data: { variantId: variant.id, basePrice: -1, source: "E2E" },
      }),
    ).rejects.toBeDefined();
  });
});
