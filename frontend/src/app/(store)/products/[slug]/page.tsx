import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { productsApi } from "@/features/products";
import { ProductDetailView } from "@/features/products/components/product-detail-view";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const p = await productsApi.getBySlug(slug);
    return {
      title: p.seo.title ? `${p.seo.title} | لومینا` : `${p.name} | لومینا`,
      description:
        p.seo.description ?? p.description ?? `خرید ${p.name} از فروشگاه لومینا`,
    };
  } catch {
    return { title: "محصول | لومینا" };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  // Existence check server-side so bad slugs 404 immediately.
  const exists = await productsApi
    .getBySlug(slug)
    .then(() => true)
    .catch(() => false);
  if (!exists) notFound();

  return <ProductDetailView slug={slug} />;
}
