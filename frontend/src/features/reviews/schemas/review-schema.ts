import { z } from "zod";

export const reviewSchema = z.object({
  rating: z.number().int().min(1, "امتیاز را انتخاب کنید").max(5),
  title: z.string().max(200).optional(),
  body: z.string().max(2000).optional(),
});

export type ReviewFormValues = z.infer<typeof reviewSchema>;
