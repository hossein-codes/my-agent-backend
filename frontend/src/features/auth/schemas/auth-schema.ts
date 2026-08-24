import { z } from "zod";

/**
 * Frontend validation for auth forms (UX only — backend is authoritative).
 * Mirrors the backend class-validator rules so errors are caught early.
 */

export const iranianMobileSchema = z
  .string()
  .trim()
  .regex(/^\+989\d{9}$/, "شماره موبایل باید با +98 شروع شود (مثال: +989121234567)");

export const otpRequestSchema = z.object({
  phone: iranianMobileSchema,
});

export const otpVerifySchema = z.object({
  phone: iranianMobileSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "کد باید ۶ رقم باشد"),
});

export type OtpRequestForm = z.infer<typeof otpRequestSchema>;
export type OtpVerifyForm = z.infer<typeof otpVerifySchema>;
