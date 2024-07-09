import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

export function uploadImageToCloudinary(
  images: Express.Multer.File[]
): Promise<string>[] {
  const imagesURLs: Promise<string>[] = [];

  images.forEach((image) => {
    imagesURLs.push(
      new Promise((resolve, reject) => {
        cloudinary.config({
          cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          api_key: process.env.CLOUDINARY_API_KEY,
          api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        const data: string =
          `data:${image.mimetype};base64,` + image.buffer.toString("base64");

        cloudinary.uploader.upload(
          data,
          { folder: "restaurant-review-app" },
          (err, result) => {
            if (err) {
              reject(err);
            } else if (result) {
              resolve(result.secure_url);
            }
          }
        );
      })
    );
  });

  return imagesURLs;
}
