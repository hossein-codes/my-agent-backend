import { InventoryService } from "../src/modules/inventory/inventory.service";
import { E2eHarness } from "./harness";

const describeE2e = describe;

describeE2e("inventory concurrency (real PostgreSQL)", () => {
  let harness: E2eHarness;
  let inventory: InventoryService;
  let variantId: string;

  beforeAll(async () => {
    harness = await E2eHarness.boot();
    await harness.reset();
    inventory = harness.app.get(InventoryService);
    variantId = (
      await harness.prisma.productVariant.findFirstOrThrow({
        where: { sku: "SKU-001" },
        select: { id: true },
      })
    ).id;
  });

  beforeEach(async () => {
    // Movements reference reservations with ON DELETE RESTRICT, so the ledger
    // must be cleared first when preparing a fresh concurrency scenario.
    await harness.prisma.inventoryMovement.deleteMany({ where: { variantId } });
    await harness.prisma.inventoryReservation.deleteMany({
      where: { variantId },
    });
    await harness.prisma.inventory.update({
      where: { variantId },
      data: { onHand: 5, reserved: 0, sold: 0, returned: 0, damaged: 0 },
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it("allows exactly five of twenty simultaneous buyers to reserve five units", async () => {
    const buyers = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const user = await harness.prisma.user.create({
          data: { status: "ACTIVE" },
        });
        const cart = await harness.prisma.cart.create({
          data: { userId: user.id, status: "ACTIVE" },
        });
        return { userId: user.id, cartId: cart.id };
      }),
    );

    const attempts = await Promise.allSettled(
      buyers.map((buyer) =>
        inventory.reserve({
          variantId,
          quantity: 1,
          userId: buyer.userId,
          cartId: buyer.cartId,
          windowMinutes: 15,
        }),
      ),
    );
    const successful = attempts.filter(
      (
        result,
      ): result is PromiseFulfilledResult<{
        reservationId: string;
        expiresAt: Date;
      }> => result.status === "fulfilled",
    );

    expect(successful).toHaveLength(5);
    expect(successful.length).toBeLessThanOrEqual(5);

    const reservationIds = successful.map(
      (result) => result.value.reservationId,
    );
    const movements = await harness.prisma.inventoryMovement.findMany({
      where: {
        variantId,
        type: "RESERVATION",
        reservationId: { in: reservationIds },
      },
      select: { reservationId: true },
    });
    expect(movements).toHaveLength(successful.length);
    expect(
      new Set(movements.map((movement) => movement.reservationId)).size,
    ).toBe(successful.length);

    const stock = await harness.prisma.inventory.findUniqueOrThrow({
      where: { variantId },
    });
    expect(stock.reserved).toBe(5);
    expect(stock.onHand - stock.reserved).toBeGreaterThanOrEqual(0);
  });

  it("rejects a reservation larger than all stock without changing reserved", async () => {
    const user = await harness.prisma.user.create({
      data: { status: "ACTIVE" },
    });
    const cart = await harness.prisma.cart.create({
      data: { userId: user.id, status: "ACTIVE" },
    });
    const before = await harness.prisma.inventory.findUniqueOrThrow({
      where: { variantId },
    });

    await expect(
      inventory.reserve({
        variantId,
        quantity: 6,
        userId: user.id,
        cartId: cart.id,
        windowMinutes: 15,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    const after = await harness.prisma.inventory.findUniqueOrThrow({
      where: { variantId },
    });
    expect(after.reserved).toBe(before.reserved);
    expect(after.onHand - after.reserved).toBeGreaterThanOrEqual(0);
    await expect(
      harness.prisma.inventoryReservation.count({ where: { variantId } }),
    ).resolves.toBe(0);
  });
});
