/**
 * DATABASE PHASE 1 SEED — idempotent (safe to re-run; upserts by natural key).
 * Seeds RBAC (roles, permissions, mappings), reference catalog data (colors,
 * sizes, attributes), a category tree, brands, collections, tags, and one
 * demo product with variants — the exact shape from the Phase 1 directive.
 */
import { existsSync, readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';

// Minimal env loader: seed can run via `prisma db seed` without shell exports.
// Precedence: existing env → .env.development → .env
for (const file of ['.env.development', '.env']) {
  if (process.env.DATABASE_URL) break;
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const prisma = new PrismaClient();

const ROLES: Array<{ slug: string; name: string; description: string }> = [
  { slug: 'CUSTOMER', name: 'Customer', description: 'Shopper account' },
  { slug: 'PRODUCT_MANAGER', name: 'Product Manager', description: 'Catalog management' },
  { slug: 'ORDER_MANAGER', name: 'Order Manager', description: 'Order processing' },
  { slug: 'SUPPORT', name: 'Support', description: 'Customer support' },
  { slug: 'FINANCE', name: 'Finance', description: 'Payments and refunds' },
  { slug: 'WAREHOUSE', name: 'Warehouse', description: 'Inventory and shipping' },
  { slug: 'SUPER_ADMIN', name: 'Super Admin', description: 'Full access' },
];

// Phase 1 permissions (catalog + identity scope). Later phases add their own.
const PERMISSIONS: Record<string, string[]> = {
  'products.read': ['PRODUCT_MANAGER', 'SUPER_ADMIN', 'SUPPORT'],
  'products.write': ['PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'products.delete': ['SUPER_ADMIN'],
  'categories.write': ['PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'brands.write': ['PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'collections.write': ['PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'tags.write': ['PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'attributes.write': ['PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'media.write': ['PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'users.read': ['SUPPORT', 'SUPER_ADMIN'],
  'users.write': ['SUPER_ADMIN'],
  'users.block': ['SUPER_ADMIN'],
  'roles.read': ['SUPER_ADMIN'],
  'roles.write': ['SUPER_ADMIN'],
  'roles.assign': ['SUPER_ADMIN'],
  'identity.review': ['SUPPORT', 'SUPER_ADMIN'],
  // H-4 FIX: permissions actually demanded by @Permissions guards —
  // previously NONE of these existed, so every non-SUPER_ADMIN admin got 403.
  'order.read': ['ORDER_MANAGER', 'SUPPORT', 'FINANCE', 'WAREHOUSE', 'SUPER_ADMIN'],
  'order.manage': ['ORDER_MANAGER', 'SUPER_ADMIN'],
  'inventory.read': ['WAREHOUSE', 'PRODUCT_MANAGER', 'SUPER_ADMIN'],
  'inventory.write': ['WAREHOUSE', 'SUPER_ADMIN'],
  'payment.read': ['FINANCE', 'SUPER_ADMIN'],
  'payment.manage': ['FINANCE', 'SUPER_ADMIN'],
  'refund.create': ['FINANCE', 'SUPER_ADMIN'],
  'refund.approve': ['FINANCE', 'SUPER_ADMIN'],
  'user.manage': ['SUPER_ADMIN'],
  'audit.read': ['SUPER_ADMIN'],
  'settings.manage': ['SUPER_ADMIN'],
};

const COLORS: Array<[name: string, displayName: string, slug: string, hex: string]> = [
  ['Black', 'Black', 'black', '#000000'],
  ['White', 'White', 'white', '#FFFFFF'],
  ['Navy', 'Navy Blue', 'navy', '#1B2A4A'],
  ['Gray', 'Gray', 'gray', '#808285'],
  ['Red', 'Red', 'red', '#C0202C'],
  ['Beige', 'Beige', 'beige', '#D9C7A7'],
  ['Green', 'Olive Green', 'green', '#4A5D23'],
  ['Brown', 'Chocolate Brown', 'brown', '#4E342E'],
  ['Pink', 'Dusty Pink', 'pink', '#D8A7B1'],
  ['Yellow', 'Mustard Yellow', 'yellow', '#D9A404'],
];

const SIZES: Array<{ type: 'ALPHABETICAL' | 'NUMERICAL' | 'ONE_SIZE'; label: string; numericValue?: number; sortOrder: number }> = [
  { type: 'ALPHABETICAL', label: 'XS', sortOrder: 1 },
  { type: 'ALPHABETICAL', label: 'S', sortOrder: 2 },
  { type: 'ALPHABETICAL', label: 'M', sortOrder: 3 },
  { type: 'ALPHABETICAL', label: 'L', sortOrder: 4 },
  { type: 'ALPHABETICAL', label: 'XL', sortOrder: 5 },
  { type: 'ALPHABETICAL', label: 'XXL', sortOrder: 6 },
  { type: 'NUMERICAL', label: '36', numericValue: 36, sortOrder: 1 },
  { type: 'NUMERICAL', label: '38', numericValue: 38, sortOrder: 2 },
  { type: 'NUMERICAL', label: '40', numericValue: 40, sortOrder: 3 },
  { type: 'NUMERICAL', label: '42', numericValue: 42, sortOrder: 4 },
  { type: 'NUMERICAL', label: '44', numericValue: 44, sortOrder: 5 },
  { type: 'NUMERICAL', label: '46', numericValue: 46, sortOrder: 6 },
  { type: 'ONE_SIZE', label: 'One Size', sortOrder: 1 },
];

const ATTRIBUTES: Array<{
  slug: string;
  name: string;
  type: 'SELECT' | 'TEXT' | 'NUMBER';
  values: string[];
}> = [
  { slug: 'material', name: 'Material', type: 'SELECT', values: ['Cotton', 'Polyester', 'Wool', 'Linen', 'Denim', 'Leather', 'Silk', 'Viscose'] },
  { slug: 'fit', name: 'Fit', type: 'SELECT', values: ['Slim', 'Regular', 'Relaxed', 'Oversized'] },
  { slug: 'pattern', name: 'Pattern', type: 'SELECT', values: ['Plain', 'Striped', 'Checked', 'Printed', 'Floral'] },
  { slug: 'season', name: 'Season', type: 'SELECT', values: ['Spring', 'Summer', 'Autumn', 'Winter', 'All Season'] },
  { slug: 'gender', name: 'Gender', type: 'SELECT', values: ['Men', 'Women', 'Unisex', 'Kids'] },
  { slug: 'style', name: 'Style', type: 'SELECT', values: ['Casual', 'Formal', 'Sport', 'Classic', 'Street'] },
  { slug: 'composition', name: 'Fabric Composition', type: 'TEXT', values: [] },
];

const CATEGORIES: Array<{ slug: string; name: string; parent: string | null }> = [
  { slug: 'clothing', name: 'Clothing', parent: null },
  { slug: 'men', name: 'Men', parent: 'clothing' },
  { slug: 't-shirts', name: 'T-Shirts', parent: 'men' },
  { slug: 'shirts', name: 'Shirts', parent: 'men' },
  { slug: 'jackets', name: 'Jackets', parent: 'men' },
  { slug: 'women', name: 'Women', parent: 'clothing' },
  { slug: 'dresses', name: 'Dresses', parent: 'women' },
  { slug: 'coats', name: 'Coats', parent: 'women' },
  { slug: 'accessories', name: 'Accessories', parent: null },
  { slug: 'bags', name: 'Bags', parent: 'accessories' },
  { slug: 'belts', name: 'Belts', parent: 'accessories' },
  { slug: 'hats', name: 'Hats', parent: 'accessories' },
];

async function main(): Promise<void> {
  // --- RBAC ---
  const roleBySlug = new Map<string, { id: string }>();
  for (const role of ROLES) {
    const upserted = await prisma.role.upsert({
      where: { slug: role.slug },
      update: { name: role.name, description: role.description },
      create: role,
    });
    roleBySlug.set(role.slug, upserted);
  }

  for (const [slug, roleSlugs] of Object.entries(PERMISSIONS)) {
    const permission = await prisma.permission.upsert({
      where: { slug },
      update: {},
      create: { slug, description: `Phase 1 seed: ${slug}` },
    });
    for (const roleSlug of roleSlugs) {
      const role = roleBySlug.get(roleSlug);
      if (!role) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  // --- Reference data: colors / sizes / attributes ---
  for (const [name, displayName, slug, hexCode] of COLORS) {
    await prisma.color.upsert({
      where: { slug },
      update: { displayName, hexCode },
      create: { name, displayName, slug, hexCode },
    });
  }

  for (const size of SIZES) {
    await prisma.size.upsert({
      where: { type_label: { type: size.type, label: size.label } },
      update: { numericValue: size.numericValue ?? null, sortOrder: size.sortOrder },
      create: { ...size, numericValue: size.numericValue ?? null },
    });
  }

  for (const attr of ATTRIBUTES) {
    const attribute = await prisma.attribute.upsert({
      where: { slug: attr.slug },
      update: { name: attr.name, type: attr.type },
      create: { slug: attr.slug, name: attr.name, type: attr.type },
    });
    for (const [i, label] of attr.values.entries()) {
      const slug = label.toLowerCase().replace(/\s+/g, '-');
      await prisma.attributeValue.upsert({
        where: { attributeId_slug: { attributeId: attribute.id, slug } },
        update: { label, sortOrder: i },
        create: { attributeId: attribute.id, label, slug, sortOrder: i },
      });
    }
  }

  // --- Catalog scaffold ---
  await prisma.brand.upsert({
    where: { slug: 'base-wardrobe' },
    update: {},
    create: { name: 'Base Wardrobe', slug: 'base-wardrobe' },
  });

  for (const [i, [slug, name]] of [
    ['new-arrivals', 'New Arrivals'],
    ['summer-collection', 'Summer Collection'],
    ['best-sellers', 'Best Sellers'],
  ].entries()) {
    await prisma.collection.upsert({
      where: { slug },
      update: { sortOrder: i },
      create: { slug, name, sortOrder: i },
    });
  }

  for (const slug of ['new', 'sale', 'premium', 'summer', 'oversized']) {
    await prisma.tag.upsert({
      where: { slug },
      update: {},
      create: { slug, name: slug.charAt(0).toUpperCase() + slug.slice(1) },
    });
  }

  const categoryIds = new Map<string, string>();
  for (const cat of CATEGORIES) {
    const path = cat.parent ? `${await pathFor(cat.parent, categoryIds)}${cat.slug}/` : `/${cat.slug}/`;
    const created = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name },
      create: {
        name: cat.name,
        slug: cat.slug,
        path,
        parentId: cat.parent ? (categoryIds.get(cat.parent) ?? null) : null,
      },
    });
    categoryIds.set(cat.slug, created.id);
  }

  // --- Demo product: Classic T-Shirt with 4 SKU variants (Phase 1 example) ---
  const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: 'base-wardrobe' } });
  const black = await prisma.color.findUniqueOrThrow({ where: { slug: 'black' } });
  const white = await prisma.color.findUniqueOrThrow({ where: { slug: 'white' } });
  const sizeM = await prisma.size.findUniqueOrThrow({
    where: { type_label: { type: 'ALPHABETICAL', label: 'M' } },
  });
  const sizeL = await prisma.size.findUniqueOrThrow({
    where: { type_label: { type: 'ALPHABETICAL', label: 'L' } },
  });
  const material = await prisma.attribute.findUniqueOrThrow({ where: { slug: 'material' } });
  const cotton = await prisma.attributeValue.findUniqueOrThrow({
    where: { attributeId_slug: { attributeId: material.id, slug: 'cotton' } },
  });
  const fit = await prisma.attribute.findUniqueOrThrow({ where: { slug: 'fit' } });
  const regular = await prisma.attributeValue.findUniqueOrThrow({
    where: { attributeId_slug: { attributeId: fit.id, slug: 'regular' } },
  });

  const product = await prisma.product.upsert({
    where: { slug: 'classic-t-shirt' },
    update: {},
    create: {
      name: 'Classic T-Shirt',
      slug: 'classic-t-shirt',
      description: 'Heavyweight cotton tee. The Phase 1 directive example product.',
      brandId: brand.id,
      status: 'ACTIVE',
      basePrice: 890000,
      publishedAt: new Date(),
      categories: { create: [{ categoryId: categoryIds.get('t-shirts') ?? '' }] },
      tags: {
        create: [
          { tagId: (await prisma.tag.findUniqueOrThrow({ where: { slug: 'new' } })).id },
          { tagId: (await prisma.tag.findUniqueOrThrow({ where: { slug: 'premium' } })).id },
        ],
      },
      collections: {
        create: [
          { collectionId: (await prisma.collection.findUniqueOrThrow({ where: { slug: 'new-arrivals' } })).id },
        ],
      },
      media: {
        create: [
          { type: 'IMAGE', url: 'https://cdn.example.com/classic-tee-black.jpg', alt: 'Classic T-Shirt in Black', sortOrder: 0, isPrimary: true },
          { type: 'IMAGE', url: 'https://cdn.example.com/classic-tee-white.jpg', alt: 'Classic T-Shirt in White', sortOrder: 1 },
          { type: 'VIDEO', url: 'https://cdn.example.com/classic-tee.mp4', alt: 'Product video', sortOrder: 2 },
        ],
      },
      attributes: {
        create: [
          { attributeId: material.id, attributeValueId: cotton.id },
          { attributeId: fit.id, attributeValueId: regular.id },
        ],
      },
      variants: {
        create: [
          { sku: 'SKU-001', colorId: black.id, sizeId: sizeM.id },
          { sku: 'SKU-002', colorId: black.id, sizeId: sizeL.id },
          { sku: 'SKU-003', colorId: white.id, sizeId: sizeM.id },
          { sku: 'SKU-004', colorId: white.id, sizeId: sizeL.id },
        ],
      },
    },
  });

  // --- Demo customer account (thin User + normalized identity) ---
  const customerRole = roleBySlug.get('CUSTOMER');
  const existingPhone = await prisma.userPhone.findUnique({ where: { phone: '+989120000001' } });
  if (!existingPhone) {
    await prisma.user.create({
      data: {
        status: 'ACTIVE',
        profile: { create: { firstName: 'Demo', lastName: 'Customer' } },
        phones: { create: [{ phone: '+989120000001', isPrimary: true, verifiedAt: new Date() }] },
        roles: customerRole ? { create: [{ roleId: customerRole.id }] } : undefined,
      },
    });
  }
  void product;


  // --- DB PHASE 2: inventory, campaign, coupon demo data ---
  const tshirts = await prisma.category.findUnique({ where: { slug: 't-shirts' } });
  const variants = await prisma.productVariant.findMany({
    where: { product: { slug: 'classic-t-shirt' } },
    orderBy: { sku: 'asc' },
  });
  // On a FRESH reproducible database (migrations then seed) the phase-2
  // backfill had no legacy rows to preserve — ensure demo variants still get
  // authoritative current prices so catalog/checkout flows work everywhere.
  for (const variant of variants) {
    const hasPrice = await prisma.variantPrice.findFirst({ where: { variantId: variant.id, effectiveTo: null } });
    if (!hasPrice) {
      await prisma.variantPrice.create({ data: { variantId: variant.id, basePrice: 890_000, source: 'SYSTEM', note: 'seed current price (fresh-DB backfill equivalent)' } });
    }
  }

  const stockPerVariant = [25, 25, 25, 2]; // last one low-stock for demos
  for (const [i, variant] of variants.entries()) {
    const existing = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
    if (existing) continue;
    const qty = stockPerVariant[i] ?? 10;
    await prisma.inventory.create({ data: { variantId: variant.id, onHand: qty } });
    await prisma.inventoryMovement.create({
      data: {
        variantId: variant.id,
        type: 'RESTOCK',
        quantity: qty,
        onHandAfter: qty,
        reservedAfter: 0,
        source: 'SYSTEM',
        note: 'Phase 2 seed initial stock',
      },
    });
  }

  const campaign = await prisma.campaign.upsert({
    where: { slug: 'summer-sale' },
    update: {},
    create: {
      slug: 'summer-sale',
      name: 'Summer Sale',
      description: '10% off summer collection',
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 86_400_000),
    },
  });
  const existingRule = await prisma.campaignRule.findFirst({ where: { campaignId: campaign.id } });
  if (!existingRule && tshirts) {
    await prisma.campaignRule.create({
      data: {
        campaignId: campaign.id,
        discountType: 'PERCENT',
        percentOff: 10,
        maxDiscountAmount: 500_000,
        targets: { create: [{ targetType: 'CATEGORY', categoryId: tshirts.id }] },
      },
    });
  }

  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: {},
    create: {
      code: 'WELCOME10',
      status: 'ACTIVE',
      percentOff: 10,
      description: 'Welcome coupon — 10% off',
      minOrderAmount: 500_000,
      maxDiscountAmount: 200_000,
      startsAt: new Date(Date.now() - 3_600_000),
      usageLimitTotal: 100,
      usageLimitPerUser: 1,
    },
  });

  // --- DB PHASE 3: shipping methods + provinces ---
  for (const name of ['Tehran', 'Isfahan', 'Fars', 'Razavi Khorasan', 'East Azerbaijan', 'Alborz']) {
    await prisma.province.upsert({ where: { name }, update: {}, create: { name } });
  }
  const post = await prisma.shippingMethod.upsert({
    where: { id: (await prisma.shippingMethod.findFirst({ where: { name: 'Post Pishtaz' } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: { name: 'Post Pishtaz', carrier: 'Post', strategy: 'FLAT', basePrice: 60_000, estimatedDaysMin: 3, estimatedDaysMax: 7, sortOrder: 1 },
  });
  const tipax = await prisma.shippingMethod.upsert({
    where: { id: (await prisma.shippingMethod.findFirst({ where: { name: 'Tipax Express' } }))?.id ?? '00000000-0000-0000-0000-000000000000' },
    update: {},
    create: { name: 'Tipax Express', carrier: 'Tipax', strategy: 'WEIGHT_TIERED', basePrice: 85_000, perKgPrice: 12_000, freeShippingThreshold: 5_000_000, estimatedDaysMin: 1, estimatedDaysMax: 3, sortOrder: 0 },
  });
  const tehran = await prisma.province.findUnique({ where: { name: 'Tehran' } });
  if (tehran && !(await prisma.shippingMethodRate.findFirst({ where: { methodId: tipax.id, provinceId: tehran.id } }))) {
    await prisma.shippingMethodRate.create({
      data: { methodId: tipax.id, provinceId: tehran.id, basePrice: 70_000, perKgPrice: 10_000 },
    });
  }
  if (!(await prisma.shippingMethodRate.findFirst({ where: { methodId: post.id, provinceId: null } }))) {
    await prisma.shippingMethodRate.create({ data: { methodId: post.id } }); // countrywide default
  }

  // --- DB PHASE 4: permissions, config, flags, engagement demo ---
  const phase4Perms: Record<string, string[]> = {
    'reviews.moderate': ['SUPPORT', 'SUPER_ADMIN'],
    'reports.view': ['SUPER_ADMIN', 'FINANCE'],
    'settings.write': ['SUPER_ADMIN'],
  };
  for (const [slug, roleSlugs] of Object.entries(phase4Perms)) {
    const permission = await prisma.permission.upsert({
      where: { slug },
      update: { category: slug.split('.')[0] },
      create: { slug, description: `Phase 4 seed: ${slug}` },
    });
    for (const roleSlug of roleSlugs) {
      const role = roleBySlug.get(roleSlug);
      if (!role) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }
  await prisma.permission.updateMany({ where: { category: null }, data: { category: 'catalog' } });

  for (const [key, value, isPublic] of [
    ['store.name', 'Demo Fashion Store', true],
    ['store.supportPhone', '+989120000009', true],
    ['returns.windowDays', '7', false],
    ['shipping.freeThresholdToman', '5000000', false],
  ] as Array<[string, string, boolean]>) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value, isPublic, description: 'Phase 4 seed' },
    });
  }
  for (const [key, isEnabled] of [['reviews', true], ['campaigns', true], ['checkout.v2', false]] as Array<[string, boolean]>) {
    await prisma.featureFlag.upsert({
      where: { key },
      update: {},
      create: { key, isEnabled, description: 'Phase 4 seed flag' },
    });
  }

  const demoProduct = await prisma.product.findUnique({ where: { slug: 'classic-t-shirt' } });
  const demoUserPhone = await prisma.userPhone.findUnique({ where: { phone: '+989120000001' } });
  if (demoProduct && demoUserPhone && !(await prisma.review.findFirst({ where: { productId: demoProduct.id, userId: demoUserPhone.userId } }))) {
    await prisma.review.create({
      data: {
        productId: demoProduct.id, userId: demoUserPhone.userId,
        rating: 5, title: 'Great tee', body: 'Heavyweight and true to size. (dev seed review)',
        status: 'APPROVED',
      },
    });
  }
  if (demoUserPhone && !(await prisma.notification.findFirst({ where: { userId: demoUserPhone.userId } }))) {
    await prisma.notification.create({
      data: {
        userId: demoUserPhone.userId, type: 'GENERIC',
        title: 'Welcome to the demo store', body: 'This is a seeded development notification.',
        dedupeKey: 'seed:welcome:+989120000001',
        deliveries: { create: [{ channel: 'IN_APP', status: 'SENT', sentAt: new Date() }] },
      },
    });
  }
  const auditCount = await prisma.auditLog.count();
  if (auditCount === 0) {
    let prevHash: string | null = null;
    for (const action of ['SEED_DB_INITIALIZED', 'SEED_ROLES_CREATED', 'SEED_CATALOG_CREATED']) {
      const row = await prisma.auditLog.create({
        data: { actorType: 'SYSTEM', action, entityType: 'SYSTEM', prevHash, rowHash: 'seed-placeholder' },
      });
      void row;
      prevHash = `seed:${action}`;
    }
    // chain hashes recomputed properly by the application audit service
  }

  console.log('Phase 1-4 seed complete:', {
    roles: ROLES.length,
    permissions: Object.keys(PERMISSIONS).length,
    colors: COLORS.length,
    sizes: SIZES.length,
    attributes: ATTRIBUTES.length,
    categories: CATEGORIES.length,
  });
}

// Build "/clothing/men/t-shirts/" style paths from the parent chain.
async function pathFor(slug: string, ids: Map<string, string>): Promise<string> {
  const cat = CATEGORIES.find((c) => c.slug === slug);
  if (!cat) return `/${slug}/`;
  if (!cat.parent) return `/${slug}/`;
  return `${await pathFor(cat.parent, ids)}${slug}/`;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
