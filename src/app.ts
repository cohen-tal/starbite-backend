import express, { Request, Response } from "express";
import { Pool } from "pg";
import multer from "multer";
import cors from "cors";
import {
  authenticateAccessToken,
  generateToken,
  authenticateRefreshToken,
} from "./middleware/auth";
import { RestaurantAPI, Token, UserAPI } from "./types";
import { uploadImageToCloudinary } from "./utils";
import z from "zod";
import { UserDBSchema, RestaurantDBSchema, ReviewDBSchema } from "./validation";
import { RequestWithId } from "./middleware/auth";
import { parseRestaurant } from "./parser";

const DB = "postgresql://postgres:@localhost:5432/StarBite";

const app = express();
const port = 8080;

app.use(cors(), express.json(), express.urlencoded({ extended: true }));

const upload = multer();

const pool = new Pool({ connectionString: DB });

pool
  .connect()
  .then(() => console.log("Connected to the database"))
  .catch((err) => console.error("Error connecting to the database", err));

app.post("/api/v1/users", async (req: Request, res: Response) => {
  try {
    const user: z.infer<typeof UserDBSchema> = UserDBSchema.parse(req.body);
    console.log(user);

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

app.use(authenticateAccessToken);

// Restaurants API endpoints
app.post(
  "/api/v1/restaurants",
  upload.array("images", 5),
  async (req: RequestWithId, res: Response) => {
    let urls: string[] = [];
    try {
      const newRestaurant = RestaurantDBSchema.parse(req.body);
      console.log(req.userId);

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

      // const restaurant: RestaurantAPI = {
      //   id: restaurantId,
      //   name: newRestaurant.name,
      //   addedBy: req.userId!,
      //   address: newRestaurant.address,
      //   lat: newRestaurant.lat,
      //   lng: newRestaurant.lng,
      //   images: addedUrls.map((res) => res.rows[0].url),
      // };
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

    const { rows } = await pool.query<RestaurantAPI>(
      `SELECT 
          r.name, 
          r.latitude, 
          r.longitude, 
          r.date_added, 
          r.edited_at, 
          r.added_by, 
          r.address, 
          json_agg(json_build_object(
              'id', reviews.id, 
              'text', reviews.text, 
              'rating', reviews.rating,
              'added_by', reviews.added_by
          )) AS reviews
      FROM 
          restaurants AS r
      JOIN 
          reviews ON r.id = reviews.restaurant_id
      WHERE 
          r.id = $1
      GROUP BY 
          r.id;
      `,
      [restaurantId]
    );

    console.log(rows[0]);

    const rest = parseRestaurant(rows[0]);
    console.log(rest);
  }
);

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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
