import { createHash, randomBytes } from "crypto";
import jwt, { JwtPayload } from "jsonwebtoken";
import { validateJwtConfig } from "./jwtConfig";

export const ACCESS_TOKEN_EXPIRES_IN = "15m";
export const REFRESH_TOKEN_EXPIRES_IN = "7d";

export interface AccessTokenClaims {
  id?: string;
  sub: string;
  sid: string;
  typ: "access";
  iat: number;
  exp: number;
}

export interface RefreshTokenClaims {
  sub: string;
  sid: string;
  fid: string;
  jti: string;
  typ: "refresh";
  iat: number;
  exp: number;
}

const generateIdentifier = (): string => randomBytes(32).toString("hex");

export const generateSessionId = (): string => generateIdentifier();
export const generateFamilyId = (): string => generateIdentifier();
export const generateTokenId = (): string => generateIdentifier();

export const hashRefreshToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

const isJwtPayload = (value: string | JwtPayload): value is JwtPayload =>
  typeof value !== "string";

const requireStringClaim = (
  payload: JwtPayload,
  claim: string
): string => {
  const value = payload[claim];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid JWT: ${claim} claim is required`);
  }
  return value;
};

const requireNumberClaim = (payload: JwtPayload, claim: string): number => {
  const value = payload[claim];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid JWT: ${claim} claim is required`);
  }
  return value;
};

export const createSessionAccessToken = (
  userId: string,
  sessionId: string
): string => {
  const { accessTokenSecret } = validateJwtConfig();
  return jwt.sign(
    { id: userId, sub: userId, sid: sessionId, typ: "access" },
    accessTokenSecret,
    {
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      algorithm: "HS256",
    }
  );
};

export const createSessionRefreshToken = (
  userId: string,
  sessionId: string,
  familyId: string,
  tokenId: string
): string => {
  const { refreshTokenSecret } = validateJwtConfig();
  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      fid: familyId,
      jti: tokenId,
      typ: "refresh",
    },
    refreshTokenSecret,
    {
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      algorithm: "HS256",
    }
  );
};

const verifyClaims = <T extends AccessTokenClaims | RefreshTokenClaims>(
  token: string,
  secret: string,
  expectedType: T["typ"]
): T => {
  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS256"],
  });

  if (!isJwtPayload(decoded)) {
    throw new Error("Invalid JWT: payload must be an object");
  }

  const typ = requireStringClaim(decoded, "typ");
  if (typ !== expectedType) {
    throw new Error(`Invalid JWT: expected ${expectedType} token`);
  }

  const claims = {
    ...decoded,
    sub: requireStringClaim(decoded, "sub"),
    sid: requireStringClaim(decoded, "sid"),
    typ: expectedType,
    iat: requireNumberClaim(decoded, "iat"),
    exp: requireNumberClaim(decoded, "exp"),
  };

  if (expectedType === "access" && decoded.id !== undefined) {
    const legacyId = requireStringClaim(decoded, "id");
    if (legacyId !== claims.sub) {
      throw new Error("Invalid JWT: id and sub claims must match");
    }
  }

  if (expectedType === "refresh") {
    return {
      ...claims,
      fid: requireStringClaim(decoded, "fid"),
      jti: requireStringClaim(decoded, "jti"),
    } as T;
  }

  return claims as T;
};

export const verifySessionAccessToken = (
  token: string
): AccessTokenClaims => {
  const { accessTokenSecret } = validateJwtConfig();
  return verifyClaims<AccessTokenClaims>(token, accessTokenSecret, "access");
};

export const verifySessionRefreshToken = (
  token: string
): RefreshTokenClaims => {
  const { refreshTokenSecret } = validateJwtConfig();
  return verifyClaims<RefreshTokenClaims>(token, refreshTokenSecret, "refresh");
};
