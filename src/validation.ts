import z from "zod";

const MAX_FILE_SIZE = 5000000; // 2MB
const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
];

export const UserDBSchema = z.object({
  name: z
    .string()
    .min(2, "Must be a minimum length of 2.")
    .max(100, "Max length is 100 characters."),
  email: z
    .string()
    .min(7, "Must be a minimum length of 7.")
    .max(100, "Max length is 100 characters."),
  image: z
    .string()
    .min(10, "Must be a minimum length of 10.")
    .max(100, "Max length is 100 characters."),
});

// Define a schema for a single file
const ImageFileSchema = z
  .instanceof(File)
  .refine((file) => ACCEPTED_IMAGE_TYPES.includes(file.type), {
    message: "Invalid file type. Only JPEG, JPG, PNG and webp are allowed.",
  })
  .refine((file) => file.size <= MAX_FILE_SIZE, {
    message: `File size should be less than or equal to ${
      MAX_FILE_SIZE / 1000000
    }MB.`,
  });

export const RestaurantDBSchema = z.object({
  name: z
    .string()
    .min(2, "Must be a minimum length of 2.")
    .max(100, "Max length is 100 characters."),
  description: z.string().max(255, "Max length is 255 characters.").optional(),
  address: z
    .string()
    .min(2, "Min length is 2 characters.")
    .max(255, "Max length is 255 characters."),
  lat: z.string().transform(Number),
  lng: z.string().transform(Number),
  images: z.array(ImageFileSchema).optional(),
  categories: z.array(z.string()).min(1).max(5),
});

export const ReviewDBSchema = z.object({
  restaurantId: z.string(),
  review: z.string().max(255, "Max length is 255 characters.").optional(),
  rating: z
    .string()
    .transform(Number)
    .refine((val) => !isNaN(val) && val >= 0.5 && val <= 5, {
      message: "Rating must be a valid number between 0.5 and 5.",
    }),
  images: z.array(ImageFileSchema).optional(),
});

export const PatchReviewDBSchema = z.object({
  id: z.string(),
  review: z.string().max(255, "Max length is 255 characters.").optional(),
  rating: z
    .string()
    .transform(Number)
    .refine((val) => !isNaN(val) && val >= 0.5 && val <= 5, {
      message: "Rating must be a valid number between 0.5 and 5.",
    }),
  images: z.array(ImageFileSchema).optional(),
});
