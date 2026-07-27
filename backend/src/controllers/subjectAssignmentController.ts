import { Request, Response } from "express";
import SubjectAssignment, {
  IClassTestEntry,
  ISubjectAssignment,
} from "../models/SubjectAssignment";

const calculateTotalCIA = (subject: ISubjectAssignment): number => {
  const assignmentTotal = subject.assignments.reduce((sum, assignment) => {
    if (assignment.status !== "graded" || assignment.marksObtained === null) return sum;
    return sum + assignment.marksObtained;
  }, 0);

  const testMarksFor = (testNumber: number): number => {
    const testSets = subject.classTests.filter((ct) => ct.number === testNumber);
    const setMarks = testSets.map((ct) => ct.marksObtained ?? 0);
    return setMarks.length ? Math.max(...setMarks) : 0;
  };

  const ct1Best = testMarksFor(1);
  const ct2Best = testMarksFor(2);
  const other = subject.otherMarks ?? 0;

  return assignmentTotal + ct1Best + ct2Best + other;
};

export const seedSemester4 = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    await SubjectAssignment.deleteMany({ user: userId, semester: 4 });

    const subjects = [
      { courseCode: "BNC40105", courseName: "Windows Server Administration" },
      { courseCode: "BNC40107", courseName: "Web Application Penetration Testing" },
      { courseCode: "BNC40109", courseName: "Threat Modelling" },
      { courseCode: "BNC40204", courseName: "Blockchain and Cryptocurrency" },
    ];

    const payload = subjects.map((subject) => ({
      user: userId,
      semester: 4,
      courseCode: subject.courseCode,
      courseName: subject.courseName,
      assignments: [
        { number: 1, maxMarks: 5, status: "pending" },
        { number: 2, maxMarks: 5, status: "pending" },
      ],
      classTests: [
        { number: 1, set: 1, maxMarks: 20 },
        { number: 1, set: 2, maxMarks: 20 },
        { number: 2, set: 1, maxMarks: 20 },
        { number: 2, set: 2, maxMarks: 20 },
      ],
      otherMarks: 0,
      totalCIAMarks: 0,
      maxCIAMarks: 60,
    }));

    const created = await SubjectAssignment.insertMany(payload);

    res.status(201).json({
      subjects: created,
      message: "Semester 4 subjects seeded successfully",
    });
  } catch (error) {
    console.error("Seed subject assignments error:", error);
    res.status(500).json({ message: "Server error seeding semester subjects" });
  }
};

export const getSubjectAssignments = async (req: Request, res: Response): Promise<void> => {
  try {
    const { semester } = req.query as { semester?: string };
    const filter: { user: string; semester?: number } = { user: req.user.id };

    if (semester) {
      filter.semester = Number(semester);
    }

    const subjects = await SubjectAssignment.find(filter).sort({
      semester: 1,
      courseCode: 1,
    });

    res.status(200).json({ subjects });
  } catch (error) {
    console.error("Get subject assignments error:", error);
    res.status(500).json({ message: "Server error fetching subject assignments" });
  }
};

export const updateAssignment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId, number } = req.params;
    const assignmentNumber = Number(number);

    if (![1, 2].includes(assignmentNumber)) {
      res.status(400).json({ message: "Assignment number must be 1 or 2" });
      return;
    }

    const subject = await SubjectAssignment.findById(subjectId);
    if (!subject) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (subject.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    const assignment = subject.assignments.find((entry) => entry.number === assignmentNumber);
    if (!assignment) {
      res.status(404).json({ message: "Assignment entry not found" });
      return;
    }

    const {
      title,
      description,
      submittedDate,
      marksObtained,
      status,
      feedback,
    }: {
      title?: string;
      description?: string;
      submittedDate?: string | null;
      marksObtained?: number | null;
      status?: "pending" | "submitted" | "graded";
      feedback?: string;
    } = req.body;

    if (typeof title === "string") assignment.title = title;
    if (typeof description === "string") assignment.description = description;
    if (submittedDate !== undefined) assignment.submittedDate = submittedDate ? new Date(submittedDate) : null;
    if (marksObtained !== undefined) assignment.marksObtained = marksObtained;
    if (status !== undefined) assignment.status = status;
    if (typeof feedback === "string") assignment.feedback = feedback;

    subject.totalCIAMarks = calculateTotalCIA(subject);
    await subject.save();

    res.status(200).json(subject);
  } catch (error) {
    console.error("Update assignment error:", error);
    res.status(500).json({ message: "Server error updating assignment" });
  }
};

export const updateClassTest = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId, testNumber, setNumber } = req.params;
    const testNum = Number(testNumber);
    const setNum = Number(setNumber);

    if (![1, 2].includes(testNum) || ![1, 2].includes(setNum)) {
      res.status(400).json({ message: "Test and set numbers must be 1 or 2" });
      return;
    }

    const subject = await SubjectAssignment.findById(subjectId);
    if (!subject) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (subject.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    const classTest = subject.classTests.find(
      (entry: IClassTestEntry) => entry.number === testNum && entry.set === setNum
    );
    if (!classTest) {
      res.status(404).json({ message: "Class test entry not found" });
      return;
    }

    const {
      marksObtained,
      conductedDate,
      remarks,
    }: { marksObtained?: number | null; conductedDate?: string | null; remarks?: string } = req.body;

    if (marksObtained !== undefined) classTest.marksObtained = marksObtained;
    if (conductedDate !== undefined) classTest.conductedDate = conductedDate ? new Date(conductedDate) : null;
    if (typeof remarks === "string") classTest.remarks = remarks;

    subject.totalCIAMarks = calculateTotalCIA(subject);
    await subject.save();

    res.status(200).json(subject);
  } catch (error) {
    console.error("Update class test error:", error);
    res.status(500).json({ message: "Server error updating class test" });
  }
};

export const updateOtherMarks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { subjectId } = req.params;
    const { otherMarks } = req.body as { otherMarks?: number };

    if (typeof otherMarks !== "number" || otherMarks < 0 || otherMarks > 10) {
      res.status(400).json({ message: "otherMarks must be between 0 and 10" });
      return;
    }

    const subject = await SubjectAssignment.findById(subjectId);
    if (!subject) {
      res.status(404).json({ message: "Subject not found" });
      return;
    }

    if (subject.user.toString() !== req.user.id) {
      res.status(403).json({ message: "Not authorized" });
      return;
    }

    subject.otherMarks = otherMarks;
    subject.totalCIAMarks = calculateTotalCIA(subject);
    await subject.save();

    res.status(200).json(subject);
  } catch (error) {
    console.error("Update other marks error:", error);
    res.status(500).json({ message: "Server error updating other marks" });
  }
};
