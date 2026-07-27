"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Exam } from "@/types";

type ExamForm = {
  courseCode: string;
  courseName: string;
  examDate: string;
  examDay: string;
  startTime: string;
  endTime: string;
  venue: string;
  semester: number;
  notes: string;
};

const defaultForm: ExamForm = {
  courseCode: "",
  courseName: "",
  examDate: "",
  examDay: "",
  startTime: "",
  endTime: "",
  venue: "",
  semester: 4,
  notes: "",
};

const getCountdownClass = (exam: Exam) => {
  if (exam.isCompleted) return "text-green-600";
  if (exam.daysLeft === 0) return "text-red-600 animate-pulse";
  if (exam.daysLeft < 0) return "text-red-600";
  if (exam.daysLeft < 3) return "text-red-600";
  if (exam.daysLeft <= 7) return "text-amber-600";
  return "text-blue-600";
};

const getCountdownText = (exam: Exam) => {
  if (exam.isCompleted) return "Completed ✓";
  if (exam.daysLeft === 0) return "TODAY!";
  if (exam.daysLeft < 0) return "Overdue";
  if (exam.daysLeft < 3) return `${exam.daysLeft} days left — URGENT!`;
  if (exam.daysLeft <= 7) return `${exam.daysLeft} days left — Prepare Now!`;
  return `${exam.daysLeft} days left`;
};

export default function ExamsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<ExamForm>(defaultForm);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchExams();
    }
  }, [authLoading, user, router]);

  const fetchExams = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{ exams: Exam[]; upcoming: number }>("/api/exams");
      setExams(response.data.exams);
    } catch (err) {
      console.error("Failed to fetch exams:", err);
      setError("Failed to load exams");
    } finally {
      setLoading(false);
    }
  };

  const upcomingCount = useMemo(
    () => exams.filter((exam) => !exam.isCompleted && exam.daysLeft >= 0).length,
    [exams]
  );

  const handleDateChange = (value: string) => {
    const date = new Date(value);
    const day = Number.isNaN(date.getTime())
      ? ""
      : date.toLocaleDateString("en-US", { weekday: "long" });
    setForm((prev) => ({ ...prev, examDate: value, examDay: day }));
  };

  const submitExam = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.courseName.trim() || !form.examDate) return;

    try {
      setSubmitting(true);
      setError(null);
      await api.post("/api/exams", {
        ...form,
        courseCode: form.courseCode.trim(),
        courseName: form.courseName.trim(),
        examDay: form.examDay.trim(),
        venue: form.venue.trim(),
        notes: form.notes.trim(),
        startTime: form.startTime.trim(),
        endTime: form.endTime.trim(),
      });
      setShowModal(false);
      setForm(defaultForm);
      await fetchExams();
    } catch (err) {
      console.error("Failed to create exam:", err);
      setError("Failed to create exam");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleComplete = async (exam: Exam) => {
    try {
      await api.put(`/api/exams/${exam._id}`, { isCompleted: !exam.isCompleted });
      await fetchExams();
    } catch (err) {
      console.error("Failed to update exam:", err);
      setError("Failed to update exam");
    }
  };

  const removeExam = async (id: string) => {
    if (!confirm("Delete this exam?")) return;
    try {
      await api.delete(`/api/exams/${id}`);
      await fetchExams();
    } catch (err) {
      console.error("Failed to delete exam:", err);
      setError("Failed to delete exam");
    }
  };

  const loadSemester4 = async () => {
    try {
      setSeeding(true);
      setError(null);
      await api.post("/api/exams/seed");
      await fetchExams();
    } catch (err) {
      console.error("Failed to seed exams:", err);
      setError("Failed to load Semester 4 exams");
    } finally {
      setSeeding(false);
    }
  };

  if (authLoading || !user) {
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
          <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3">
            {error}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-blue-600" />
              Exam Countdown
            </h1>
            <p className="text-sm text-gray-600 mt-1">Upcoming exams: {upcomingCount}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void loadSemester4()}
              disabled={seeding}
              className="px-4 py-2 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-60"
            >
              {seeding ? "Loading..." : "Load Semester 4 Exams"}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Exam
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : exams.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-600">
            No exams yet. Add one or load Semester 4 exams.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {exams.map((exam) => {
              const ringRadius = 30;
              const ringCircumference = 2 * Math.PI * ringRadius;
              const totalDays = Math.max(Math.abs(exam.daysLeft), 1);
              const remainingDays = Math.max(exam.daysLeft, 0);
              const progress = exam.isCompleted ? 100 : Math.round((remainingDays / totalDays) * 100);
              const dashOffset = ringCircumference - (progress / 100) * ringCircumference;

              return (
                <div key={exam._id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-bold text-gray-900">{exam.courseName}</h3>
                      <span className="inline-block mt-1 text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                        {exam.courseCode || "No code"}
                      </span>
                    </div>
                    <svg width="72" height="72" className="shrink-0">
                      <circle cx="36" cy="36" r={ringRadius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
                      <circle
                        cx="36"
                        cy="36"
                        r={ringRadius}
                        stroke={exam.isCompleted ? "#16a34a" : "#2563eb"}
                        strokeWidth="8"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={ringCircumference}
                        strokeDashoffset={dashOffset}
                        transform="rotate(-90 36 36)"
                      />
                      <text x="36" y="41" textAnchor="middle" className="fill-gray-700 text-xs font-semibold">
                        {progress}%
                      </text>
                    </svg>
                  </div>

                  <p className={`text-2xl font-bold mb-2 ${getCountdownClass(exam)}`}>{getCountdownText(exam)}</p>
                  <p className="text-sm text-gray-700">
                    {new Date(exam.examDate).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}{" "}
                    • {exam.examDay || "-"}
                  </p>
                  <p className="text-sm text-gray-600">
                    {exam.startTime || "--:--"} - {exam.endTime || "--:--"}
                  </p>
                  <p className="text-sm text-gray-600 mb-4">Venue: {exam.venue || "-"}</p>

                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => void toggleComplete(exam)}
                      className={`px-3 py-2 rounded-lg text-sm border ${
                        exam.isCompleted
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-gray-50 text-gray-700 border-gray-200"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" />
                        {exam.isCompleted ? "Completed" : "Mark Complete"}
                      </span>
                    </button>
                    <button
                      onClick={() => void removeExam(exam._id)}
                      className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                      title="Delete exam"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <Link
                    href={`/browse?subject=${encodeURIComponent(exam.courseName)}`}
                    className="mt-3 inline-block text-sm text-blue-600 hover:text-blue-700"
                  >
                    Browse notes for this subject
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-xl border border-gray-200 shadow-xl">
            <form onSubmit={submitExam} className="p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Add Exam</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  value={form.courseName}
                  onChange={(e) => setForm((prev) => ({ ...prev, courseName: e.target.value }))}
                  placeholder="Course Name"
                  className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-2"
                  required
                />
                <input
                  value={form.courseCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, courseCode: e.target.value }))}
                  placeholder="Course Code"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={form.semester}
                  onChange={(e) => setForm((prev) => ({ ...prev, semester: Number(e.target.value) }))}
                  placeholder="Semester"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  type="date"
                  value={form.examDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  value={form.examDay}
                  onChange={(e) => setForm((prev) => ({ ...prev, examDay: e.target.value }))}
                  placeholder="Day"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  placeholder="Start Time (HH:MM)"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  value={form.endTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  placeholder="End Time (HH:MM)"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
                <input
                  value={form.venue}
                  onChange={(e) => setForm((prev) => ({ ...prev, venue: e.target.value }))}
                  placeholder="Venue"
                  className="px-3 py-2 border border-gray-300 rounded-lg md:col-span-2"
                />
              </div>

              <textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Notes (optional)"
                className="w-full h-24 px-3 py-2 border border-gray-300 rounded-lg"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "Saving..." : "Save Exam"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
