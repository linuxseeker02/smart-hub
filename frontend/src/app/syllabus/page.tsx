"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SyllabusSubject, SyllabusTopic } from "@/types";

type SubjectForm = {
  courseName: string;
  courseCode: string;
  semester: number;
  credits: number;
};

const defaultForm: SubjectForm = {
  courseName: "",
  courseCode: "",
  semester: 4,
  credits: 0,
};

const getProgressClass = (progress: number) => {
  if (progress >= 100) return "bg-green-500";
  if (progress >= 67) return "bg-blue-500";
  if (progress >= 34) return "bg-amber-500";
  return "bg-red-500";
};

export default function SyllabusPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [subjects, setSubjects] = useState<SyllabusSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<SubjectForm>(defaultForm);
  const [generating, setGenerating] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchSyllabus();
    }
  }, [authLoading, user, router]);

  const fetchSyllabus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{ subjects: SyllabusSubject[] }>("/api/syllabus");
      setSubjects(response.data.subjects);
    } catch (err) {
      console.error("Failed to fetch syllabus:", err);
      setError("Failed to load syllabus");
    } finally {
      setLoading(false);
    }
  };

  const setTopicStatus = async (
    subjectId: string,
    topicId: string,
    status: SyllabusTopic["status"]
  ) => {
    try {
      const response = await api.put<SyllabusSubject>(
        `/api/syllabus/${subjectId}/topics/${topicId}`,
        { status }
      );
      setSubjects((prev) =>
        prev.map((subject) => (subject._id === subjectId ? response.data : subject))
      );
    } catch (err) {
      console.error("Failed to update topic status:", err);
      setError("Failed to update topic status");
    }
  };

  const generateSubject = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.courseName.trim()) return;

    try {
      setGenerating(true);
      setError(null);
      await api.post("/api/syllabus/generate", {
        courseName: form.courseName.trim(),
        courseCode: form.courseCode.trim(),
        semester: form.semester,
        credits: form.credits,
      });
      setShowModal(false);
      setForm(defaultForm);
      await fetchSyllabus();
    } catch (err) {
      console.error("Failed to generate syllabus:", err);
      setError("Failed to generate syllabus");
    } finally {
      setGenerating(false);
    }
  };

  const seedSemester4 = async () => {
    try {
      setSeeding(true);
      setError(null);
      await api.post("/api/syllabus/seed");
      await fetchSyllabus();
    } catch (err) {
      console.error("Failed to seed syllabus:", err);
      setError("Failed to load Semester 4 syllabus");
    } finally {
      setSeeding(false);
    }
  };

  const deleteSubject = async (subjectId: string) => {
    if (!confirm("Delete this subject tracker?")) return;
    try {
      await api.delete(`/api/syllabus/${subjectId}`);
      await fetchSyllabus();
    } catch (err) {
      console.error("Failed to delete subject:", err);
      setError("Failed to delete subject");
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
            <h1 className="text-3xl font-bold text-gray-900">Syllabus Tracker</h1>
            <p className="text-sm text-gray-600 mt-1">{subjects.length} subjects tracked</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void seedSemester4()}
              disabled={seeding}
              className="px-4 py-2 rounded-lg border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-60"
            >
              {seeding ? "Loading..." : "Load Semester 4 Syllabus"}
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Subject
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : subjects.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-600">
            No subjects yet. Add one or load Semester 4 syllabus.
          </div>
        ) : (
          <div className="space-y-4">
            {subjects.map((subject) => {
              const completed = subject.topics.filter((topic) => topic.status === "completed").length;
              const total = subject.topics.length;
              const isExpanded = Boolean(expanded[subject._id]);

              return (
                <div key={subject._id} className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <button
                    className="w-full p-5 text-left flex items-center justify-between gap-4"
                    onClick={() =>
                      setExpanded((prev) => ({ ...prev, [subject._id]: !prev[subject._id] }))
                    }
                  >
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">
                        {subject.courseName}{" "}
                        <span className="text-sm font-medium text-gray-500">({subject.courseCode || "-"})</span>
                      </h3>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className="px-2 py-1 rounded bg-gray-100 text-gray-700 text-xs">
                          Credits: {subject.credits}
                        </span>
                        <span className="text-xs text-gray-600">
                          {completed}/{total} topics completed
                        </span>
                      </div>
                      <div className="mt-3 w-full md:w-96 h-2 rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className={`h-full ${getProgressClass(subject.overallProgress)}`}
                          style={{ width: `${Math.max(0, Math.min(subject.overallProgress, 100))}%` }}
                        />
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteSubject(subject._id);
                        }}
                        className="text-sm px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                      {isExpanded ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-100">
                      <div className="divide-y">
                        {subject.topics
                          .slice()
                          .sort((a, b) => a.order - b.order)
                          .map((topic) => (
                            <div key={topic._id} className="py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                              <div className="min-w-0">
                                <p
                                  className={`font-semibold ${
                                    topic.status === "completed" ? "line-through text-gray-500" : "text-gray-900"
                                  }`}
                                >
                                  {topic.title}
                                </p>
                                <p className="text-sm text-gray-600">{topic.description || "No description"}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => void setTopicStatus(subject._id, topic._id, "not-started")}
                                  className={`px-2 py-1 rounded text-xs border ${
                                    topic.status === "not-started"
                                      ? "bg-gray-800 text-white border-gray-800"
                                      : "bg-white text-gray-600 border-gray-300"
                                  }`}
                                >
                                  Not Started
                                </button>
                                <button
                                  onClick={() => void setTopicStatus(subject._id, topic._id, "in-progress")}
                                  className={`px-2 py-1 rounded text-xs border ${
                                    topic.status === "in-progress"
                                      ? "bg-blue-600 text-white border-blue-600"
                                      : "bg-white text-gray-600 border-gray-300"
                                  }`}
                                >
                                  In Progress
                                </button>
                                <button
                                  onClick={() => void setTopicStatus(subject._id, topic._id, "completed")}
                                  className={`px-2 py-1 rounded text-xs border ${
                                    topic.status === "completed"
                                      ? "bg-green-600 text-white border-green-600"
                                      : "bg-white text-gray-600 border-gray-300"
                                  }`}
                                >
                                  Completed
                                </button>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-xl border border-gray-200 shadow-xl">
            <form onSubmit={generateSubject} className="p-6 space-y-4">
              <h2 className="text-xl font-bold text-gray-900">Add Subject</h2>
              <input
                value={form.courseName}
                onChange={(e) => setForm((prev) => ({ ...prev, courseName: e.target.value }))}
                placeholder="Course Name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  value={form.courseCode}
                  onChange={(e) => setForm((prev) => ({ ...prev, courseCode: e.target.value }))}
                  placeholder="Course Code"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
                <select
                  value={form.semester}
                  onChange={(e) => setForm((prev) => ({ ...prev, semester: Number(e.target.value) }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((semester) => (
                    <option key={semester} value={semester}>
                      Semester {semester}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  value={form.credits}
                  onChange={(e) => setForm((prev) => ({ ...prev, credits: Number(e.target.value) }))}
                  placeholder="Credits"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>

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
                  disabled={generating}
                  className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {generating ? "AI is generating topics..." : "Generate Topics with AI"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
