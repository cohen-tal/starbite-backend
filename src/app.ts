import express, { Request, Response } from "express";
import { Pool } from "pg";
import multer from "multer";
import cors from "cors";
import {
  authenticateAccessToken,
  generateToken,
  authenticateRefreshToken,
} from "./middleware/auth";
import {
  RestaurantAPI,
  ReviewAPI,
  RestaurantDB,
  RestaurantPreviewCardAPI,
  Token,
  UserAPI,
} from "./types";
import { uploadImageToCloudinary } from "./utils";
import z from "zod";
import {
  UserDBSchema,
  RestaurantDBSchema,
  ReviewDBSchema,
  PatchReviewDBSchema,
} from "./validation";
import { RequestWithId } from "./middleware/auth";
import { parseToRestaurantAPI } from "./parser";

const DB = "postgresql://postgres:@localhost:5432/StarBite";

const app = express();
const port = 8080;

app.use(cors(), express.json(), express.urlencoded({ extended: true }));

const upload = multer();

const pool = new Pool({ connectionString: process.env.DB_URL });

pool
  .connect()
  .then(() => console.log("Connected to the database"))
  .catch((err) => console.error("Error connecting to the database", err));

app.get("/api/v1/home", async (req: Request, res: Response) => {
  const recentReviews = await pool.query(
    `SELECT reviews.id, reviews.text, reviews.rating, users.name, users.image
     FROM reviews
     JOIN users ON reviews.added_by = users.id
     ORDER BY reviews.date_added DESC
     LIMIT 5`
  );

  const recentRestaurants = await pool.query(
    `SELECT r.id, r.name, r.address, r.categories, json_agg(images.url) AS images
     FROM restaurants AS r
     JOIN images_restaurants AS images ON r.id = images.restaurant_id
     GROUP BY r.id  
     ORDER BY r.date_added DESC
     LIMIT 5`
  );

  res.json({
    reviews: recentReviews.rows,
    restaurants: recentRestaurants.rows,
  });
});

app.post("/api/v1/users", async (req: Request, res: Response) => {
  try {
    const user: z.infer<typeof UserDBSchema> = UserDBSchema.parse(req.body);

    const { rows: existingUser } = await pool.query<UserAPI>(
      "SELECT id, name, email, image FROM users WHERE email = $1",
      [user.email]
    );

    if (existingUser.length > 0) {
      res.status(200).json(existingUser[0]);
    } else {
      const { rows } = await pool.query<UserAPI>(
        "INSERT INTO users(name, email, image) VALUES($1, $2, $3) RETURNING id, name, email, image",
        [user.name, user.email, user.image]
      );
      const newUser: UserAPI = rows[0];

      res.status(200).json(newUser);
    }
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  }
});

app.post("/api/v1/auth/login", async (req, res) => {
  const userId = req.body.id;

  const { jwt, expiresAt } = generateToken("access", userId);
  const { jwt: refresh_jwt, expiresAt: refresh_expires } = generateToken(
    "refresh",
    userId
  );

  const accessToken: Token = {
    token: jwt,
    type: "access_token",
    expiresAt: expiresAt,
  };

  const refreshToken: Token = {
    token: refresh_jwt,
    type: "refresh_token",
    expiresAt: refresh_expires,
  };

  return res
    .status(200)
    .json({ accessToken: accessToken, refreshToken: refreshToken });
});

app.post(
  "/api/v1/auth/token",
  authenticateRefreshToken,
  (req: Request, res: Response) => {
    const id = req.body.userId;

    const { jwt, expiresAt } = generateToken("access", id);

    const accessToken: Token = {
      token: jwt,
      type: "access_token",
      expiresAt: expiresAt,
    };

    return res.status(200).json(accessToken);
  }
);

app.get("/api/v1/restaurants", async (req: Request, res: Response) => {
  const radius = req.query.radius ?? 2000; // default value of 2km radius near user location
  const userLocation = req.query.loc;

  try {
    if (!Array.isArray(userLocation) || !userLocation) {
      throw new Error("Invalid user location coordinates!");
    }

    const resultSet = await pool.query<RestaurantPreviewCardAPI>(
      `
        SELECT r.id, r.name, ROUND(AVG(reviews.rating), 2) AS rating, r.address, r.categories, json_agg(images.url) AS images
        FROM restaurants AS r
        JOIN images_restaurants AS images ON r.id = images.restaurant_id
        LEFT JOIN reviews ON r.id = reviews.restaurant_id
        WHERE ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
        GROUP BY r.id;
        `,
      [userLocation[1], userLocation[0], radius]
    );

    res.json(resultSet.rows);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: err });
  }
});

app.use(authenticateAccessToken);

// Restaurants API endpoints
app.post(
  "/api/v1/restaurants",
  upload.array("images", 5),
  async (req: RequestWithId, res: Response) => {
    let urls: string[] = [];
    try {
      const newRestaurant = RestaurantDBSchema.parse(req.body);

      if (req.files) {
        const promises = uploadImageToCloudinary(
          req.files as Express.Multer.File[]
        );

        urls = await Promise.all(promises);
      }

      const { rows } = await pool.query<{ id: string }>(
        "INSERT INTO restaurants(name, address, latitude, longitude, categories , added_by) values($1, $2, $3, $4, $5, $6) RETURNING id",
        [
          newRestaurant.name,
          newRestaurant.address,
          newRestaurant.lat,
          newRestaurant.lng,
          newRestaurant.categories,
          req.userId,
        ]
      );

      const restaurantId = rows[0].id;

      const urlsAdded = urls.map(
        async (url) =>
          await pool.query<{ url: string }>(
            "INSERT INTO images_restaurants(restaurant_id, url) VALUES($1, $2) RETURNING url",
            [restaurantId, url]
          )
      );

      const addedUrls = await Promise.all(urlsAdded);

      res.status(200).json({ id: restaurantId });
    } catch (err) {
      console.log(err);
      res.status(400);
    }
  }
);

app.get(
  "/api/v1/restaurants/:restaurantId",
  async (req: Request, res: Response) => {
    const restaurantId = req.params.restaurantId;

    try {
      const { rows } = await pool.query<RestaurantDB>(
        `SELECT 
            r.id,
            r.name, 
            r.latitude, 
            r.longitude, 
            r.date_added, 
            r.edited_at, 
            r.added_by, 
            r.address,
            r.categories,
            ROUND(AVG(CASE WHEN reviews.rating IS NOT NULL THEN reviews.rating ELSE 0 END), 2) AS rating,
            json_agg(images_restaurants.url) AS images,
            COALESCE(
                json_agg(
                    CASE 
                        WHEN reviews.id IS NOT NULL THEN 
                        json_build_object(
                            'id', reviews.id, 
                            'text', reviews.text, 
                            'rating', reviews.rating,
                            'likes', reviews.likes,
                            'dislikes', reviews.dislikes,
                            'date_added', reviews.date_added,
                            'edited_at', reviews.edited_at,
                            'added_by', reviews.added_by,
                            'author', json_build_object(
                                'id', users.id, 
                                'name', users.name, 
                                'email', users.email,
                                'image', users.image
                            ),
                            'images', json_build_object('url', images_reviews.url)
                        ) 
                        ELSE NULL 
                    END
                ) FILTER (WHERE reviews.id IS NOT NULL), '[]') AS reviews
        FROM restaurants AS r
        LEFT JOIN reviews ON r.id = reviews.restaurant_id
        LEFT JOIN users ON reviews.added_by = users.id
        LEFT JOIN images_restaurants ON r.id = images_restaurants.restaurant_id
        LEFT JOIN images_reviews ON reviews.id = images_reviews.review_id
        WHERE r.id = $1
        GROUP BY r.id;
        `,
        [restaurantId]
      );

      const result: RestaurantDB = rows[0];

      res.status(200).json(parseToRestaurantAPI(result));
    } catch (err) {
      console.log(err);

      res.status(400).json({
        message:
          "Failed retreiving restaurant from data. Please try again later.",
      });
    }
  }
);

/* Review API endpoints */

app.post(
  "/api/v1/reviews",
  upload.array("images", 5),
  async (req: RequestWithId, res: Response) => {
    const newReview = ReviewDBSchema.parse(req.body);

    try {
      const { rows } = await pool.query(
        "INSERT INTO reviews(rating, text, restaurant_id, added_by) VALUES($1, $2, $3, $4) RETURNING id",
        [newReview.rating, newReview.review, newReview.restaurantId, req.userId]
      );
      res.status(200).json({ id: rows[0].id });
    } catch (err) {
      console.log(err);
    }
  }
);

app.get(
  "/api/v1/edit/reviews/:reviewId",
  async (req: RequestWithId, res: Response) => {
    const reviewId = req.params.reviewId;

    try {
      const { rows } = await pool.query(
        "SELECT reviews.text, reviews.rating FROM reviews WHERE reviews.id = $1 AND reviews.added_by = $2",
        [reviewId, req.userId]
      );

      console.dir(rows);

      res.json(rows);
    } catch (err) {
      console.log(err);
      res
        .status(400)
        .json({ message: "Error getting review data. Please try again later" });
    }
  }
);

app.patch(
  "/api/v1/reviews",
  upload.array("images", 5),
  async (req: RequestWithId, res: Response) => {
    const patchedReview = PatchReviewDBSchema.parse(req.body);

    try {
      const { rows } = await pool.query(
        `UPDATE reviews 
       SET text = $1, rating = $2, edited_at = $3
       WHERE reviews.id = $4 AND reviews.added_by = $5
       RETURNING text, rating, edited_at`,
        [
          patchedReview.review,
          patchedReview.rating,
          new Date().toISOString(),
          patchedReview.id,
          req.userId,
        ]
      );

      return res.json(rows[0]);
    } catch (err) {
      console.log(err);
      res
        .status(400)
        .json({ message: "Error updating review. Please try again later" });
    }
  }
);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
