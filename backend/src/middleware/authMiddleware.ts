import { Request, Response, NextFunction } from "express";
import AuthSession from "../models/AuthSession";
import User from "../models/User";
import { verifySessionAccessToken } from "../utils/sessionTokens";

declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
      };
    }
  }
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.cookies.token || req.cookies.accessToken;

    if (!token) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    const decoded = verifySessionAccessToken(token);
    let activeSession;
    try {
      activeSession = await AuthSession.findOne({
        userId: decoded.sub,
        sessionId: decoded.sid,
        revokedAt: null,
      });
    } catch (error) {
      console.error(
        "Authentication session lookup failed:",
        error instanceof Error ? error.message : "Unknown database error"
      );
      res.status(500).json({ message: "Authentication service unavailable" });
      return;
    }

    if (!activeSession) {
      res.status(401).json({ message: "Session invalid or revoked" });
      return;
    }

    let user;
    try {
      user = await User.findById(decoded.sub).select("isActive");
    } catch (error) {
      console.error(
        "Authentication user lookup failed:",
        error instanceof Error ? error.message : "Unknown database error"
      );
      res.status(500).json({ message: "Authentication service unavailable" });
      return;
    }
    if (!user || user.isActive === false) {
      res.status(401).json({ message: "Account is disabled" });
      return;
    }

    req.user = { id: decoded.sub };
    next();
  } catch (error) {
    res.status(401).json({ message: "Token invalid or expired" });
  }
};
