"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { AttendanceSubject } from "@/types";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

type MarkForm = {
  date: string;
  status: "present" | "absent" | "late";
  note: string;
};

type AddSubjectForm = {
  subject: string;
  minimumRequired: number;
};

type EditForm = {
  subject: string;
  minimumRequired: number;
};

const formatDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const statusColor = (status: AttendanceSubject["status"]) => {
  if (status === "safe") return "text-green-600";
  if (status === "warning") return "text-amber-500";
  return "text-red-600";
};

const ringColor = (status: AttendanceSubject["status"]) => {
  if (status === "safe") return "#16a34a";
  if (status === "warning") return "#f59e0b";
  return "#dc2626";
};

const recordBadge = (status: "present" | "absent" | "late") => {
  if (status === "present") return "bg-green-100 text-green-700";
  if (status === "late") return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
};

export default function AttendancePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState<AddSubjectForm>({
    subject: "",
    minimumRequired: 75,
  });

  const [markingSubject, setMarkingSubject] = useState<AttendanceSubject | null>(null);
  const [markForm, setMarkForm] = useState<MarkForm>({
    date: new Date().toISOString().slice(0, 10),
    status: "present",
    note: "",
  });

  const [editingSubject, setEditingSubject] = useState<AttendanceSubject | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({
    subject: "",
    minimumRequired: 75,
  });

  const [expandedRecords, setExpandedRecords] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchAttendance();
    }
  }, [authLoading, user, router]);

  const overallPercentage = useMemo(() => {
    const totalAttended = subjects.reduce((sum, s) => sum + s.attendedClasses, 0);
    const totalClasses = subjects.reduce((sum, s) => sum + s.totalClasses, 0);
    if (totalClasses === 0) return 0;
    return Number(((totalAttended / totalClasses) * 100).toFixed(1));
  }, [subjects]);

  const overdueCount = useMemo(
    () => subjects.filter((subject) => subject.status !== "safe").length,
    [subjects]
  );

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{ subjects: AttendanceSubject[] }>("/api/attendance");
      setSubjects(response.data.subjects);
    } catch (err) {
      console.error("Failed to fetch attendance:", err);
      setError("Failed to load attendance");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubject = async (event: FormEvent) => {
    event.preventDefault();
    if (!addForm.subject.trim()) return;

    try {
      setSaving(true);
      await api.post("/api/attendance", {
        subject: addForm.subject.trim(),
        minimumRequired: addForm.minimumRequired,
      });
      setShowAddModal(false);
      setAddForm({ subject: "", minimumRequired: 75 });
      await fetchAttendance();
    } catch (err) {
      console.error("Failed to add subject:", err);
      setError("Failed to add subject");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAttendance = async (event: FormEvent) => {
    event.preventDefault();
    if (!markingSubject) return;

    try {
      setSaving(true);
      await api.post(`/api/attendance/${markingSubject._id}/mark`, {
        date: markForm.date,
        status: markForm.status,
        note: markForm.note.trim(),
      });
      setMarkingSubject(null);
      setMarkForm({
        date: new Date().toISOString().slice(0, 10),
        status: "present",
        note: "",
      });
      await fetchAttendance();
    } catch (err) {
      console.error("Failed to mark attendance:", err);
      setError("Failed to mark attendance");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (subject: AttendanceSubject) => {
    setEditingSubject(subject);
    setEditForm({
      subject: subject.subject,
      minimumRequired: subject.minimumRequired,
    });
  };

  const handleUpdateSubject = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingSubject) return;

    try {
      setSaving(true);
      await api.put(`/api/attendance/${editingSubject._id}`, {
        subject: editForm.subject.trim(),
        minimumRequired: editForm.minimumRequired,
      });
      setEditingSubject(null);
      await fetchAttendance();
    } catch (err) {
      console.error("Failed to update subject:", err);
      setError("Failed to update subject");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSubject = async (id: string) => {
    if (!confirm("Delete this subject and all attendance records?")) {
      return;
    }
    try {
      await api.delete(`/api/attendance/${id}`);
      await fetchAttendance();
    } catch (err) {
      console.error("Failed to delete subject:", err);
      setError("Failed to delete subject");
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Attendance Tracker</h1>
            <p className="text-gray-600 mt-1">Overall attendance: {overallPercentage}%</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
          >
            <Plus className="h-5 w-5" />
            <span>Add Subject</span>
          </button>
        </div>

        {overdueCount > 0 && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4">
            {overdueCount} subject{overdueCount > 1 ? "s are" : " is"} below safe attendance!
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">{error}</div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 flex justify-center">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
        ) : subjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {subjects.map((subject) => {
              const radius = 42;
              const circumference = 2 * Math.PI * radius;
              const safePercent = Math.min(100, Math.max(0, subject.percentage));
              const offset = circumference - (safePercent / 100) * circumference;

              return (
                <div key={subject._id} className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <h2 className="text-xl font-semibold text-gray-900">{subject.subject}</h2>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(subject)}
                        className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                        title="Edit subject"
                      >
                        <Pencil className="h-4 w-4 text-gray-600" />
                      </button>
                      <button
                        onClick={() => handleDeleteSubject(subject._id)}
                        className="p-2 bg-red-600 rounded-lg hover:bg-red-700"
                        title="Delete subject"
                      >
                        <Trash2 className="h-4 w-4 text-white" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className={`text-4xl font-bold ${statusColor(subject.status)}`}>
                        {subject.percentage.toFixed(1)}%
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {subject.attendedClasses}/{subject.totalClasses} classes attended
                      </p>
                      <p className="text-sm text-gray-600">Minimum required: {subject.minimumRequired}%</p>
                    </div>
                    <svg width="110" height="110" viewBox="0 0 110 110">
                      <circle
                        cx="55"
                        cy="55"
                        r={radius}
                        fill="transparent"
                        stroke="#e5e7eb"
                        strokeWidth="10"
                      />
                      <circle
                        cx="55"
                        cy="55"
                        r={radius}
                        fill="transparent"
                        stroke={ringColor(subject.status)}
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        transform="rotate(-90 55 55)"
                      />
                    </svg>
                  </div>

                  {subject.status === "safe" ? (
                    <p className="text-sm text-green-700 mb-4">
                      You can miss {subject.canAffordToMiss} more classes
                    </p>
                  ) : subject.status === "warning" ? (
                    <p className="text-sm text-amber-700 mb-4">
                      Warning! Attend next {subject.classesNeededToReach} classes
                    </p>
                  ) : (
                    <p className="text-sm text-red-700 mb-4">
                      DANGER! Need {subject.classesNeededToReach} classes to recover
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setMarkingSubject(subject);
                        setMarkForm({
                          date: new Date().toISOString().slice(0, 10),
                          status: "present",
                          note: "",
                        });
                      }}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                    >
                      Mark Today
                    </button>
                    <button
                      onClick={() =>
                        setExpandedRecords((prev) => ({
                          ...prev,
                          [subject._id]: !prev[subject._id],
                        }))
                      }
                      className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      View Records
                    </button>
                  </div>

                  {expandedRecords[subject._id] && (
                    <div className="mt-4 border-t border-gray-200 pt-4 space-y-2">
                      {subject.records.slice(-10).reverse().map((record) => (
                        <div
                          key={record._id}
                          className="flex items-center justify-between text-sm bg-gray-50 rounded-md px-3 py-2"
                        >
                          <span className="text-gray-700">{formatDate(record.date)}</span>
                          <span className={`px-2 py-1 rounded-full text-xs ${recordBadge(record.status)}`}>
                            {record.status}
                          </span>
                          <span className="text-gray-500 max-w-[140px] truncate">
                            {record.note || "-"}
                          </span>
                        </div>
                      ))}
                      {subject.records.length === 0 && (
                        <p className="text-sm text-gray-500">No records yet.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
            <div className="h-16 w-16 mx-auto mb-4 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl">
              📈
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No attendance subjects yet</h3>
            <p className="text-gray-600 mb-6">Add your first subject to start tracking.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Add your first subject
            </button>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Add Subject</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAddSubject} className="p-5 space-y-4">
              <input
                value={addForm.subject}
                onChange={(event) =>
                  setAddForm((prev) => ({ ...prev, subject: event.target.value }))
                }
                placeholder="Subject name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <input
                type="number"
                min={0}
                max={100}
                value={addForm.minimumRequired}
                onChange={(event) =>
                  setAddForm((prev) => ({
                    ...prev,
                    minimumRequired: Number(event.target.value),
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                {saving ? "Saving..." : "Add Subject"}
              </button>
            </form>
          </div>
        </div>
      )}

      {markingSubject && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Mark Attendance</h3>
                <p className="text-sm text-gray-600">{markingSubject.subject}</p>
              </div>
              <button onClick={() => setMarkingSubject(null)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleMarkAttendance} className="p-5 space-y-4">
              <input
                type="date"
                value={markForm.date}
                onChange={(event) =>
                  setMarkForm((prev) => ({ ...prev, date: event.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <div className="grid grid-cols-3 gap-2">
                {(["present", "absent", "late"] as const).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setMarkForm((prev) => ({ ...prev, status }))}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                      markForm.status === status
                        ? status === "present"
                          ? "bg-green-600 text-white border-green-600"
                          : status === "absent"
                          ? "bg-red-600 text-white border-red-600"
                          : "bg-amber-500 text-white border-amber-500"
                        : "bg-white border-gray-300 text-gray-700"
                    }`}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
              <input
                value={markForm.note}
                onChange={(event) =>
                  setMarkForm((prev) => ({ ...prev, note: event.target.value }))
                }
                placeholder="Optional note"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                {saving ? "Saving..." : "Mark Attendance"}
              </button>
            </form>
          </div>
        </div>
      )}

      {editingSubject && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Edit Subject</h3>
              <button onClick={() => setEditingSubject(null)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateSubject} className="p-5 space-y-4">
              <input
                value={editForm.subject}
                onChange={(event) =>
                  setEditForm((prev) => ({ ...prev, subject: event.target.value }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />
              <input
                type="number"
                min={0}
                max={100}
                value={editForm.minimumRequired}
                onChange={(event) =>
                  setEditForm((prev) => ({
                    ...prev,
                    minimumRequired: Number(event.target.value),
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
              <button
                type="submit"
                disabled={saving}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"
              >
                {saving ? "Saving..." : "Update Subject"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
