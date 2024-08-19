import express, { Request, Response } from "express";
import { Pool } from "pg";
import multer from "multer";
import cors, { CorsOptions } from "cors";
import {
  authenticateAccessToken,
  generateToken,
  authenticateRefreshToken,
} from "./middleware/auth";
import {
  RestaurantDB,
  RestaurantPreviewCardAPI,
  Token,
  UserAPI,
  RecentReviewDB,
  RecentRestaurant,
  UserProfileData,
  ReviewsDB,
  SearchedRestaurant,
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
import {
  parseToHistoryReview,
  parseToRecentReview,
  parseToRestaurantAPI,
} from "./parser";

const DB = "postgresql://postgres:@localhost:5432/StarBite";

const app = express();
const port = process.env.PORT || 8080;

const corsOptions: CorsOptions = {
  allowedHeaders: ["GET", "POST", "PATCH", "DELETE"],
  origin: "https://starbite-reviews.vercel.app",
};

app.use(cors(), express.json(), express.urlencoded({ extended: true }));

const upload = multer();

const pool = new Pool({ connectionString: process.env.DB_URL });

pool
  .connect()
  .then(() => console.log("Connected to the database"))
  .catch((err) => console.error("Error connecting to the database", err));

app.get("/api/v1/home", async (req: Request, res: Response) => {
  const recentReviews = await pool.query<RecentReviewDB>(
    `SELECT 
      reviews.id, 
      reviews.text, 
      reviews.rating,
      reviews.restaurant_id, 
      users.name, 
      users.image,
      COALESCE(json_agg(images.url) FILTER (WHERE images.url IS NOT NULL),'[]') AS images
     FROM reviews
     JOIN users ON reviews.added_by = users.id
     LEFT JOIN images_reviews AS images ON images.review_id = reviews.id
     GROUP BY reviews.id, users.name, users.image
     ORDER BY reviews.date_added DESC
     LIMIT 30`
  );

  console.log(recentReviews.rows);

  const recentRestaurants = await pool.query<RecentRestaurant>(
    `SELECT r.id, r.name, r.address, r.categories, COALESCE(ROUND(AVG(reviews.rating), 2), 0) AS rating, json_agg(images.url) AS images
     FROM restaurants AS r
     JOIN images_restaurants AS images ON r.id = images.restaurant_id
     LEFT JOIN reviews ON r.id = reviews.restaurant_id
     GROUP BY r.id  
     ORDER BY r.date_added DESC
     LIMIT 3`
  );

  res.json({
    restaurants: recentRestaurants.rows,
    reviews: recentReviews.rows.map((reviewDB) =>
      parseToRecentReview(reviewDB)
    ),
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
    // return the restaurants added in descending order from newly added to old
    if (!Array.isArray(userLocation) || !userLocation) {
      const resultSet = await pool.query<RestaurantPreviewCardAPI>(
        `
          SELECT 
            r.id, 
            r.name, 
            r.address, 
            r.categories, 
            ROUND(AVG(reviews.rating), 2) AS rating, 
            json_agg(images.url) AS images
          FROM restaurants AS r
          JOIN images_restaurants AS images ON r.id = images.restaurant_id
          LEFT JOIN reviews ON r.id = reviews.restaurant_id
          GROUP BY r.id
          ORDER BY r.date_added DESC;
          `
      );
      return res.json(resultSet.rows);
    }

    //return the restaurants within a certain radius of the current location of the user
    const resultWithinRadius = await pool.query<RestaurantPreviewCardAPI>(
      `
        SELECT 
          r.id, 
          r.name, 
          r.address, 
          r.categories, 
          ROUND(AVG(reviews.rating), 2) AS rating, 
          json_agg(images.url) AS images
        FROM restaurants AS r
        JOIN images_restaurants AS images ON r.id = images.restaurant_id
        LEFT JOIN reviews ON r.id = reviews.restaurant_id
        WHERE ST_DWithin(r.location, ST_SetSRID(ST_MakePoint($1, $2), 4326), $3)
        GROUP BY r.id;
        `,
      [userLocation[1], userLocation[0], radius]
    );

    res.json(resultWithinRadius.rows);
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .json({ message: "Internal error, please try again later." });
  }
});

app.get("/api/v1/search", async (req: Request, res: Response) => {
  const searchBy = req.query.q;

  try {
    const { rows } = await pool.query<SearchedRestaurant>(
      `
      WITH search_res AS (
      SELECT r.id, r.name, r.address
      FROM restaurants AS r
      WHERE r.name ILIKE $1
      ORDER BY r.date_added DESC
      )
      SELECT search_res.*, first_image.url AS image
      FROM search_res
      LEFT JOIN LATERAL (
          SELECT url
          FROM images_restaurants
          WHERE restaurant_id = search_res.id
          LIMIT 1
      ) first_image ON true;
      `,
      [`%${searchBy}%`]
    );

    return res.json(rows);
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ message: "Error has occurred. Please try again later." });
  }
});

app.get(
  "/api/v1/restaurants/:restaurantId",
  async (req: Request, res: Response) => {
    const restaurantId = req.params.restaurantId;

    try {
      const { rows } = await pool.query<RestaurantDB>(
        `WITH restaurant_data AS (
        SELECT
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
            jsonb_agg(ir.url) FILTER (WHERE ir.url IS NOT NULL) AS images
        FROM restaurants AS r
        LEFT JOIN reviews ON r.id = reviews.restaurant_id
        LEFT JOIN images_restaurants AS ir ON r.id = ir.restaurant_id
        WHERE r.id = $1
        GROUP BY r.id
    ),
    review_images AS (
        SELECT
            review_id,
            json_agg(url) FILTER (WHERE url IS NOT NULL) AS images
        FROM images_reviews
        GROUP BY review_id
    )
    SELECT 
        rd.*,
        COALESCE(
            json_agg(
                json_build_object(
                    'id', rv.id, 
                    'text', rv.text, 
                    'rating', rv.rating,
                    'likes', rv.likes,
                    'dislikes', rv.dislikes,
                    'date_added', rv.date_added,
                    'edited_at', rv.edited_at,
                    'added_by', rv.added_by,
                    'author', jsonb_build_object(
                        'id', u.id, 
                        'name', u.name, 
                        'email', u.email,
                        'image', u.image
                    ),
                    'images', ri.images
                )
            ) FILTER (WHERE rv.id IS NOT NULL), '[]'
        ) AS reviews
    FROM restaurant_data AS rd
    LEFT JOIN reviews AS rv ON rd.id = rv.restaurant_id
    LEFT JOIN review_images AS ri ON rv.id = ri.review_id
    LEFT JOIN users AS u ON rv.added_by = u.id
    GROUP BY rd.id, rd.name, rd.latitude, rd.longitude, rd.date_added, rd.edited_at, rd.added_by, rd.address, rd.categories, rd.rating, rd.images;
      `,
        [restaurantId]
      );

      const result: RestaurantDB = rows[0];

      console.log(result);

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

/* Review API endpoints */

app.post(
  "/api/v1/reviews",
  upload.array("images", 5),
  async (req: RequestWithId, res: Response) => {
    let urls: string[] = [];
    try {
      const newReview = ReviewDBSchema.parse(req.body);

      if (req.files) {
        const promises = uploadImageToCloudinary(
          req.files as Express.Multer.File[]
        );

        urls = await Promise.all(promises);
      }

      const { rows } = await pool.query(
        "INSERT INTO reviews(rating, text, restaurant_id, added_by) VALUES($1, $2, $3, $4) RETURNING id",
        [newReview.rating, newReview.review, newReview.restaurantId, req.userId]
      );

      const reviewId = rows[0].id;

      const urlsAdded = urls.map(
        async (url) =>
          await pool.query<{ url: string }>(
            "INSERT INTO images_reviews(review_id, url) VALUES($1, $2) RETURNING url",
            [reviewId, url]
          )
      );

      const addedUrls = await Promise.all(urlsAdded);

      res.status(200).json({ id: reviewId });
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

app.delete("/api/v1/reviews", async (req: RequestWithId, res: Response) => {
  const { reviewId, authorId } = req.body;

  try {
    if (!(req.userId === authorId)) {
      return res.status(401);
    }
    const { rows } = await pool.query(
      "DELETE FROM reviews WHERE id = $1 AND reviews.added_by = $2 RETURNING id",
      [reviewId, authorId]
    );

    if (rows.length < 1) {
      return res
        .status(400)
        .json({ message: "Review to delete was not found." });
    }
    return res.json({ message: "Review deleted successfully" });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ message: "An error occurred, please try again later." });
  }
});

/* User endpoints */

app.get("/api/v1/profile", async (req: RequestWithId, res: Response) => {
  try {
    const { rows } = await pool.query<{
      since: Date;
      restaurants: RecentRestaurant[];
      reviews: ReviewsDB[];
    }>(
      `
      WITH user_restaurants AS (
      SELECT 
          r.id, 
          r.name, 
          r.address, 
          r.categories,
          r.added_by,
          COALESCE(ROUND(AVG(reviews.rating),1), 0) AS average_rating,
          COALESCE(json_agg(i.url) FILTER (WHERE i.url IS NOT NULL),'[]') AS images
      FROM restaurants AS r
      LEFT JOIN reviews ON r.id = reviews.restaurant_id
      LEFT JOIN images_restaurants AS i ON r.id = i.restaurant_id
      WHERE r.added_by = $1
      GROUP BY r.id
      ),
      user_reviews AS (
          SELECT 
            reviews.id,
            reviews.added_by, 
            reviews.text, 
            reviews.likes, 
            reviews.dislikes, 
            reviews.rating, 
            reviews.date_added, 
            reviews.edited_at, 
            reviews.restaurant_id 
          FROM reviews 
          WHERE reviews.added_by = $1
      )
      SELECT 
          users.date_added AS since,
          json_agg(jsonb_build_object(
              'id', user_restaurants.id, 
              'name', user_restaurants.name,
              'address', user_restaurants.address,
              'categories', user_restaurants.categories,
              'rating', user_restaurants.average_rating,
              'images', user_restaurants.images
          )) AS restaurants,
          COALESCE(json_agg(DISTINCT to_jsonb(user_reviews.*)) FILTER (WHERE user_reviews.id IS NOT NULL), '[]') AS reviews
      FROM users
      JOIN user_restaurants ON users.id = user_restaurants.added_by
      LEFT JOIN user_reviews ON users.id = user_reviews.added_by
      GROUP BY users.id, users.date_added;
      `,
      [req.userId]
    );

    const profileData = rows[0];

    const data: UserProfileData = {
      since: profileData.since,
      restaurants: profileData.restaurants,
      reviews: profileData.reviews.map(parseToHistoryReview),
    };

    res.json(data);
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      //TODO: add global error handler that will throw relevant errors for each code.
      console.log("PG error, code: ", err.code);
    }
    return res
      .status(504)
      .json({ message: "An error has occurred, please try again later" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
