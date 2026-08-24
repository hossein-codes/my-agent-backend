import { z } from "zod";

/**
 * Frontend UX validation for the checkout form. Mirrors the backend
 * AddressDto/CheckoutSubmitDto rules; the backend remains authoritative.
 */

export const iranMobileSchema = z
  .string()
  .regex(/^\+989\d{9}$/, "شماره موبایل باید با +98 شروع شود");

export const postalCodeSchema = z
  .string()
  .regex(/^\d{10}$/, "کد پستی باید ۱۰ رقم باشد");

export const addressSchema = z.object({
  receiverFirstName: z.string().min(1, "نام را وارد کنید").max(80),
  receiverLastName: z.string().min(1, "نام خانوادگی را وارد کنید").max(80),
  receiverPhone: iranMobileSchema,
  provinceName: z.string().min(1, "استان را انتخاب کنید").max(80),
  cityName: z.string().min(1, "شهر را انتخاب کنید").max(80),
  district: z.string().max(120).optional(),
  postalCode: postalCodeSchema,
  line: z.string().min(1, "نشانی را وارد کنید").max(300),
  unit: z.string().max(40).optional(),
  deliveryNotes: z.string().max(300).optional(),
});

export const checkoutFormSchema = addressSchema.extend({
  shippingMethodId: z.string().min(1, "روش ارسال را انتخاب کنید"),
  couponCode: z.string().max(32).optional(),
});

export type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;
export type AddressFormValues = z.infer<typeof addressSchema>;
