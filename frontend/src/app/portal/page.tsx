"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Assignment,
  AttendanceSubject,
  Exam,
  StudentProfile,
  StudyStats,
  SyllabusSubject,
  TimetableSlot,
} from "@/types";

type TodayClassesResponse = {
  classes: TimetableSlot[];
  day: string;
  total: number;
};

const toMinutes = (value: string) => {
  const [h, m] = value.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return -1;
  return h * 60 + m;
};

const dayDiff = (isoDate: string) =>
  Math.ceil((new Date(isoDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

export default function PortalPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todayClasses, setTodayClasses] = useState<TodayClassesResponse>({
    classes: [],
    day: "",
    total: 0,
  });
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [attendance, setAttendance] = useState<AttendanceSubject[]>([]);
  const [studyStats, setStudyStats] = useState<StudyStats>({
    totalMinutes: 0,
    todayMinutes: 0,
    weeklyData: [],
    subjectBreakdown: {},
    streak: 0,
  });
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [syllabus, setSyllabus] = useState<SyllabusSubject[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchDashboard();
    }
  }, [authLoading, user, router]);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);

      const [
        timetableRes,
        assignmentsRes,
        examsRes,
        attendanceRes,
        statsRes,
        profileRes,
        syllabusRes,
      ] = await Promise.all([
        api.get<TodayClassesResponse>("/api/timetable/today"),
        api.get<{ assignments: Assignment[]; total: number; overdue: number }>(
          "/api/assignments",
          { params: { status: "pending" } }
        ),
        api.get<{ exams: Exam[]; upcoming: number }>("/api/exams"),
        api.get<{ subjects: AttendanceSubject[] }>("/api/attendance"),
        api.get<StudyStats>("/api/study-sessions/stats"),
        api.get<StudentProfile>("/api/profile"),
        api.get<{ subjects: SyllabusSubject[] }>("/api/syllabus"),
      ]);

      setTodayClasses(timetableRes.data);
      setAssignments(assignmentsRes.data.assignments || []);
      setExams(examsRes.data.exams || []);
      setAttendance(attendanceRes.data.subjects || []);
      setStudyStats(statsRes.data);
      setProfile(profileRes.data);
      setSyllabus((syllabusRes.data.subjects || []).slice().sort((a, b) => a.overallProgress - b.overallProgress));
    } catch (err) {
      console.error("Dashboard fetch failed:", err);
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const pendingAssignments = assignments.length;
  const examsThisWeek = exams.filter((exam) => !exam.isCompleted && exam.daysLeft >= 0 && exam.daysLeft <= 7).length;
  const below75 = attendance.filter((subject) => subject.percentage < 75).length;

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const sortedClasses = todayClasses.classes.slice().sort((a, b) => a.period - b.period);
  const nextAssignments = assignments
    .slice()
    .sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
    .slice(0, 3);
  const nextExams = exams
    .filter((exam) => !exam.isCompleted && exam.daysLeft >= 0)
    .sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime())
    .slice(0, 2);
  const attendanceAlerts = attendance.filter(
    (subject) => subject.status === "warning" || subject.status === "danger"
  );

  const todayFormatted = useMemo(
    () =>
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    []
  );

  if (authLoading || !user || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">{error}</div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {greeting()}, {profile?.fullName || user.name}!
            </h1>
            <p className="text-sm text-gray-600 mt-1">{todayFormatted}</p>
          </div>
          <div className="px-4 py-2 rounded-full bg-orange-50 border border-orange-200 text-orange-700 font-medium">
            🔥 {studyStats.streak} days
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Today&apos;s Study Time</p>
            <p className="text-2xl font-bold text-gray-900">{studyStats.todayMinutes} mins</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Pending Assignments</p>
            <p className={`text-2xl font-bold ${pendingAssignments > 0 ? "text-red-600" : "text-gray-900"}`}>
              {pendingAssignments}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Exams This Week</p>
            <p className={`text-2xl font-bold ${examsThisWeek > 0 ? "text-amber-600" : "text-gray-900"}`}>
              {examsThisWeek}
            </p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm text-gray-500">Subjects Below 75%</p>
            <p className={`text-2xl font-bold ${below75 > 0 ? "text-red-600" : "text-gray-900"}`}>{below75}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Today&apos;s Schedule ({todayClasses.day || "N/A"})</h2>
          {sortedClasses.length === 0 ? (
            <p className="text-gray-600">No classes today 🎉</p>
          ) : (
            <div className="space-y-2">
              {sortedClasses.map((slot) => {
                const start = toMinutes(slot.startTime);
                const end = toMinutes(slot.endTime);
                const isCurrent = nowMinutes >= start && nowMinutes < end;
                const isPast = nowMinutes >= end;
                return (
                  <div
                    key={slot._id}
                    className={`grid grid-cols-1 md:grid-cols-4 gap-2 p-3 rounded-lg border ${
                      isCurrent
                        ? "border-green-300 bg-green-50"
                        : isPast
                        ? "border-gray-200 bg-gray-50 text-gray-500"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <p className="font-medium">
                      {slot.startTime} - {slot.endTime}
                    </p>
                    <p className="font-medium">{slot.courseName}</p>
                    <p>Room {slot.room || "-"}</p>
                    <p>{slot.faculty || "-"}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Upcoming Deadlines</h3>
              <Link href="/assignments" className="text-sm text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {nextAssignments.length === 0 ? (
                <p className="text-gray-600">No pending assignments.</p>
              ) : (
                nextAssignments.map((assignment) => {
                  const days = dayDiff(assignment.deadline);
                  return (
                    <div key={assignment._id} className="p-3 rounded-lg border border-gray-200">
                      <p className="font-semibold text-gray-900">{assignment.title}</p>
                      <p className="text-sm text-gray-600">{assignment.subject}</p>
                      <p className={`text-sm font-medium ${days < 0 ? "text-red-600" : "text-gray-700"}`}>
                        {days < 0 ? "OVERDUE" : `${days} days left`}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Exam Countdown</h3>
              <Link href="/exams" className="text-sm text-blue-600 hover:text-blue-700">
                View all
              </Link>
            </div>
            <div className="space-y-3">
              {nextExams.length === 0 ? (
                <p className="text-gray-600">No upcoming exams.</p>
              ) : (
                nextExams.map((exam) => (
                  <div key={exam._id} className="p-3 rounded-lg border border-gray-200">
                    <p className="text-3xl font-bold text-red-600">{exam.daysLeft}</p>
                    <p className="text-sm text-gray-500">days left</p>
                    <p className="font-semibold text-gray-900 mt-1">{exam.courseName}</p>
                    <p className="text-sm text-gray-600">
                      {new Date(exam.examDate).toLocaleDateString()} • {exam.startTime || "--:--"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Attendance Alerts</h3>
            <Link href="/attendance" className="text-sm text-blue-600 hover:text-blue-700">
              View details
            </Link>
          </div>
          {attendanceAlerts.length === 0 ? (
            <p className="text-green-700 font-medium">All good!</p>
          ) : (
            <div className="space-y-2">
              {attendanceAlerts.map((subject) => (
                <div key={subject._id} className="p-3 rounded-lg border border-gray-200 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{subject.subject}</p>
                    <p className="text-sm text-gray-600">{subject.percentage.toFixed(1)}%</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      subject.status === "danger"
                        ? "bg-red-100 text-red-700"
                        : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {subject.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900">Syllabus Progress</h3>
            <Link href="/syllabus" className="text-sm text-blue-600 hover:text-blue-700">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {syllabus.length === 0 ? (
              <p className="text-gray-600">No syllabus subjects yet.</p>
            ) : (
              syllabus.map((subject) => (
                <div key={subject._id}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900">
                      {subject.courseName} ({subject.courseCode || "-"})
                    </p>
                    <p className="text-xs text-gray-600">{subject.overallProgress.toFixed(1)}%</p>
                  </div>
                  <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className="h-full bg-blue-600"
                      style={{ width: `${Math.max(0, Math.min(subject.overallProgress, 100))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
