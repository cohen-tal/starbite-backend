import { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

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
): { jwt: string; expiresAt: number } {
  let expiresAt: number;

  const secret =
    type === "access"
      ? process.env.ACCESS_TOKEN_SECRET_KEY!
      : process.env.REFRESH_TOKEN_SECRET_KEY!;
  console.log(process.env.ACCESS_TOKEN_SECRET_KEY);

  if (type === "access") {
    expiresAt = Math.floor(Date.now() / 1000 + 30 * 60); // access token - expires in 30m
  } else {
    expiresAt = Math.floor(Date.now() / 1000 + 7 * 24 * 60 * 60); // refresh token - expires in 7d
  }

  return {
    jwt: jwt.sign(payload, secret, { expiresIn: "30m" }),
    expiresAt: expiresAt,
  };
}
