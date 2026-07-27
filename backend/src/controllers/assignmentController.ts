import { Request, Response } from "express";
import Assignment from "../models/Assignment";

const PRIORITY_RANK: Record<"low" | "medium" | "high", number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const isOverdueAssignment = (assignment: { deadline: Date; status: string }, now: Date) =>
  assignment.deadline.getTime() < now.getTime() &&
  assignment.status !== "submitted" &&
  assignment.status !== "graded";

export const createAssignment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { title, subject, description, deadline, priority } = req.body as {
      title?: string;
      subject?: string;
      description?: string;
      deadline?: string;
      priority?: "low" | "medium" | "high";
    };

    if (!title || !subject || !deadline) {
      res.status(400).json({ message: "title, subject, and deadline are required" });
      return;
    }

    const parsedDeadline = new Date(deadline);
    if (Number.isNaN(parsedDeadline.getTime())) {
      res.status(400).json({ message: "deadline must be a valid date" });
      return;
    }

    const assignment = await Assignment.create({
      user: req.user.id,
      title: title.trim(),
      subject: subject.trim(),
      description: (description || "").trim(),
      deadline: parsedDeadline,
      priority: priority || "medium",
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error("Create assignment error:", error);
    res.status(500).json({ message: "Server error creating assignment" });
  }
};

export const getAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, subject, sortBy } = req.query as {
      status?: string;
      subject?: string;
      sortBy?: "deadline" | "createdAt" | "priority";
    };

    const filter: {
      user: string;
      status?: string;
      subject?: { $regex: string; $options: string };
    } = {
      user: req.user.id,
    };

    if (status && status !== "all") {
      filter.status = status;
    }

    if (subject && subject.trim()) {
      filter.subject = { $regex: subject.trim(), $options: "i" };
    }

    const assignments = await Assignment.find(filter);
    const now = new Date();

    const sortedAssignments = [...assignments].sort((a, b) => {
      if (sortBy === "createdAt") {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }

      if (sortBy === "priority") {
        return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      }

      return a.deadline.getTime() - b.deadline.getTime();
    });

    const overdue = assignments.filter((assignment) => isOverdueAssignment(assignment, now)).length;

    res.status(200).json({
      assignments: sortedAssignments,
      total: sortedAssignments.length,
      overdue,
    });
  } catch (error) {
    console.error("Get assignments error:", error);
    res.status(500).json({ message: "Server error fetching assignments" });
  }
};

export const updateAssignment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const assignment = await Assignment.findById(id);

    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    if (assignment.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    const { title, subject, description, deadline, priority, status, grade } = req.body as {
      title?: string;
      subject?: string;
      description?: string;
      deadline?: string;
      priority?: "low" | "medium" | "high";
      status?: "pending" | "in-progress" | "submitted" | "graded";
      grade?: string;
    };

    if (title !== undefined) assignment.title = title.trim();
    if (subject !== undefined) assignment.subject = subject.trim();
    if (description !== undefined) assignment.description = description.trim();
    if (priority !== undefined) assignment.priority = priority;
    if (status !== undefined) assignment.status = status;
    if (grade !== undefined) assignment.grade = grade.trim();

    if (deadline !== undefined) {
      const parsedDeadline = new Date(deadline);
      if (Number.isNaN(parsedDeadline.getTime())) {
        res.status(400).json({ message: "deadline must be a valid date" });
        return;
      }
      assignment.deadline = parsedDeadline;
    }

    await assignment.save();

    res.status(200).json(assignment);
  } catch (error) {
    console.error("Update assignment error:", error);
    res.status(500).json({ message: "Server error updating assignment" });
  }
};

export const deleteAssignment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const assignment = await Assignment.findById(id);

    if (!assignment) {
      res.status(404).json({ message: "Assignment not found" });
      return;
    }

    if (assignment.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    await Assignment.findByIdAndDelete(id);
    res.status(200).json({ message: "Assignment deleted" });
  } catch (error) {
    console.error("Delete assignment error:", error);
    res.status(500).json({ message: "Server error deleting assignment" });
  }
};

export const getUpcoming = async (req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const inSevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const assignments = await Assignment.find({
      user: req.user.id,
      deadline: { $gte: now, $lte: inSevenDays },
      status: { $nin: ["submitted", "graded"] },
    }).sort({ deadline: 1 });

    res.status(200).json({
      assignments,
      total: assignments.length,
    });
  } catch (error) {
    console.error("Get upcoming assignments error:", error);
    res.status(500).json({ message: "Server error fetching upcoming assignments" });
  }
};
