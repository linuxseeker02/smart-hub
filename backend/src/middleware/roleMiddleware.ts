import { Request, Response, NextFunction, RequestHandler } from "express";
import User, { UserRole } from "../models/User";

const validRoles = new Set<UserRole>(["student", "admin"]);

export const requireRoles = (...allowedRoles: UserRole[]): RequestHandler =>
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({ message: "Not authenticated" });
      return;
    }

    if (
      allowedRoles.length === 0 ||
      allowedRoles.some((role) => !validRoles.has(role))
    ) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    try {
      const user = await User.findById(req.user.id).select("role");
      const role = user?.role;

      if (!role || !validRoles.has(role) || !allowedRoles.includes(role)) {
        res.status(403).json({ message: "Forbidden" });
        return;
      }

      next();
    } catch (error) {
      console.error("Role authorization lookup failed:", error);
      res.status(500).json({ message: "Authorization service unavailable" });
    }
  };
