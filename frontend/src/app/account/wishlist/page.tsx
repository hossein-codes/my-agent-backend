import { redirect } from "next/navigation";

/** Canonical wishlist lives at /wishlist — this alias keeps account links tidy. */
export default function AccountWishlistPage() {
  redirect("/wishlist");
}
