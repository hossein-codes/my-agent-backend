import type { Metadata } from "next";
import { ProductListing } from "@/features/products/components/product-listing";

export const metadata: Metadata = {
  title: "همه محصولات | لومینا",
  description: "خرید پوشاک و اکسسوری از برندهای منتخب — فروشگاه لومینا",
};

export default function ProductsIndexPage() {
  return (
    <div className="flex flex-col gap-3">
      <div className="px-4 pt-2">
        <h1 className="text-lg font-extrabold tracking-tight">همه محصولات</h1>
      </div>
      <ProductListing />
    </div>
  );
}
