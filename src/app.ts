import express, { Request, Response } from "express";
import { Pool } from "pg";
import multer from "multer";
import cors from "cors";
import {
  authenticateToken,
  generateToken,
  refreshAccessToken,
} from "./middleware/auth";
import { Token } from "./types";

const DB = "postgresql://postgres:@localhost:5432/StarBite";

const app = express();
const port = 8080;

app.use(cors(), express.json(), express.urlencoded({ extended: true }));

const upload = multer({ storage: multer.memoryStorage() });

const pool = new Pool({ connectionString: DB });

pool
  .connect()
  .then(() => console.log("Connected to the database"))
  .catch((err) => console.error("Error connecting to the database", err));

app.post("/api/v1/users", async (req: Request, res: Response) => {
  const { name, email, image } = req.body;
  console.log(name, email, image);

  try {
    // Check if the user already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existingUser.rows.length > 0) {
      res.status(200).json(existingUser.rows[0]);
    } else {
      const result = await pool.query(
        "INSERT INTO users(name, email, image) VALUES($1, $2, $3) RETURNING id",
        [name, email, image]
      );
      res.status(200).json(result.rows[0]);
    }
  } catch (err) {
    console.log(err);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
  }
});

app.post(
  "/api/v1/auth/access_token",
  refreshAccessToken,
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

app.get("/newtoken", (req: Request, res: Response) => {
  const user = { id: "123123" };
  return res.json(generateToken("access", user));
});

app.post("/testz", (req, res) => {
  console.log("reached testz");
  console.log(req.headers);
  return res.status(200);
});

app.post(
  "/api/v1/restaurants",
  upload.array("images", 5),
  async (req: Request, res: Response) => {
    try {
      const { name, description, address, lat, lng } = req.body;
      const files = req.files as Express.Multer.File[];

      // Save restaurant data to the database
      const query = `
        INSERT INTO restaurants (name, description, address, lat, lng)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `;
      const values = [name, description, address, lat, lng];
      const result = await pool.query(query, values);

      const restaurantId = result.rows[0].id;

      // Handle image uploads
      if (files && files.length > 0) {
        const imageQueries = files.map((file) => {
          const imageQuery = `
            INSERT INTO restaurant_images (restaurant_id, image_data)
            VALUES ($1, $2)
          `;
          return pool.query(imageQuery, [restaurantId, file.buffer]);
        });

        await Promise.all(imageQueries);
      }

      res.json({ message: "Restaurant added successfully!", restaurantId });
    } catch (error) {
      console.error("Error adding restaurant:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
