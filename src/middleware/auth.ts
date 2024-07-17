import { NextFunction, Request, RequestHandler, Response } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Token } from "../types";

export interface RequestWithId extends Request {
  userId?: string;
}

export function authenticateAccessToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ error: "No valid access token sent in request headers." });
  }

  jwt.verify(
    token,
    process.env.ACCESS_TOKEN_SECRET_KEY!,
    { complete: false },
    (err, payload) => {
      if (err) return res.sendStatus(403);

      if (assertPayload(payload)) {
        (req as RequestWithId).userId = payload["userId"];
      }
      next();
    }
  );
}

export function authenticateRefreshToken(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const refreshToken: Token = req.body.refreshToken;

  if (!refreshToken) {
    return res.sendStatus(401);
  }

  jwt.verify(
    refreshToken.token,
    process.env.REFRESH_TOKEN_SECRET_KEY!,
    (err, payload) => {
      if (err) {
        console.error(err);
        return res.status(403).json({ error: "refresh token expired." });
      }
      if (assertPayload(payload)) {
        req.body.userId = payload["userId"];
        return next();
      }
      // Handle cases where payload does not match expected structure
      return res.status(400).json({ error: "Invalid token payload." });
    }
  );
}

export function generateToken(
  type: "access" | "refresh",
  payload: string | object
): { jwt: string; expiresAt: number } {
  let expiresAt: number;
  let secret: string;

  if (type === "access") {
    secret = process.env.ACCESS_TOKEN_SECRET_KEY!;
    expiresAt = Math.floor(Date.now() / 1000 + 30 * 60); // access token - expires in 30m
  } else {
    secret = process.env.REFRESH_TOKEN_SECRET_KEY!;
    expiresAt = Math.floor(Date.now() / 1000 + 7 * 24 * 60 * 60); // refresh token - expires in 7d
  }

  return {
    jwt: jwt.sign({ userId: payload }, secret, {
      expiresIn: type === "access" ? "30m" : "7d",
    }),
    expiresAt: expiresAt,
  };
}

function assertPayload(payload: any): payload is JwtPayload {
  return "userId" in payload && typeof payload.userId === "string";
}
