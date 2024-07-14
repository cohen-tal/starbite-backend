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
});

export const ReviewDBSchema = z.object({
  review: z.string().max(255, "Max length is 255 characters.").optional(),
  rating: z
    .number()
    .min(0.5, "Minimun star rating is 0.5 stars.")
    .max(5, "Maximum star rating is 5 stars."),
  images: z.array(ImageFileSchema).optional(),
});
