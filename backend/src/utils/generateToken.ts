import jwt from "jsonwebtoken";
import { validateJwtConfig } from "./jwtConfig";

export const generateAccessToken = (userId: string): string => {
  const { accessTokenSecret } = validateJwtConfig();
  return jwt.sign({ id: userId }, accessTokenSecret, {
    expiresIn: "15m",
    algorithm: "HS256",
  });
};

export const generateRefreshToken = (userId: string): string => {
  const { refreshTokenSecret } = validateJwtConfig();
  return jwt.sign({ id: userId }, refreshTokenSecret, {
    expiresIn: "7d",
    algorithm: "HS256",
  });
};
