"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Assignment, SubjectAssignment } from "@/types";
import { AlertCircle, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";

type AssignmentFilter = {
  status: string;
  subject: string;
  sortBy: string;
};

type AssignmentFormState = {
  title: string;
  subject: string;
  description: string;
  deadline: string;
  priority: "low" | "medium" | "high";
  status: "pending" | "in-progress" | "submitted" | "graded";
  grade: string;
};

type CIATab = "assignments" | "cia";

type CiaAssignmentEditForm = {
  title: string;
  description: string;
  submittedDate: string;
  marksObtained: string;
  status: "pending" | "submitted" | "graded";
  feedback: string;
};

type CiaClassTestEditForm = {
  marksObtained: string;
  conductedDate: string;
  remarks: string;
};

const DEFAULT_FORM: AssignmentFormState = {
  title: "",
  subject: "",
  description: "",
  deadline: "",
  priority: "medium",
  status: "pending",
  grade: "",
};

const toDateTimeLocal = (isoString: string) => {
  const date = new Date(isoString);
  const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
};

const toDateOnly = (isoString: string | null) => {
  if (!isoString) return "";
  return new Date(isoString).toISOString().slice(0, 10);
};

const formatDateDisplay = (isoString: string) =>
  new Date(isoString).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const getDaysLeftLabel = (deadline: string, status: Assignment["status"]) => {
  const now = new Date();
  const due = new Date(deadline);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0 && status !== "submitted" && status !== "graded") {
    return "OVERDUE";
  }

  if (diffDays <= 0) {
    return "Due today";
  }

  if (diffDays === 1) {
    return "1 day left";
  }

  return `${diffDays} days left`;
};

const getPriorityClass = (priority: Assignment["priority"]) => {
  if (priority === "high") return "bg-red-100 text-red-700";
  if (priority === "medium") return "bg-yellow-100 text-yellow-700";
  return "bg-green-100 text-green-700";
};

const getStatusClass = (status: Assignment["status"]) => {
  if (status === "pending") return "bg-gray-100 text-gray-700";
  if (status === "in-progress") return "bg-blue-100 text-blue-700";
  if (status === "submitted") return "bg-green-100 text-green-700";
  return "bg-purple-100 text-purple-700";
};

const getCIAProgressColor = (total: number) => {
  if (total >= 48) return "bg-green-500";
  if (total >= 36) return "bg-blue-500";
  if (total >= 24) return "bg-amber-500";
  return "bg-red-500";
};

const getCIAStatusClass = (status: "pending" | "submitted" | "graded") => {
  if (status === "graded") return "bg-green-100 text-green-700";
  if (status === "submitted") return "bg-blue-100 text-blue-700";
  return "bg-gray-100 text-gray-700";
};

const calculateBestCT = (subject: SubjectAssignment, testNumber: number) => {
  const marks = subject.classTests
    .filter((ct) => ct.number === testNumber)
    .map((ct) => ct.marksObtained ?? 0);
  return marks.length ? Math.max(...marks) : 0;
};

export default function AssignmentsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<CIATab>("assignments");

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [filter, setFilter] = useState<AssignmentFilter>({
    status: "all",
    subject: "",
    sortBy: "deadline",
  });
  const [showForm, setShowForm] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [form, setForm] = useState<AssignmentFormState>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [overdueCount, setOverdueCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [subjects, setSubjects] = useState<SubjectAssignment[]>([]);
  const [ciaLoading, setCiaLoading] = useState(false);
  const [ciaError, setCiaError] = useState<string | null>(null);
  const [ciaMessage, setCiaMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [editingCiaAssignmentKey, setEditingCiaAssignmentKey] = useState<string | null>(null);
  const [ciaAssignmentForm, setCiaAssignmentForm] = useState<CiaAssignmentEditForm>({
    title: "",
    description: "",
    submittedDate: "",
    marksObtained: "",
    status: "pending",
    feedback: "",
  });
  const [ciaClassTestForms, setCiaClassTestForms] = useState<Record<string, CiaClassTestEditForm>>({});
  const [otherMarksForm, setOtherMarksForm] = useState<Record<string, string>>({});

  const stats = useMemo(() => {
    const pending = assignments.filter((a) => a.status === "pending").length;
    const submitted = assignments.filter((a) => a.status === "submitted").length;
    return {
      total: assignments.length,
      pending,
      overdue: overdueCount,
      submitted,
    };
  }, [assignments, overdueCount]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user && activeTab === "assignments") {
      void fetchAssignments();
    }
  }, [user, activeTab, filter.status, filter.sortBy, filter.subject]);

  useEffect(() => {
    if (user && activeTab === "cia") {
      void fetchSubjectAssignments();
    }
  }, [user, activeTab]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{
        assignments: Assignment[];
        total: number;
        overdue: number;
      }>("/api/assignments", {
        params: {
          status: filter.status,
          subject: filter.subject,
          sortBy: filter.sortBy,
        },
      });

      setAssignments(response.data.assignments);
      setOverdueCount(response.data.overdue);
    } catch (err) {
      console.error("Failed to fetch assignments:", err);
      setError("Failed to load assignments");
    } finally {
      setLoading(false);
    }
  };

  const fetchSubjectAssignments = async () => {
    try {
      setCiaLoading(true);
      setCiaError(null);
      const response = await api.get<{ subjects: SubjectAssignment[] }>("/api/subject-assignments");
      setSubjects(response.data.subjects);

      const nextClassTests: Record<string, CiaClassTestEditForm> = {};
      const nextOtherMarks: Record<string, string> = {};

      response.data.subjects.forEach((subject) => {
        nextOtherMarks[subject._id] = String(subject.otherMarks ?? 0);
        subject.classTests.forEach((ct) => {
          nextClassTests[`${subject._id}-${ct.number}-${ct.set}`] = {
            marksObtained: ct.marksObtained === null ? "" : String(ct.marksObtained),
            conductedDate: toDateOnly(ct.conductedDate),
            remarks: ct.remarks || "",
          };
        });
      });

      setCiaClassTestForms(nextClassTests);
      setOtherMarksForm(nextOtherMarks);
    } catch (err) {
      console.error("Failed to fetch CIA tracker:", err);
      setCiaError("Failed to load CIA tracker");
    } finally {
      setCiaLoading(false);
    }
  };

  const resetForm = () => {
    setForm(DEFAULT_FORM);
    setEditingAssignment(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    setEditingAssignment(null);
    setForm(DEFAULT_FORM);
    setShowForm(true);
  };

  const openEditForm = (assignment: Assignment) => {
    setEditingAssignment(assignment);
    setForm({
      title: assignment.title,
      subject: assignment.subject,
      description: assignment.description || "",
      deadline: toDateTimeLocal(assignment.deadline),
      priority: assignment.priority,
      status: assignment.status,
      grade: assignment.grade || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.subject.trim() || !form.deadline) {
      return;
    }

    const payload = {
      title: form.title.trim(),
      subject: form.subject.trim(),
      description: form.description.trim(),
      deadline: new Date(form.deadline).toISOString(),
      priority: form.priority,
      status: form.status,
      grade: form.grade.trim(),
    };

    try {
      setSubmitting(true);
      if (editingAssignment) {
        await api.put(`/api/assignments/${editingAssignment._id}`, payload);
      } else {
        await api.post("/api/assignments", payload);
      }
      resetForm();
      await fetchAssignments();
    } catch (err) {
      console.error("Failed to save assignment:", err);
      setError("Failed to save assignment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this assignment?")) {
      return;
    }
    try {
      await api.delete(`/api/assignments/${id}`);
      await fetchAssignments();
    } catch (err) {
      console.error("Failed to delete assignment:", err);
      setError("Failed to delete assignment");
    }
  };

  const handleSeedSemester4 = async () => {
    try {
      setCiaMessage(null);
      await api.post("/api/subject-assignments/seed");
      setCiaMessage({ type: "success", text: "Semester 4 subjects loaded" });
      await fetchSubjectAssignments();
    } catch (err) {
      console.error("Failed to seed semester:", err);
      setCiaMessage({ type: "error", text: "Failed to load semester subjects" });
    }
  };

  const startEditCIAAssignment = (subject: SubjectAssignment, assignmentNumber: number) => {
    const assignment = subject.assignments.find((a) => a.number === assignmentNumber);
    if (!assignment) return;

    setEditingCiaAssignmentKey(`${subject._id}-${assignmentNumber}`);
    setCiaAssignmentForm({
      title: assignment.title || "",
      description: assignment.description || "",
      submittedDate: toDateOnly(assignment.submittedDate),
      marksObtained: assignment.marksObtained === null ? "" : String(assignment.marksObtained),
      status: assignment.status,
      feedback: assignment.feedback || "",
    });
  };

  const saveCIAAssignment = async (subjectId: string, assignmentNumber: number) => {
    try {
      setCiaMessage(null);

      await api.put(`/api/subject-assignments/${subjectId}/assignments/${assignmentNumber}`, {
        title: ciaAssignmentForm.title.trim(),
        description: ciaAssignmentForm.description.trim(),
        submittedDate: ciaAssignmentForm.submittedDate || null,
        marksObtained:
          ciaAssignmentForm.marksObtained === "" ? null : Number(ciaAssignmentForm.marksObtained),
        status: ciaAssignmentForm.status,
        feedback: ciaAssignmentForm.feedback.trim(),
      });

      setEditingCiaAssignmentKey(null);
      setCiaMessage({ type: "success", text: `Assignment ${assignmentNumber} updated` });
      await fetchSubjectAssignments();
    } catch (err) {
      console.error("Failed to update CIA assignment:", err);
      setCiaMessage({ type: "error", text: "Failed to update assignment details" });
    }
  };

  const saveClassTest = async (subjectId: string, testNumber: number, setNumber: number) => {
    const key = `${subjectId}-${testNumber}-${setNumber}`;
    const payload = ciaClassTestForms[key];
    if (!payload) return;

    try {
      setCiaMessage(null);
      await api.put(`/api/subject-assignments/${subjectId}/classtests/${testNumber}/sets/${setNumber}`, {
        marksObtained: payload.marksObtained === "" ? null : Number(payload.marksObtained),
        conductedDate: payload.conductedDate || null,
        remarks: payload.remarks.trim(),
      });
      setCiaMessage({ type: "success", text: `CT${testNumber} Set ${setNumber} updated` });
      await fetchSubjectAssignments();
    } catch (err) {
      console.error("Failed to update class test:", err);
      setCiaMessage({ type: "error", text: "Failed to update class test" });
    }
  };

  const saveOtherMarks = async (subjectId: string) => {
    const value = otherMarksForm[subjectId];

    try {
      setCiaMessage(null);
      await api.put(`/api/subject-assignments/${subjectId}/other`, { otherMarks: Number(value || 0) });
      setCiaMessage({ type: "success", text: "Other marks updated" });
      await fetchSubjectAssignments();
    } catch (err) {
      console.error("Failed to update other marks:", err);
      setCiaMessage({ type: "error", text: "Failed to update other marks" });
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => setActiveTab("assignments")}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeTab === "assignments" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Assignments
          </button>
          <button
            onClick={() => setActiveTab("cia")}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeTab === "cia" ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            CIA Tracker
          </button>
        </div>

        {activeTab === "assignments" ? (
          <>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <h1 className="text-3xl font-bold text-gray-900">My Assignments</h1>
              <button
                onClick={openCreateForm}
                className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
              >
                <Plus className="h-5 w-5" />
                <span>Add Assignment</span>
              </button>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pending</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.pending}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Overdue</p>
                <p
                  className={`text-2xl font-semibold ${
                    stats.overdue > 0 ? "text-red-600" : "text-gray-900"
                  }`}
                >
                  {stats.overdue}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Submitted</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.submitted}</p>
              </div>
            </div>

            {stats.overdue > 0 && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex items-center space-x-2">
                <AlertCircle className="h-5 w-5" />
                <span>{stats.overdue} assignments are overdue!</span>
              </div>
            )}

            <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={filter.status}
                onChange={(event) => setFilter((prev) => ({ ...prev, status: event.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="in-progress">In Progress</option>
                <option value="submitted">Submitted</option>
                <option value="graded">Graded</option>
              </select>
              <select
                value={filter.sortBy}
                onChange={(event) => setFilter((prev) => ({ ...prev, sortBy: event.target.value }))}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="deadline">Deadline</option>
                <option value="priority">Priority</option>
                <option value="createdAt">Created</option>
              </select>
              <input
                value={filter.subject}
                onChange={(event) => setFilter((prev) => ({ ...prev, subject: event.target.value }))}
                placeholder="Filter by subject"
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {showForm && (
              <div className="bg-white border border-gray-200 rounded-lg p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {editingAssignment ? "Edit Assignment" : "Add Assignment"}
                </h2>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <input
                    value={form.title}
                    onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Title"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                  <input
                    value={form.subject}
                    onChange={(event) => setForm((prev) => ({ ...prev, subject: event.target.value }))}
                    placeholder="Subject"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    required
                  />
                  <textarea
                    value={form.description}
                    onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                    placeholder="Description"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="datetime-local"
                      value={form.deadline}
                      onChange={(event) => setForm((prev) => ({ ...prev, deadline: event.target.value }))}
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                      required
                    />
                    <select
                      value={form.priority}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          priority: event.target.value as Assignment["priority"],
                        }))
                      }
                      className="px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>

                  {editingAssignment && (
                    <select
                      value={form.status}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          status: event.target.value as Assignment["status"],
                        }))
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="pending">Pending</option>
                      <option value="in-progress">In Progress</option>
                      <option value="submitted">Submitted</option>
                      <option value="graded">Graded</option>
                    </select>
                  )}

                  {form.status === "graded" && (
                    <input
                      value={form.grade}
                      onChange={(event) => setForm((prev) => ({ ...prev, grade: event.target.value }))}
                      placeholder="Grade (e.g., A+, 92/100)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                    />
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      {submitting ? "Saving..." : editingAssignment ? "Update Assignment" : "Create Assignment"}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-5 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">{error}</div>
            )}

            {loading ? (
              <div className="bg-white rounded-lg border border-gray-200 p-10 flex justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
            ) : assignments.length > 0 ? (
              <div className="space-y-3">
                {assignments.map((assignment) => {
                  const daysLeft = getDaysLeftLabel(assignment.deadline, assignment.status);
                  const isOverdue = daysLeft === "OVERDUE";

                  return (
                    <div
                      key={assignment._id}
                      className={`bg-white border border-gray-200 rounded-lg p-4 ${
                        isOverdue ? "border-l-4 border-l-red-500" : ""
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center flex-wrap gap-2">
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityClass(
                                assignment.priority
                              )}`}
                            >
                              {assignment.priority.toUpperCase()}
                            </span>
                            <h3 className="font-semibold text-gray-900 text-lg">{assignment.title}</h3>
                            <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                              {assignment.subject}
                            </span>
                          </div>

                          <p className="text-sm text-gray-600">{assignment.description || "No description"}</p>

                          <div className="flex items-center flex-wrap gap-3 text-sm">
                            <span className="text-gray-600">Due: {formatDateDisplay(assignment.deadline)}</span>
                            <span className={isOverdue ? "text-red-600 font-semibold" : "text-gray-600"}>
                              {daysLeft}
                            </span>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(
                                assignment.status
                              )}`}
                            >
                              {assignment.status}
                            </span>
                            {assignment.status === "graded" && assignment.grade && (
                              <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
                                Grade: {assignment.grade}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start md:self-center">
                          <button
                            onClick={() => openEditForm(assignment)}
                            className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-1 text-sm"
                          >
                            <Pencil className="h-4 w-4" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => handleDelete(assignment._id)}
                            className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1 text-sm"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
                <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl">
                  📚
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No assignments yet</h3>
                <p className="text-gray-600 mb-6">Track your coursework deadlines in one place.</p>
                <button
                  onClick={openCreateForm}
                  className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  Add your first assignment
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-between items-center flex-wrap gap-3">
              <h1 className="text-3xl font-bold text-gray-900">CIA Tracker</h1>
              <button
                onClick={handleSeedSemester4}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Load Semester 4 Subjects
              </button>
            </div>

            {ciaMessage && (
              <div
                className={`rounded-lg border p-3 text-sm ${
                  ciaMessage.type === "success"
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {ciaMessage.text}
              </div>
            )}

            {ciaError && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">{ciaError}</div>}

            {ciaLoading ? (
              <div className="bg-white rounded-lg border border-gray-200 p-10 flex justify-center">
                <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
              </div>
            ) : subjects.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-600">
                No CIA subjects found. Use "Load Semester 4 Subjects" to initialize.
              </div>
            ) : (
              <div className="space-y-4">
                {subjects.map((subject) => {
                  const progressPercent = Math.min(
                    100,
                    Math.round((subject.totalCIAMarks / Math.max(subject.maxCIAMarks, 1)) * 100)
                  );
                  const a1 = subject.assignments.find((entry) => entry.number === 1);
                  const a2 = subject.assignments.find((entry) => entry.number === 2);
                  const ct1Best = calculateBestCT(subject, 1);
                  const ct2Best = calculateBestCT(subject, 2);

                  return (
                    <div key={subject._id} className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
                      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                        <div>
                          <h2 className="text-lg font-semibold text-gray-900">{subject.courseName}</h2>
                          <p className="text-sm text-gray-600">{subject.courseCode}</p>
                        </div>
                        <div className="w-full md:w-80">
                          <div className="flex justify-between text-sm text-gray-600 mb-1">
                            <span>CIA Progress</span>
                            <span>
                              {subject.totalCIAMarks} / {subject.maxCIAMarks} CIA Marks
                            </span>
                          </div>
                          <div className="h-2.5 rounded-full bg-gray-200 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${getCIAProgressColor(subject.totalCIAMarks)}`}
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <details open className="border border-gray-200 rounded-lg">
                        <summary className="cursor-pointer px-4 py-3 font-medium text-gray-900">
                          Assignments
                        </summary>
                        <div className="px-4 pb-4 space-y-3">
                          {[1, 2].map((assignmentNumber) => {
                            const entry = subject.assignments.find((item) => item.number === assignmentNumber);
                            if (!entry) return null;
                            const editKey = `${subject._id}-${assignmentNumber}`;
                            const isEditing = editingCiaAssignmentKey === editKey;

                            return (
                              <div key={assignmentNumber} className="border border-gray-200 rounded-lg p-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <p className="font-medium text-gray-900">Assignment {assignmentNumber}</p>
                                    <span
                                      className={`px-2 py-1 rounded-full text-xs font-medium ${getCIAStatusClass(
                                        entry.status
                                      )}`}
                                    >
                                      {entry.status}
                                    </span>
                                  </div>
                                  <button
                                    onClick={() => startEditCIAAssignment(subject, assignmentNumber)}
                                    className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                                  >
                                    Edit
                                  </button>
                                </div>

                                {!isEditing ? (
                                  <div className="text-sm text-gray-600 mt-2">
                                    {entry.marksObtained ?? "-"} / {entry.maxMarks}
                                  </div>
                                ) : (
                                  <div className="mt-3 space-y-2">
                                    <input
                                      value={ciaAssignmentForm.title}
                                      onChange={(event) =>
                                        setCiaAssignmentForm((prev) => ({ ...prev, title: event.target.value }))
                                      }
                                      placeholder="Title"
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                    />
                                    <textarea
                                      value={ciaAssignmentForm.description}
                                      onChange={(event) =>
                                        setCiaAssignmentForm((prev) => ({
                                          ...prev,
                                          description: event.target.value,
                                        }))
                                      }
                                      placeholder="Description"
                                      rows={2}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                                    />
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                      <input
                                        type="date"
                                        value={ciaAssignmentForm.submittedDate}
                                        onChange={(event) =>
                                          setCiaAssignmentForm((prev) => ({
                                            ...prev,
                                            submittedDate: event.target.value,
                                          }))
                                        }
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                      />
                                      <input
                                        type="number"
                                        min={0}
                                        max={5}
                                        step={0.1}
                                        value={ciaAssignmentForm.marksObtained}
                                        onChange={(event) =>
                                          setCiaAssignmentForm((prev) => ({
                                            ...prev,
                                            marksObtained: event.target.value,
                                          }))
                                        }
                                        placeholder="Marks (0-5)"
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                      />
                                      <select
                                        value={ciaAssignmentForm.status}
                                        onChange={(event) =>
                                          setCiaAssignmentForm((prev) => ({
                                            ...prev,
                                            status: event.target.value as CiaAssignmentEditForm["status"],
                                          }))
                                        }
                                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                      >
                                        <option value="pending">Pending</option>
                                        <option value="submitted">Submitted</option>
                                        <option value="graded">Graded</option>
                                      </select>
                                    </div>
                                    <textarea
                                      value={ciaAssignmentForm.feedback}
                                      onChange={(event) =>
                                        setCiaAssignmentForm((prev) => ({ ...prev, feedback: event.target.value }))
                                      }
                                      placeholder="Feedback"
                                      rows={2}
                                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none"
                                    />
                                    <button
                                      onClick={() => saveCIAAssignment(subject._id, assignmentNumber)}
                                      className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                                    >
                                      <Save className="h-4 w-4" />
                                      <span>Save</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </details>

                      <details open className="border border-gray-200 rounded-lg">
                        <summary className="cursor-pointer px-4 py-3 font-medium text-gray-900">
                          Class Tests
                        </summary>
                        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                          {subject.classTests.map((ct) => {
                            const key = `${subject._id}-${ct.number}-${ct.set}`;
                            const formState = ciaClassTestForms[key] ?? {
                              marksObtained: "",
                              conductedDate: "",
                              remarks: "",
                            };

                            return (
                              <div key={key} className="border border-gray-200 rounded-lg p-3 space-y-2">
                                <p className="font-medium text-gray-900">CT{ct.number} S{ct.set}</p>
                                <input
                                  type="number"
                                  min={0}
                                  max={20}
                                  step={0.1}
                                  value={formState.marksObtained}
                                  onChange={(event) =>
                                    setCiaClassTestForms((prev) => ({
                                      ...prev,
                                      [key]: { ...formState, marksObtained: event.target.value },
                                    }))
                                  }
                                  placeholder="Marks (0-20)"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <input
                                  type="date"
                                  value={formState.conductedDate}
                                  onChange={(event) =>
                                    setCiaClassTestForms((prev) => ({
                                      ...prev,
                                      [key]: { ...formState, conductedDate: event.target.value },
                                    }))
                                  }
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <input
                                  value={formState.remarks}
                                  onChange={(event) =>
                                    setCiaClassTestForms((prev) => ({
                                      ...prev,
                                      [key]: { ...formState, remarks: event.target.value },
                                    }))
                                  }
                                  placeholder="Remarks"
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                                <button
                                  onClick={() => saveClassTest(subject._id, ct.number, ct.set)}
                                  className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                  Save
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </details>

                      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
                        <p className="font-medium text-gray-900">Other/Attendance Marks</p>
                        <div className="flex flex-wrap gap-2">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.1}
                            value={otherMarksForm[subject._id] ?? "0"}
                            onChange={(event) =>
                              setOtherMarksForm((prev) => ({ ...prev, [subject._id]: event.target.value }))
                            }
                            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-36"
                          />
                          <button
                            onClick={() => saveOtherMarks(subject._id)}
                            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            Save
                          </button>
                        </div>
                      </div>

                      <div className="border border-gray-200 rounded-lg overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50 text-gray-600">
                            <tr>
                              <th className="px-3 py-2 text-left">A1</th>
                              <th className="px-3 py-2 text-left">A2</th>
                              <th className="px-3 py-2 text-left">CT1 Best</th>
                              <th className="px-3 py-2 text-left">CT2 Best</th>
                              <th className="px-3 py-2 text-left">Other</th>
                              <th className="px-3 py-2 text-left">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="border-t border-gray-100">
                              <td className="px-3 py-2">{a1?.marksObtained ?? 0}</td>
                              <td className="px-3 py-2">{a2?.marksObtained ?? 0}</td>
                              <td className="px-3 py-2">{ct1Best}</td>
                              <td className="px-3 py-2">{ct2Best}</td>
                              <td className="px-3 py-2">{subject.otherMarks ?? 0}</td>
                              <td className="px-3 py-2 font-semibold">{subject.totalCIAMarks}/60</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
