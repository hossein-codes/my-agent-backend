import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCodes } from '../../common/errors/error-codes';

export interface Availability {
  variantId: string;
  onHand: number;
  reserved: number;
  /** Units a shopper can actually take right now. */
  available: number;
  lowStock: boolean;
}

type Tx = Prisma.TransactionClient;

/**
 * Stock management (spec §10).
 *
 * The invariant that must never break: `reserved <= onHand`, and two shoppers
 * can never both take the final unit.
 *
 * That is enforced by a CONDITIONAL UPDATE inside the same transaction as the
 * reservation row:
 *
 *   UPDATE "Inventory" SET reserved = reserved + q
 *   WHERE "variantId" = $1 AND "onHand" - "reserved" >= $2
 *
 * If zero rows change, the stock was already taken and we abort. A
 * read-then-write in application code would race; this cannot.
 */
@Injectable()
export class InventoryService {
  private readonly logger = new Logger('Inventory');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async availability(variantId: string): Promise<Availability> {
    const row = await this.prisma.inventory.findUnique({ where: { variantId } });
    if (!row) {
      return { variantId, onHand: 0, reserved: 0, available: 0, lowStock: true };
    }
    return this.toAvailability(row);
  }

  /** Batched availability for list/cart rendering — one query, no N+1. */
  async availabilityFor(variantIds: string[]): Promise<Map<string, Availability>> {
    if (variantIds.length === 0) return new Map();
    const rows = await this.prisma.inventory.findMany({ where: { variantId: { in: variantIds } } });
    return new Map(rows.map((r) => [r.variantId, this.toAvailability(r)] as const));
  }

  /**
   * Holds stock for a checkout window. Throws `INSUFFICIENT_STOCK` when the
   * conditional update cannot claim the units.
   */
  async reserve(input: {
    variantId: string;
    quantity: number;
    userId?: string | null;
    cartId?: string | null;
    orderId?: string | null;
    windowMinutes?: number;
    tx?: Tx;
  }): Promise<{ reservationId: string; expiresAt: Date }> {
    if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
      throw AppError.badRequest('quantity must be a positive integer');
    }

    const expiresAt = new Date(Date.now() + (input.windowMinutes ?? this.config.business.orderPaymentWindowMinutes) * 60_000);

    const run = async (tx: Tx): Promise<{ reservationId: string; expiresAt: Date }> => {
      const claimed = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reserved" = "reserved" + ${input.quantity},
            "updatedAt" = NOW()
        WHERE "variantId" = ${input.variantId}::uuid
          AND "onHand" - "reserved" >= ${input.quantity}`;

      if (claimed === 0) {
        throw new AppError(ErrorCodes.INSUFFICIENT_STOCK, 409, 'Not enough stock available');
      }

      const reservation = await tx.inventoryReservation.create({
        data: {
          variantId: input.variantId,
          quantity: input.quantity,
          userId: input.userId ?? null,
          cartId: input.cartId ?? null,
          orderId: input.orderId ?? null,
          status: 'ACTIVE',
          expiresAt,
        },
      });

      const snapshot = await tx.inventory.findUniqueOrThrow({ where: { variantId: input.variantId } });
      await tx.inventoryMovement.create({
        data: {
          variantId: input.variantId,
          type: 'RESERVATION',
          quantity: 0, // onHand is unchanged; only the hold moved
          onHandAfter: snapshot.onHand,
          reservedAfter: snapshot.reserved,
          reservationId: reservation.id,
          source: 'SYSTEM',
          note: 'stock reserved for checkout',
        },
      });

      return { reservationId: reservation.id, expiresAt };
    };

    return input.tx ? run(input.tx) : this.prisma.$transaction(run);
  }

  /** Releases a hold back to sellable stock. Idempotent — safe to call twice. */
  async release(reservationId: string, reason: string, tx?: Tx): Promise<boolean> {
    const run = async (client: Tx): Promise<boolean> => {
      const reservation = await client.inventoryReservation.findUnique({ where: { id: reservationId } });
      if (!reservation || reservation.status !== 'ACTIVE') return false;

      await client.inventoryReservation.update({
        where: { id: reservationId },
        data: { status: 'RELEASED', releasedAt: new Date(), releaseReason: reason },
      });
      await client.$executeRaw`
        UPDATE "Inventory"
        SET "reserved" = GREATEST("reserved" - ${reservation.quantity}, 0),
            "updatedAt" = NOW()
        WHERE "variantId" = ${reservation.variantId}::uuid`;

      const snapshot = await client.inventory.findUniqueOrThrow({ where: { variantId: reservation.variantId } });
      await client.inventoryMovement.create({
        data: {
          variantId: reservation.variantId,
          type: 'RESERVATION_RELEASE',
          quantity: 0,
          onHandAfter: snapshot.onHand,
          reservedAfter: snapshot.reserved,
          reservationId,
          source: 'SYSTEM',
          note: `reservation released: ${reason}`,
        },
      });
      return true;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Converts a hold into a sale at payment time. */
  async consume(reservationId: string, tx?: Tx): Promise<boolean> {
    const run = async (client: Tx): Promise<boolean> => {
      const reservation = await client.inventoryReservation.findUnique({ where: { id: reservationId } });
      if (!reservation || reservation.status !== 'ACTIVE') return false;

      await client.inventoryReservation.update({
        where: { id: reservationId },
        data: { status: 'CONSUMED', consumedAt: new Date() },
      });
      // Both counters drop: the unit physically leaves and the hold is cleared.
      await client.$executeRaw`
        UPDATE "Inventory"
        SET "onHand" = GREATEST("onHand" - ${reservation.quantity}, 0),
            "reserved" = GREATEST("reserved" - ${reservation.quantity}, 0),
            "sold" = "sold" + ${reservation.quantity},
            "updatedAt" = NOW()
        WHERE "variantId" = ${reservation.variantId}::uuid`;

      const snapshot = await client.inventory.findUniqueOrThrow({ where: { variantId: reservation.variantId } });
      await client.inventoryMovement.create({
        data: {
          variantId: reservation.variantId,
          type: 'SALE',
          quantity: -reservation.quantity,
          onHandAfter: snapshot.onHand,
          reservedAfter: snapshot.reserved,
          reservationId,
          source: 'SYSTEM',
          note: 'reservation consumed on payment',
        },
      });
      return true;
    };

    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Admin stock correction (restock, damage, count fix). Always writes a ledger row. */
  async adjust(input: {
    variantId: string;
    delta: number;
    type: 'RECEIPT' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN';
    actorId?: string | null;
    note?: string;
  }): Promise<Availability> {
    if (!Number.isInteger(input.delta) || input.delta === 0) {
      throw AppError.badRequest('delta must be a non-zero integer');
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.delta < 0) {
        const claimed = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" + ${input.delta}, "updatedAt" = NOW()
          WHERE "variantId" = ${input.variantId}::uuid
            AND "onHand" + ${input.delta} >= "reserved"`;
        if (claimed === 0) {
          throw new AppError(
            ErrorCodes.INSUFFICIENT_STOCK,
            409,
            'Cannot reduce stock below the quantity currently reserved',
          );
        }
      } else {
        const updated = await tx.$executeRaw`
          UPDATE "Inventory"
          SET "onHand" = "onHand" + ${input.delta}, "updatedAt" = NOW()
          WHERE "variantId" = ${input.variantId}::uuid`;
        if (updated === 0) {
          // No inventory row yet — create it so the first restock works.
          await tx.inventory.create({ data: { variantId: input.variantId, onHand: input.delta } });
        }
      }

      const snapshot = await tx.inventory.findUniqueOrThrow({ where: { variantId: input.variantId } });
      await tx.inventoryMovement.create({
        data: {
          variantId: input.variantId,
          // The API says RECEIPT; the schema calls warehouse intake RESTOCK.
          type: input.type === 'RECEIPT' ? 'RESTOCK' : input.type,
          quantity: input.delta,
          onHandAfter: snapshot.onHand,
          reservedAfter: snapshot.reserved,
          actorId: input.actorId ?? null,
          source: 'ADMIN',
          note: input.note ?? null,
        },
      });
    });

    return this.availability(input.variantId);
  }

  /** Sweeps expired holds. Called by the jobs module. */
  async expireStaleReservations(): Promise<number> {
    const stale = await this.prisma.inventoryReservation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lt: new Date() } },
      select: { id: true },
      take: 500,
    });
    let released = 0;
    for (const r of stale) {
      if (await this.release(r.id, 'EXPIRED')) released += 1;
    }
    if (released > 0) this.logger.log(`released ${released} expired reservation(s)`);
    return released;
  }

  private toAvailability(row: {
    variantId: string;
    onHand: number;
    reserved: number;
    lowStockThreshold: number;
  }): Availability {
    const available = Math.max(0, row.onHand - row.reserved);
    return {
      variantId: row.variantId,
      onHand: row.onHand,
      reserved: row.reserved,
      available,
      lowStock: available <= row.lowStockThreshold,
    };
  }
}
