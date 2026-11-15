import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { TokenExpiredError } from "jsonwebtoken";
import User from "../models/User";
import AuthSession, { IAuthSession } from "../models/AuthSession";
import {
  createSessionAccessToken,
  createSessionRefreshToken,
  generateFamilyId,
  generateSessionId,
  generateTokenId,
  hashRefreshToken,
  verifySessionAccessToken,
  verifySessionRefreshToken,
} from "../utils/sessionTokens";

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const INVALID_REFRESH_MESSAGE = "Refresh token invalid or expired";
const REVOKED_REFRESH_MESSAGE = "Refresh session revoked";
const EXPIRED_REFRESH_MESSAGE = "Refresh token expired";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

const createAuthSession = async (userId: string) => {
  const sessionId = generateSessionId();
  const familyId = generateFamilyId();
  const refreshTokenId = generateTokenId();
  const accessToken = createSessionAccessToken(userId, sessionId);
  const refreshToken = createSessionRefreshToken(
    userId,
    sessionId,
    familyId,
    refreshTokenId
  );
  const issuedAt = new Date();
  const refreshTokenExpiresAt = new Date(
    issuedAt.getTime() + REFRESH_TOKEN_LIFETIME
  );

  await AuthSession.create({
    userId,
    sessionId,
    familyId,
    currentTokenHash: hashRefreshToken(refreshToken),
    currentTokenIssuedAt: issuedAt,
    currentTokenExpiresAt: refreshTokenExpiresAt,
    lastUsedAt: issuedAt,
  });

  return {
    accessToken,
    refreshToken,
  };
};

const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string
): void => {
  res.cookie("accessToken", accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  res.cookie("token", accessToken, {
    ...cookieOptions,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });
  res.cookie("refreshToken", refreshToken, {
    ...cookieOptions,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
};

const loadRefreshSession = async (
  sessionId: string
): Promise<IAuthSession | null> =>
  AuthSession.findOne({ sessionId }).select("+currentTokenHash");

const loadActiveUser = async (userId: string) =>
  User.findById(userId).select("isActive");

const refreshSessionError = (
  res: Response,
  status: number,
  message: string
): void => {
  res.status(status).json({ message });
};

const clearAuthCookies = (res: Response): void => {
  res.clearCookie("accessToken", cookieOptions);
  res.clearCookie("token", cookieOptions);
  res.clearCookie("refreshToken", cookieOptions);
};

const logoutError = (
  res: Response,
  status: number,
  message: string
): void => {
  clearAuthCookies(res);
  res.status(status).json({ message });
};

export const refresh = async (
  req: Request,
  res: Response
): Promise<void> => {
    const presentedToken = req.cookies?.refreshToken;

    if (!presentedToken) {
      refreshSessionError(res, 401, INVALID_REFRESH_MESSAGE);
      return;
    }

    let claims;
    try {
      claims = verifySessionRefreshToken(presentedToken);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        refreshSessionError(res, 401, EXPIRED_REFRESH_MESSAGE);
        return;
      }
      refreshSessionError(res, 401, INVALID_REFRESH_MESSAGE);
      return;
    }

    if (claims.typ !== "refresh") {
      refreshSessionError(res, 401, INVALID_REFRESH_MESSAGE);
      return;
    }

    const presentedTokenHash = hashRefreshToken(presentedToken);
    let session;
    try {
      session = await loadRefreshSession(claims.sid);
    } catch (error) {
      console.error("Refresh session lookup failed");
      refreshSessionError(res, 500, "Server error during token refresh");
      return;
    }

    const now = new Date();
    if (!session) {
      refreshSessionError(res, 401, INVALID_REFRESH_MESSAGE);
      return;
    }

    if (
      session.sessionId !== claims.sid ||
      session.userId.toString() !== claims.sub ||
      session.familyId !== claims.fid
    ) {
      refreshSessionError(res, 401, INVALID_REFRESH_MESSAGE);
      return;
    }

    if (session.revokedAt) {
      refreshSessionError(res, 401, REVOKED_REFRESH_MESSAGE);
      return;
    }

    if (session.currentTokenExpiresAt <= now) {
      refreshSessionError(res, 401, EXPIRED_REFRESH_MESSAGE);
      return;
    }

    if (session.currentTokenHash !== presentedTokenHash) {
      try {
        await AuthSession.updateMany(
          {
            userId: claims.sub,
            familyId: claims.fid,
            revokedAt: null,
          },
          {
            $set: {
              revokedAt: now,
              revokedReason: "reuse_detected",
            },
          }
        );
      } catch {
        console.error("Refresh token reuse revocation failed");
        refreshSessionError(res, 500, "Server error during token refresh");
        return;
      }

      refreshSessionError(res, 401, "Refresh token reuse detected");
      return;
    }

    let user;
    try {
      user = await loadActiveUser(claims.sub);
    } catch {
      console.error("Refresh user lookup failed");
      refreshSessionError(res, 500, "Server error during token refresh");
      return;
    }

    if (!user || user.isActive === false) {
      refreshSessionError(res, 401, INVALID_REFRESH_MESSAGE);
      return;
    }

    const nextIssuedAt = now;
    const nextExpiresAt = new Date(
      nextIssuedAt.getTime() + REFRESH_TOKEN_LIFETIME
    );
    const nextTokenId = generateTokenId();
    const accessToken = createSessionAccessToken(claims.sub, claims.sid);
    const refreshToken = createSessionRefreshToken(
      claims.sub,
      claims.sid,
      claims.fid,
      nextTokenId
    );
    const nextTokenHash = hashRefreshToken(refreshToken);

    let rotatedSession;
    try {
      rotatedSession = await AuthSession.findOneAndUpdate(
        {
          userId: claims.sub,
          sessionId: claims.sid,
          familyId: claims.fid,
          revokedAt: null,
          currentTokenHash: presentedTokenHash,
          currentTokenExpiresAt: { $gt: now },
        },
        {
          $set: {
            currentTokenHash: nextTokenHash,
            currentTokenIssuedAt: nextIssuedAt,
            currentTokenExpiresAt: nextExpiresAt,
            lastUsedAt: nextIssuedAt,
          },
        },
        { new: true, runValidators: true }
      );
    } catch {
      console.error("Refresh token rotation failed");
      refreshSessionError(res, 500, "Server error during token refresh");
      return;
    }

    if (!rotatedSession) {
      let currentSession;
      try {
        currentSession = await loadRefreshSession(claims.sid);
      } catch {
        console.error("Refresh session confirmation failed");
        refreshSessionError(res, 500, "Server error during token refresh");
        return;
      }

      if (
        currentSession &&
        currentSession.sessionId === claims.sid &&
        currentSession.userId.toString() === claims.sub &&
        currentSession.familyId === claims.fid &&
        !currentSession.revokedAt &&
        currentSession.currentTokenExpiresAt > now &&
        currentSession.currentTokenHash !== presentedTokenHash
      ) {
        try {
          await AuthSession.updateMany(
            {
              userId: claims.sub,
              familyId: claims.fid,
              revokedAt: null,
            },
            {
              $set: {
                revokedAt: now,
                revokedReason: "reuse_detected",
              },
            }
          );
        } catch {
          console.error("Refresh token reuse revocation failed");
          refreshSessionError(res, 500, "Server error during token refresh");
          return;
        }

        refreshSessionError(res, 401, "Refresh token reuse detected");
        return;
      }

      if (currentSession?.revokedAt) {
        refreshSessionError(res, 401, REVOKED_REFRESH_MESSAGE);
        return;
      }

      if (currentSession && currentSession.currentTokenExpiresAt <= now) {
        refreshSessionError(res, 401, EXPIRED_REFRESH_MESSAGE);
        return;
      }

      refreshSessionError(res, 500, "Server error during token refresh");
      return;
    }

    setAuthCookies(res, accessToken, refreshToken);
    res.status(200).json({ message: "Token refreshed" });
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      res.status(400).json({ message: "Name, email, and password are required" });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ message: "Password must be at least 8 characters" });
      return;
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ message: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      passwordHash,
    });

    let accessToken: string;
    let refreshToken: string;
    try {
      ({ accessToken, refreshToken } = await createAuthSession(
        user._id.toString()
      ));
    } catch (sessionError) {
      try {
        const cleanupResult = await User.deleteOne({ _id: user._id });
        if (cleanupResult.deletedCount !== 1) {
          console.error("Registration cleanup did not remove the created user");
        }
      } catch {
        console.error("Registration cleanup failed");
      }
      throw sessionError;
    }

    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: "Email and password are required" });
      return;
    }

    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    if (user.isActive === false) {
      res.status(401).json({ message: "Invalid credentials" });
      return;
    }

    const { accessToken, refreshToken } = await createAuthSession(
      user._id.toString()
    );

    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error during login" });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const accessToken = req.cookies?.token || req.cookies?.accessToken;
  const refreshToken = req.cookies?.refreshToken;
  let userId: string | undefined;
  let sessionId: string | undefined;

  try {
    if (accessToken) {
      try {
        const claims = verifySessionAccessToken(accessToken);
        userId = claims.sub;
        sessionId = claims.sid;
      } catch {
        // A valid refresh token may replace an expired or invalid access token.
      }
    }

    if (accessToken && refreshToken && userId && sessionId) {
      let refreshClaims;
      try {
        refreshClaims = verifySessionRefreshToken(refreshToken);
      } catch {
        logoutError(res, 401, "Not authenticated");
        return;
      }

      if (
        refreshClaims.sub !== userId ||
        refreshClaims.sid !== sessionId
      ) {
        logoutError(res, 401, "Not authenticated");
        return;
      }
    }

    if (!sessionId && refreshToken) {
      let refreshClaims;
      try {
        refreshClaims = verifySessionRefreshToken(refreshToken);
      } catch {
        logoutError(res, 401, "Not authenticated");
        return;
      }

      const refreshSession = await loadRefreshSession(refreshClaims.sid);
      if (!refreshSession ||
          refreshSession.sessionId !== refreshClaims.sid ||
          refreshSession.userId.toString() !== refreshClaims.sub ||
          refreshSession.familyId !== refreshClaims.fid) {
        logoutError(res, 401, "Not authenticated");
        return;
      }

      if (!refreshSession.revokedAt) {
        if (refreshSession.currentTokenExpiresAt <= new Date() ||
            refreshSession.currentTokenHash !== hashRefreshToken(refreshToken)) {
          logoutError(res, 401, "Not authenticated");
          return;
        }
      }

      userId = refreshClaims.sub;
      sessionId = refreshClaims.sid;
    }

    if (!userId || !sessionId) {
      logoutError(res, 401, "Not authenticated");
      return;
    }

    const revocationTime = new Date();
    const result = await AuthSession.updateOne(
      {
        userId,
        sessionId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: revocationTime,
          revokedReason: "logout",
        },
      }
    );

    if (result.matchedCount === 0) {
      const existingSession = await AuthSession.findOne({ sessionId });
      if (!existingSession ||
          existingSession.userId.toString() !== userId) {
        logoutError(res, 401, "Not authenticated");
        return;
      }

      if (!existingSession.revokedAt) {
        logoutError(res, 500, "Server error during logout");
        return;
      }
    }

    clearAuthCookies(res);
    res.status(200).json({ message: "Logged out" });
  } catch (error) {
    console.error("Logout session revocation failed");
    logoutError(res, 500, "Server error during logout");
  }
};

export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await User.findById(req.user.id).select("-passwordHash");

    if (!user) {
      res.status(404).json({ message: "User not found" });
      return;
    }

    res.status(200).json(user);
  } catch (error) {
    console.error("GetMe error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
