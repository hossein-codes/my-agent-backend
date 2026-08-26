/**
 * DEMO CATALOG SEED — idempotent, safe to re-run.
 *
 * Riches the storefront with realistic Persian demo data so the home page,
 * rails and (later) listing/detail pages render a believable shop:
 *   - Persian names for the existing reference categories
 *   - a few extra categories (pants, watches, shoes, beauty)
 *   - 5 fashion brands
 *   - ~16 products with variants, real prices, sale prices, stock, tags
 *   - an active flash-sale campaign with a countdown deadline
 *
 * Product images intentionally point at the FRONTEND's bundled assets
 * (`/mock/p-*.jpg` shipped in `frontend/public/mock`): relative URLs resolve
 * against the storefront origin, so the demo works offline on any machine.
 */
import { loadEnvFiles } from './env-loader';
import { PrismaClient } from '@prisma/client';

loadEnvFiles(['.env', '.env.development'], 'DATABASE_URL');

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// reference lookups
// ---------------------------------------------------------------------------
const NOW = new Date();
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

async function colorId(slug: string): Promise<string> {
  return (await prisma.color.findUniqueOrThrow({ where: { slug } })).id;
}
async function sizeId(type: string, label: string): Promise<string> {
  return (await prisma.size.findUniqueOrThrow({ where: { type_label: { type: type as never, label } } })).id;
}

// ---------------------------------------------------------------------------
// categories — rename reference tree to Persian + add demo branches
// ---------------------------------------------------------------------------
const RENAMES: Array<[slug: string, name: string]> = [
  ['clothing', 'پوشاک'],
  ['men', 'مردانه'],
  ['women', 'زنانه'],
  ['t-shirts', 'تی‌شرت'],
  ['shirts', 'پیراهن'],
  ['jackets', 'کاپشن و ژاکت'],
  ['dresses', 'پیراهن زنانه'],
  ['coats', 'کت و پالتو'],
  ['accessories', 'اکسسوری'],
  ['bags', 'کیف'],
  ['belts', 'کمربند'],
  ['hats', 'کلاه'],
];

/** [slug, faName, parentSlug, sortOrder] — parent path is resolved at runtime. */
const NEW_CATEGORIES: Array<[string, string, string, number]> = [
  ['pants-men', 'شلوار مردانه', 'men', 40],
  ['pants-women', 'شلوار زنانه', 'women', 40],
  ['watches', 'ساعت', 'accessories', 40],
  ['shoes', 'کفش', '', 30],
  ['sneakers', 'کتانی روزمره', 'shoes', 10],
  ['boots', 'بوت', 'shoes', 20],
  ['beauty', 'زیبایی و عطر', '', 40],
];

const BRANDS: Array<{ name: string; slug: string }> = [
  { name: 'Nordwear', slug: 'nordwear' },
  { name: 'Zen Denim', slug: 'zen-denim' },
  { name: 'Lumière', slug: 'lumiere' },
  { name: 'Caspian Leather', slug: 'caspian-leather' },
];

// ---------------------------------------------------------------------------
// products
// ---------------------------------------------------------------------------
interface DemoVariant {
  color: string;
  size: [type: string, label: string];
  skuSuffix: string;
  stock: number;
}
interface DemoProduct {
  slug: string;
  name: string;
  description: string;
  brandSlug: string;
  categorySlug: string;
  image: string; // relative to the storefront origin (frontend/public/mock)
  basePrice: number;
  salePrice?: number;
  featured?: boolean;
  tags?: string[];
  collection?: string;
  publishedDaysAgo: number;
  variants: DemoVariant[];
}

const alphabet = (labels: string[]) =>
  labels.map((l) => ['ALPHABETICAL', l] as [string, string]);

const PRODUCTS: DemoProduct[] = [
  {
    slug: 'oversized-tee-black',
    name: 'تی‌شرت اورسایز مشکی',
    description: 'نخی سنگین ۲۲۰ گرم، یقه‌ی گرد، برش اورسایز راحت. ست‌شدنی با هر استایل روزمره.',
    brandSlug: 'nordwear', categorySlug: 't-shirts', image: '/mock/p-black-tee.jpg',
    basePrice: 750_000, featured: true, tags: ['oversized', 'new'], collection: 'new-arrivals',
    publishedDaysAgo: 2,
    variants: [
      { color: 'black', size: ['ALPHABETICAL', 'M'], skuSuffix: 'BLK-M', stock: 24 },
      { color: 'black', size: ['ALPHABETICAL', 'L'], skuSuffix: 'BLK-L', stock: 18 },
      { color: 'white', size: ['ALPHABETICAL', 'M'], skuSuffix: 'WHT-M', stock: 12 },
    ],
  },
  {
    slug: 'linen-shirt',
    name: 'پیراهن کتان آستین‌بلند',
    description: 'پارچه‌ی کتان خنک، مناسب گرم‌ترین روزهای سال. رنگ بژ ملایم با دکمه‌های صدفی.',
    brandSlug: 'nordwear', categorySlug: 'shirts', image: '/mock/p-knit.jpg',
    basePrice: 1_450_000, tags: ['new'], collection: 'new-arrivals', publishedDaysAgo: 4,
    variants: [
      { color: 'beige', size: ['ALPHABETICAL', 'M'], skuSuffix: 'BEI-M', stock: 14 },
      { color: 'beige', size: ['ALPHABETICAL', 'L'], skuSuffix: 'BEI-L', stock: 10 },
      { color: 'navy', size: ['ALPHABETICAL', 'L'], skuSuffix: 'NVY-L', stock: 9 },
    ],
  },
  {
    slug: 'winter-knit-sweater',
    name: 'سویشرت بافت زمستانی',
    description: 'بافت ضخیم با پشم ترکیبی، یقه‌ی گرد و بافت ریشه‌ای. گرمای واقعی برای روزهای سرد.',
    brandSlug: 'lumiere', categorySlug: 'jackets', image: '/mock/p-knit.jpg',
    basePrice: 1_890_000, salePrice: 1_490_000, tags: ['premium', 'sale'], publishedDaysAgo: 9,
    variants: [
      { color: 'brown', size: ['ALPHABETICAL', 'L'], skuSuffix: 'BRN-L', stock: 11 },
      { color: 'gray', size: ['ALPHABETICAL', 'XL'], skuSuffix: 'GRY-XL', stock: 7 },
    ],
  },
  {
    slug: 'puffer-jacket',
    name: 'کاپشن پافر مردانه',
    description: 'پرکن عزیق‌دوز، ضدآب و باد؛ جیب داخلی مخفی و آستین‌های تنظیم‌شونده.',
    brandSlug: 'nordwear', categorySlug: 'jackets', image: '/mock/p-jacket.jpg',
    basePrice: 4_200_000, featured: true, tags: ['premium', 'new'], collection: 'best-sellers',
    publishedDaysAgo: 6,
    variants: [
      { color: 'black', size: ['ALPHABETICAL', 'L'], skuSuffix: 'BLK-L', stock: 8 },
      { color: 'black', size: ['ALPHABETICAL', 'XL'], skuSuffix: 'BLK-XL', stock: 6 },
      { color: 'navy', size: ['ALPHABETICAL', 'L'], skuSuffix: 'NVY-L', stock: 5 },
    ],
  },
  {
    slug: 'straight-denim',
    name: 'شلوار جین راسته',
    description: 'دنیم ۱۲ اونس با شستشوی ملایم، برش راسته‌ی کلاسیک که هیچ‌وقت از مد نمی‌افتد.',
    brandSlug: 'zen-denim', categorySlug: 'pants-men', image: '/mock/p-denim.jpg',
    basePrice: 2_350_000, featured: true, tags: ['premium'], collection: 'best-sellers',
    publishedDaysAgo: 7,
    variants: [
      { color: 'navy', size: ['NUMERICAL', '40'], skuSuffix: 'NVY-40', stock: 12 },
      { color: 'navy', size: ['NUMERICAL', '42'], skuSuffix: 'NVY-42', stock: 10 },
      { color: 'black', size: ['NUMERICAL', '40'], skuSuffix: 'BLK-40', stock: 8 },
    ],
  },
  {
    slug: 'mom-jeans',
    name: 'شلوار جین مام‌فیت',
    description: 'کمر بلند و برش مام‌فیت، دنیم کشسان راحت؛ محبوب‌ترین برش فصل.',
    brandSlug: 'zen-denim', categorySlug: 'pants-women', image: '/mock/p-denim.jpg',
    basePrice: 2_190_000, salePrice: 1_750_000, tags: ['sale', 'summer'], publishedDaysAgo: 12,
    variants: [
      { color: 'navy', size: ['NUMERICAL', '38'], skuSuffix: 'NVY-38', stock: 9 },
      { color: 'navy', size: ['NUMERICAL', '40'], skuSuffix: 'NVY-40', stock: 14 },
    ],
  },
  {
    slug: 'evening-dress',
    name: 'پیراهن مجلسی زنانه',
    description: 'پارچه‌ی خزدار با برش آستین‌بلند؛ انتخاب اول برای مراسم‌های شبانه.',
    brandSlug: 'lumiere', categorySlug: 'dresses', image: '/mock/p-dress.jpg',
    basePrice: 3_850_000, salePrice: 2_990_000, featured: true, tags: ['premium', 'sale'],
    collection: 'best-sellers', publishedDaysAgo: 3,
    variants: [
      { color: 'red', size: ['ALPHABETICAL', 'S'], skuSuffix: 'RED-S', stock: 6 },
      { color: 'red', size: ['ALPHABETICAL', 'M'], skuSuffix: 'RED-M', stock: 4 },
      { color: 'black', size: ['ALPHABETICAL', 'M'], skuSuffix: 'BLK-M', stock: 5 },
    ],
  },
  {
    slug: 'summer-dress',
    name: 'پیراهن تابستانی طرح‌دار',
    description: 'وزن سبک، طرح گل‌دار و دامن پلیسه؛ برای روزهای گرم و سفرهای ساحلی.',
    brandSlug: 'lumiere', categorySlug: 'dresses', image: '/mock/p-dress.jpg',
    basePrice: 1_690_000, tags: ['summer', 'new'], collection: 'summer-collection',
    publishedDaysAgo: 1,
    variants: [
      { color: 'pink', size: ['ALPHABETICAL', 'S'], skuSuffix: 'PNK-S', stock: 10 },
      { color: 'pink', size: ['ALPHABETICAL', 'M'], skuSuffix: 'PNK-M', stock: 13 },
    ],
  },
  {
    slug: 'wool-coat',
    name: 'کت پشمی زنانه',
    description: 'پشم وارداتی با آستر ساتن؛ برش بلند و کمربند کمرِ همرنگ.',
    brandSlug: 'lumiere', categorySlug: 'coats', image: '/mock/p-knit.jpg',
    basePrice: 4_950_000, featured: true, tags: ['premium'], collection: 'best-sellers',
    publishedDaysAgo: 10,
    variants: [
      { color: 'beige', size: ['ALPHABETICAL', 'M'], skuSuffix: 'BEI-M', stock: 5 },
      { color: 'beige', size: ['ALPHABETICAL', 'L'], skuSuffix: 'BEI-L', stock: 3 },
    ],
  },
  {
    slug: 'leather-tote-bag',
    name: 'کیف چرم دست‌دوز',
    description: 'چرم طبیعی گاوی با دوخت دست؛ جادار، با جیب داخلی زیپ‌دار و بند قابل تنظیم.',
    brandSlug: 'caspian-leather', categorySlug: 'bags', image: '/mock/p-bag.jpg',
    basePrice: 5_400_000, salePrice: 4_600_000, featured: true, tags: ['premium', 'sale'],
    collection: 'best-sellers', publishedDaysAgo: 8,
    variants: [
      { color: 'brown', size: ['ONE_SIZE', 'One Size'], skuSuffix: 'OS', stock: 6 },
      { color: 'black', size: ['ONE_SIZE', 'One Size'], skuSuffix: 'OS-BLK', stock: 4 },
    ],
  },
  {
    slug: 'classic-watch',
    name: 'ساعت مچی کلاسیک',
    description: 'بدنه‌ی استیل با صفحه‌ی مینیمال و بند چرمی؛ ضدآب تا ۵ اتمسفر.',
    brandSlug: 'caspian-leather', categorySlug: 'watches', image: '/mock/p-watch.jpg',
    basePrice: 3_250_000, featured: true, tags: ['premium'], collection: 'best-sellers',
    publishedDaysAgo: 11,
    variants: [
      { color: 'brown', size: ['ONE_SIZE', 'One Size'], skuSuffix: 'BRN', stock: 9 },
      { color: 'black', size: ['ONE_SIZE', 'One Size'], skuSuffix: 'BLK', stock: 2 }, // low-stock demo
    ],
  },
  {
    slug: 'daily-sneakers',
    name: 'کتانی روزمره سفید',
    description: 'چرم مصنوعی پوشش‌داده، زیره‌ی فوم سبک؛ راحتی تمام‌روز برای پیاده‌روی شهری.',
    brandSlug: 'nordwear', categorySlug: 'sneakers', image: '/mock/p-sneakers.jpg',
    basePrice: 2_750_000, featured: true, tags: ['new'], collection: 'new-arrivals',
    publishedDaysAgo: 5,
    variants: [
      { color: 'white', size: ['NUMERICAL', '40'], skuSuffix: 'WHT-40', stock: 15 },
      { color: 'white', size: ['NUMERICAL', '42'], skuSuffix: 'WHT-42', stock: 12 },
      { color: 'white', size: ['NUMERICAL', '44'], skuSuffix: 'WHT-44', stock: 7 },
    ],
  },
  {
    slug: 'leather-boots',
    name: 'بوت چرم مردانه',
    description: 'چرم واکس‌خورده با زیره‌ی دوخت‌گوودیر؛ ساخت برای چند زمین متوالی.',
    brandSlug: 'caspian-leather', categorySlug: 'boots', image: '/mock/p-boots.jpg',
    basePrice: 3_950_000, tags: ['premium'], publishedDaysAgo: 14,
    variants: [
      { color: 'brown', size: ['NUMERICAL', '42'], skuSuffix: 'BRN-42', stock: 6 },
      { color: 'black', size: ['NUMERICAL', '44'], skuSuffix: 'BLK-44', stock: 0 },
    ],
  },
  {
    slug: 'noir-perfume',
    name: 'ادوپرفیوم نُوار',
    description: 'رایحه‌ی چوبی-تند با پایه‌ی وتیور و کهربا؛ ماندگاری بالا، ماندگاری ۸ ساعت.',
    brandSlug: 'lumiere', categorySlug: 'beauty', image: '/mock/p-perfume.jpg',
    basePrice: 1_980_000, salePrice: 1_590_000, tags: ['sale', 'new'], publishedDaysAgo: 2,
    variants: [
      { color: 'black', size: ['ONE_SIZE', 'One Size'], skuSuffix: 'OS', stock: 20 },
    ],
  },
];

// ---------------------------------------------------------------------------
async function main() {
  // --- 1) Persian names for the reference tree --------------------------------
  for (const [slug, name] of RENAMES) {
    await prisma.category.updateMany({ where: { slug }, data: { name } });
  }

  // --- 2) new branches --------------------------------------------------------
  for (const [slug, name, parentSlug, sortOrder] of NEW_CATEGORIES) {
    const exists = await prisma.category.findUnique({ where: { slug } });
    if (exists) continue;
    const parent = parentSlug
      ? await prisma.category.findUniqueOrThrow({ where: { slug: parentSlug } })
      : null;
    await prisma.category.create({
      data: {
        name,
        slug,
        parentId: parent?.id,
        path: parent ? `${parent.path}${slug}/` : `/${slug}/`,
        sortOrder,
      },
    });
  }

  // --- 3) brands ---------------------------------------------------------------
  for (const b of BRANDS) {
    await prisma.brand.upsert({
      where: { slug: b.slug },
      update: {},
      create: { name: b.name, slug: b.slug },
    });
  }

  // --- 4) classic demo product: point media at the bundled asset ---------------
  const classic = await prisma.product.findUnique({ where: { slug: 'classic-t-shirt' } });
  if (classic) {
    await prisma.product.update({
      where: { id: classic.id },
      data: {
        name: 'تی‌شرت کلاسیک نخی',
        description: 'تی‌شرت نخی سنگین با یقه‌ی گرد؛ مثالِ فاز ۱ حالا با عکس واقعی.',
      },
    });
    const hasRealMedia = await prisma.productMedia.findFirst({
      where: { productId: classic.id, url: { startsWith: '/mock/' } },
    });
    if (!hasRealMedia) {
      await prisma.productMedia.deleteMany({ where: { productId: classic.id } });
      await prisma.productMedia.create({
        data: {
          productId: classic.id,
          type: 'IMAGE',
          url: '/mock/p-black-tee.jpg',
          alt: 'تی‌شرت کلاسیک نخی',
          sortOrder: 0,
          isPrimary: true,
        },
      });
    }
  }

  // --- 5) products --------------------------------------------------------------
  let created = 0;
  for (const p of PRODUCTS) {
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) continue;

    const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: p.brandSlug } });
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: p.categorySlug } });
    const tagIds = p.tags?.length
      ? await prisma.tag.findMany({ where: { slug: { in: p.tags } } })
      : [];
    const collectionId = p.collection
      ? (await prisma.collection.findUnique({ where: { slug: p.collection } }))?.id
      : undefined;

    const product = await prisma.product.create({
      data: {
        name: p.name,
        slug: p.slug,
        description: p.description,
        brandId: brand.id,
        status: 'ACTIVE',
        isFeatured: p.featured ?? false,
        basePrice: p.basePrice,
        publishedAt: daysAgo(p.publishedDaysAgo),
        categories: { create: [{ categoryId: category.id }] },
        tags: tagIds.length ? { create: tagIds.map((t) => ({ tagId: t.id })) } : undefined,
        collections: collectionId ? { create: [{ collectionId }] } : undefined,
        media: {
          create: [
            { type: 'IMAGE', url: p.image, alt: p.name, sortOrder: 0, isPrimary: true },
          ],
        },
        variants: {
          create: await Promise.all(
            p.variants.map(async (v) => ({
              sku: `${p.slug.toUpperCase().slice(0, 12)}-${v.skuSuffix}`,
              colorId: await colorId(v.color),
              sizeId: await sizeId(v.size[0], v.size[1]),
            })),
          ),
        },
      },
    });
    created++;

    // current price row + inventory + movement for each variant
    const variants = await prisma.productVariant.findMany({
      where: { productId: product.id },
      orderBy: { sku: 'asc' },
    });
    for (const [i, variant] of variants.entries()) {
      const stock = p.variants[i]?.stock ?? 5;
      const hasPrice = await prisma.variantPrice.findFirst({
        where: { variantId: variant.id, effectiveTo: null },
      });
      if (!hasPrice) {
        await prisma.variantPrice.create({
          data: {
            variantId: variant.id,
            basePrice: p.basePrice,
            salePrice: p.salePrice,
            source: 'ADMIN',
            note: 'demo catalog seed',
          },
        });
      }
      const hasInventory = await prisma.inventory.findUnique({ where: { variantId: variant.id } });
      if (!hasInventory) {
        await prisma.inventory.create({ data: { variantId: variant.id, onHand: stock } });
        await prisma.inventoryMovement.create({
          data: {
            variantId: variant.id,
            type: 'RESTOCK',
            quantity: stock,
            onHandAfter: stock,
            reservedAfter: 0,
            source: 'ADMIN',
            note: 'demo catalog seed initial stock',
          },
        });
      }
    }
  }

  // --- 6) flash-sale campaign with a live countdown -----------------------------
  const flash = await prisma.campaign.upsert({
    where: { slug: 'flash-sale' },
    update: { status: 'ACTIVE', endsAt: hoursFromNow(36) },
    create: {
      slug: 'flash-sale',
      name: 'فروش ویژه پایان فصل',
      description: 'تخفیف‌های محدود روی منتخب محصولات — تا پایان مهلت شمارش‌معکوس.',
      status: 'ACTIVE',
      startsAt: daysAgo(1),
      endsAt: hoursFromNow(36),
    },
  });
  const hasRule = await prisma.campaignRule.findFirst({ where: { campaignId: flash.id } });
  if (!hasRule) {
    await prisma.campaignRule.create({
      data: {
        campaignId: flash.id,
        discountType: 'PERCENT',
        percentOff: 15,
        priority: 10,
      },
    });
  }

  const counts = {
    products: await prisma.product.count(),
    brands: await prisma.brand.count(),
    categories: await prisma.category.count(),
    createdNow: created,
  };
  console.log('Demo catalog seed complete:', counts);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
