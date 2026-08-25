import request, { type Response } from "supertest";
import { E2eHarness } from "./harness";

const describeE2e = describe;

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";
interface ExpressLayer {
  route?: {
    path: string | string[];
    methods: Record<string, boolean>;
  };
}

describeE2e("HTTP authorization surface (real AppModule)", () => {
  let harness: E2eHarness;

  beforeAll(async () => {
    harness = await E2eHarness.boot();
    await harness.reset();
  });

  afterAll(async () => {
    await harness.close();
  });

  it("sweeps every registered admin/* route and gets 401 anonymously", async () => {
    const express = harness.app.getHttpAdapter().getInstance() as {
      router?: { stack?: ExpressLayer[] };
      _router?: { stack?: ExpressLayer[] };
    };
    const layers = express.router?.stack ?? express._router?.stack ?? [];
    const routes = layers.flatMap((layer) => {
      if (!layer.route) return [];
      const paths = Array.isArray(layer.route.path)
        ? layer.route.path
        : [layer.route.path];
      return paths.flatMap((path) =>
        Object.entries(layer.route?.methods ?? {})
          .filter(
            ([method, enabled]) =>
              enabled &&
              isHttpMethod(method) &&
              path.startsWith("/api/v1/admin/"),
          )
          .map(([method]) => ({
            method: method as HttpMethod,
            path: concretePath(path),
          })),
      );
    });

    // This assertion prevents a framework-internals change from turning the
    // sweep into a vacuous green test.
    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) {
      const response = await anonymous(route.method, route.path);
      expect({
        method: route.method,
        path: route.path,
        status: response.status,
      }).toEqual({
        method: route.method,
        path: route.path,
        status: 401,
      });
    }
  });

  it.each([
    ["get", "/api/v1/users/me"],
    ["get", "/api/v1/cart"],
    ["get", "/api/v1/orders"],
    ["get", "/api/v1/wishlist"],
    ["get", "/api/v1/checkout/summary"],
    ["get", "/api/v1/notifications"],
    ["get", "/api/v1/returns"],
    ["get", "/api/v1/refunds/me"],
    ["get", "/api/v1/identity/me"],
  ] as Array<[HttpMethod, string]>)(
    "protects customer route %s %s",
    async (method, path) => {
      const response = await anonymous(method, path);
      expect(response.status).toBe(401);
    },
  );

  it.each([
    ["/api/v1/catalog/products", 200],
    ["/api/v1/campaigns/active", 200],
    ["/api/v1/shipping/methods", 200],
    ["/health/live", 200],
    ["/health/ready", 200],
  ] as Array<[string, number]>)(
    "keeps public route %s available without a token",
    async (path, status) => {
      await request(harness.httpServer).get(path).expect(status);
    },
  );

  it("does not mutate stock through the anonymous inventory endpoint", async () => {
    const inventory = await harness.prisma.inventory.findFirstOrThrow({
      select: { variantId: true, onHand: true, reserved: true },
    });

    await request(harness.httpServer)
      .post(`/api/v1/admin/inventory/${inventory.variantId}/adjust`)
      .send({ delta: 50, type: "RECEIPT" })
      .expect(401);

    await expect(
      harness.prisma.inventory.findUniqueOrThrow({
        where: { variantId: inventory.variantId },
        select: { onHand: true, reserved: true },
      }),
    ).resolves.toEqual({
      onHand: inventory.onHand,
      reserved: inventory.reserved,
    });
  });

  it("does not leak Prisma, stack traces, passwords or secrets in a 401 body", async () => {
    const response = await request(harness.httpServer)
      .get("/api/v1/users/me")
      .expect(401);
    const body = JSON.stringify(response.body).toLowerCase();

    expect(body).not.toMatch(/prisma|stack|password|secret/);
    expect(response.body).toMatchObject({
      code: expect.any(String),
      message: expect.any(String),
    });
  });

  function anonymous(method: HttpMethod, path: string): Promise<Response> {
    switch (method) {
      case "get":
        return request(harness.httpServer).get(path);
      case "post":
        return request(harness.httpServer).post(path).send({});
      case "put":
        return request(harness.httpServer).put(path).send({});
      case "patch":
        return request(harness.httpServer).patch(path).send({});
      case "delete":
        return request(harness.httpServer).delete(path);
    }
  }
});

function concretePath(path: string): string {
  return path.replace(/:[^/]+/g, "00000000-0000-4000-8000-000000000001");
}

function isHttpMethod(method: string): method is HttpMethod {
  return ["get", "post", "put", "patch", "delete"].includes(method);
}
