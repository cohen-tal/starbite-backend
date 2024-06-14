import { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";
import { Token } from "../types";

export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET_KEY!, (err, id) => {
    if (err) return res.sendStatus(403);
    req.body.userId = id;
    next();
  });
}

export function refreshAccessToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const refreshToken = req.headers.authorization?.split(" ")[1];

  if (!refreshToken) {
    return res.sendStatus(401);
  }

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET_KEY!, (err, id) => {
    if (err) return res.sendStatus(403);
    req.body.userId = id;
    next();
  });
}

export function generateToken(
  type: "access" | "refresh",
  payload: string | object
) {
  const secret =
    type === "access"
      ? process.env.ACCESS_TOKEN_SECRET_KEY!
      : process.env.REFRESH_TOKEN_SECRET_KEY!;
  console.log(process.env.ACCESS_TOKEN_SECRET_KEY);

  return jwt.sign(payload, secret, { expiresIn: "15m" });
}
