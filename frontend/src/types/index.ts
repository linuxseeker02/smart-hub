export interface User {
  _id: string;
  name: string;
  email: string;
  role: "student" | "admin";
  uploadedNotes: string[];
  savedNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface QuizQuestion {
  _id: string;
  question: string;
  options: string[];
  answer: string;
}

export interface Rating {
  _id: string;
  userId: string;
  stars: number;
}

export interface Review {
  _id: string;
  userId: { _id: string; name: string } | string;
  text: string;
  createdAt: string;
}

export interface Note {
  _id: string;
  uploadedBy: { _id: string; name: string; email: string } | null;
  fileUrl: string;
  filePublicId: string;
  fileType: "pdf" | "docx" | "ppt";
  originalName: string;
  title: string;
  summary: string;
  keywords: string[];
  quizQuestions: QuizQuestion[];
  semester: number;
  subject: string;
  topic: string;
  ratings: Rating[];
  averageRating: number;
  reviews: Review[];
  downloadCount: number;
  aiProcessed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotesResponse {
  notes: Note[];
  total: number;
  page: number;
  totalPages: number;
}

export interface SearchResponse extends NotesResponse {
  query: string;
}

export interface AuthResponse {
  _id: string;
  name: string;
  email: string;
  role: "student" | "admin";
  createdAt: string;
  updatedAt: string;
  uploadedNotes: string[];
  savedNotes: string[];
}

export interface CollectionNote {
  _id: string;
  title: string;
  subject: string;
  fileType: "pdf" | "docx" | "ppt";
  averageRating: number;
}

export interface Collection {
  _id: string;
  name: string;
  description: string;
  owner: string;
  notes: CollectionNote[];
  isPublic: boolean;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface Assignment {
  _id: string;
  user: string;
  title: string;
  subject: string;
  description: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in-progress" | "submitted" | "graded";
  grade: string;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  _id: string;
  date: string;
  status: "present" | "absent" | "late";
  note: string;
}

export interface AttendanceSubject {
  _id: string;
  user: string;
  subject: string;
  totalClasses: number;
  attendedClasses: number;
  minimumRequired: number;
  percentage: number;
  status: "safe" | "warning" | "danger";
  classesNeededToReach: number;
  canAffordToMiss: number;
  records: AttendanceRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface GradeSubject {
  _id: string;
  name: string;
  credits: number;
  grade: string;
  gradePoint: number;
  marks: number | null;
  maxMarks: number;
}

export interface SemesterGrade {
  _id: string;
  user: string;
  semester: number;
  subjects: GradeSubject[];
  sgpa: number;
  totalCredits: number;
  createdAt: string;
  updatedAt: string;
}

export interface GradesResponse {
  semesters: SemesterGrade[];
  cgpa: number;
  totalCredits: number;
  totalSemesters: number;
}

export interface TimetableSlot {
  _id: string;
  day: "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";
  period: number;
  startTime: string;
  endTime: string;
  courseCode: string;
  courseName: string;
  faculty: string;
  room: string;
  type: "lecture" | "lab" | "tutorial";
}

export interface Timetable {
  _id: string;
  user: string;
  semester: number;
  section: string;
  slots: TimetableSlot[];
  isActive: boolean;
  uploadedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudentProfile {
  _id: string;
  user: string;
  fullName: string;
  rollNumber: string;
  department: string;
  program: string;
  semester: number;
  section: string;
  batch: string;
  university: string;
  phone: string;
  photoUrl: string;
  studyStreak: number;
  lastStudyDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Exam {
  _id: string;
  user: string;
  courseCode: string;
  courseName: string;
  examDate: string;
  examDay: string;
  startTime: string;
  endTime: string;
  venue: string;
  semester: number;
  notes: string;
  isCompleted: boolean;
  daysLeft: number;
  isOverdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyllabusTopic {
  _id: string;
  title: string;
  description: string;
  status: "not-started" | "in-progress" | "completed";
  order: number;
}

export interface SyllabusSubject {
  _id: string;
  user: string;
  courseCode: string;
  courseName: string;
  semester: number;
  credits: number;
  topics: SyllabusTopic[];
  overallProgress: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudySession {
  _id: string;
  user: string;
  subject: string;
  duration: number;
  type: "focus" | "short-break" | "long-break";
  completedAt: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface StudyStats {
  totalMinutes: number;
  todayMinutes: number;
  weeklyData: Array<{ date: string; minutes: number }>;
  subjectBreakdown: Record<string, number>;
  streak: number;
}

export interface PYQ {
  _id: string;
  uploadedBy: { _id: string; name: string } | string;
  semester: number;
  courseCode: string;
  courseName: string;
  year: number;
  examType:
    | "End Semester"
    | "Class Test 1 Set 1"
    | "Class Test 1 Set 2"
    | "Class Test 2 Set 1"
    | "Class Test 2 Set 2";
  fileUrl: string;
  filePublicId: string;
  originalName: string;
  fileSize: number;
  downloadCount: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectAssignmentEntry {
  _id: string;
  number: number;
  title: string;
  description: string;
  submittedDate: string | null;
  marksObtained: number | null;
  maxMarks: number;
  status: "pending" | "submitted" | "graded";
  feedback: string;
}

export interface SubjectClassTestEntry {
  _id: string;
  number: number;
  set: number;
  marksObtained: number | null;
  maxMarks: number;
  conductedDate: string | null;
  remarks: string;
}

export interface SubjectAssignment {
  _id: string;
  user: string;
  semester: number;
  courseCode: string;
  courseName: string;
  assignments: SubjectAssignmentEntry[];
  classTests: SubjectClassTestEntry[];
  otherMarks: number;
  totalCIAMarks: number;
  maxCIAMarks: number;
  createdAt: string;
  updatedAt: string;
}
