import request from "supertest";
import { E2eHarness } from "./harness";

const describeE2e = describe;

describeE2e(
  "public catalog visibility and query safety (real PostgreSQL)",
  () => {
    let harness: E2eHarness;
    const draftSlug = "e2e-hidden-draft";
    const deletedSlug = "e2e-soft-deleted";

    beforeAll(async () => {
      harness = await E2eHarness.boot();
      await harness.reset();
      await harness.prisma.product.createMany({
        data: [
          {
            name: "Unreleased draft",
            slug: draftSlug,
            status: "DRAFT",
            basePrice: 10_000,
            publishedAt: null,
          },
          {
            name: "Deleted active product",
            slug: deletedSlug,
            status: "ACTIVE",
            basePrice: 10_000,
            publishedAt: new Date(Date.now() - 60_000),
            deletedAt: new Date(),
          },
        ],
      });
    });

    afterAll(async () => {
      await harness.close();
    });

    it("does not list DRAFT or soft-deleted products publicly", async () => {
      const response = await request(harness.httpServer)
        .get("/api/v1/catalog/products")
        .query({ pageSize: 100 })
        .expect(200);

      const slugs = (response.body.items as Array<{ slug: string }>).map(
        (product) => product.slug,
      );
      expect(slugs).not.toContain(draftSlug);
      expect(slugs).not.toContain(deletedSlug);
      expect(slugs).toContain("classic-t-shirt");
    });

    it("returns 404, not 403, when a draft slug is guessed directly", async () => {
      await request(harness.httpServer)
        .get(`/api/v1/catalog/products/${draftSlug}`)
        .expect(404);
    });

    it("enforces the page-size ceiling for pageSize=100000", async () => {
      const response = await request(harness.httpServer)
        .get("/api/v1/catalog/products")
        .query({ pageSize: 100_000 })
        .expect(400);

      expect(JSON.stringify(response.body)).toContain("pageSize");
    });

    it("treats SQL injection syntax as search text and leaves Product intact", async () => {
      const before = await harness.prisma.product.count();
      const injection = `' OR 1=1; DROP TABLE "Product"; --`;

      await request(harness.httpServer)
        .get("/api/v1/catalog/products")
        .query({ search: injection })
        .expect(200);

      await expect(harness.prisma.product.count()).resolves.toBe(before);
      await expect(
        harness.prisma.$queryRaw<Array<{ table_name: string }>>`
        SELECT table_name::text
          FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'Product'
      `,
      ).resolves.toEqual([{ table_name: "Product" }]);
    });
  },
);
