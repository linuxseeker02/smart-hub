"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { GradesResponse, GradeSubject, SemesterGrade } from "@/types";

type EditableSubject = {
  name: string;
  credits: number;
  grade: string;
  gradePoint: number;
  marks: number | null;
  maxMarks: number;
};

const createEmptySubject = (): EditableSubject => ({
  name: "",
  credits: 0,
  grade: "",
  gradePoint: 0,
  marks: null,
  maxMarks: 100,
});

const toNumber = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const calculateSgpaPreview = (subjects: EditableSubject[]) => {
  const totalCredits = subjects.reduce((sum, subject) => sum + subject.credits, 0);
  if (totalCredits === 0) return 0;
  const weighted = subjects.reduce((sum, subject) => sum + subject.gradePoint * subject.credits, 0);
  return Number((weighted / totalCredits).toFixed(2));
};

const cgpaMeta = (cgpa: number) => {
  if (cgpa >= 8.5) return { label: "Excellent", color: "text-green-600" };
  if (cgpa >= 7.0) return { label: "Good", color: "text-blue-600" };
  if (cgpa >= 6.0) return { label: "Average", color: "text-yellow-600" };
  return { label: "Needs Improvement", color: "text-red-600" };
};

export default function GradesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [gradesData, setGradesData] = useState<GradesResponse>({
    semesters: [],
    cgpa: 0,
    totalCredits: 0,
    totalSemesters: 0,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedSemesterId, setExpandedSemesterId] = useState<string | null>(null);
  const [editingSemesterId, setEditingSemesterId] = useState<string | null>(null);
  const [editSubjects, setEditSubjects] = useState<EditableSubject[]>([]);
  const [editSemesterNumber, setEditSemesterNumber] = useState<number | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newSemester, setNewSemester] = useState(1);
  const [newSubjects, setNewSubjects] = useState<EditableSubject[]>([createEmptySubject()]);

  const summaryMeta = useMemo(() => cgpaMeta(gradesData.cgpa), [gradesData.cgpa]);
  const addSgpaPreview = useMemo(() => calculateSgpaPreview(newSubjects), [newSubjects]);
  const editSgpaPreview = useMemo(() => calculateSgpaPreview(editSubjects), [editSubjects]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }
    if (user) {
      void fetchGrades();
    }
  }, [authLoading, user, router]);

  const fetchGrades = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<GradesResponse>("/api/grades");
      setGradesData(response.data);
    } catch (err) {
      console.error("Failed to fetch grades:", err);
      setError("Failed to load grades");
    } finally {
      setLoading(false);
    }
  };

  const convertGrade = async (
    grade: string,
    system: "10point" | "4point" = "10point"
  ): Promise<number | null> => {
    const normalized = grade.trim();
    if (!normalized) return null;

    try {
      const response = await api.post<{ grade: string; gradePoint: number }>("/api/grades/convert", {
        grade: normalized,
        system,
      });
      return response.data.gradePoint;
    } catch {
      return null;
    }
  };

  const handleAddSubjectRow = () => {
    setNewSubjects((prev) => [...prev, createEmptySubject()]);
  };

  const handleRemoveSubjectRow = (index: number) => {
    setNewSubjects((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNewSubjectChange = <K extends keyof EditableSubject>(
    index: number,
    key: K,
    value: EditableSubject[K]
  ) => {
    setNewSubjects((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const handleEditSubjectChange = <K extends keyof EditableSubject>(
    index: number,
    key: K,
    value: EditableSubject[K]
  ) => {
    setEditSubjects((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  };

  const sanitizeSubjects = (subjects: EditableSubject[]) =>
    subjects
      .map((subject) => ({
        name: subject.name.trim(),
        credits: Number(subject.credits),
        grade: subject.grade.trim(),
        gradePoint: Number(subject.gradePoint),
        marks: subject.marks === null ? null : Number(subject.marks),
        maxMarks: Number(subject.maxMarks || 100),
      }))
      .filter((subject) => subject.name && subject.grade);

  const saveSemester = async (semester: number, subjects: EditableSubject[]) => {
    const payloadSubjects = sanitizeSubjects(subjects);
    if (payloadSubjects.length === 0) {
      setError("Add at least one valid subject");
      return;
    }

    try {
      setSaving(true);
      await api.post("/api/grades/semester", {
        semester,
        subjects: payloadSubjects,
      });
      await fetchGrades();
    } catch (err) {
      console.error("Failed to save semester:", err);
      setError("Failed to save semester");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSemester = async (event: FormEvent) => {
    event.preventDefault();
    await saveSemester(newSemester, newSubjects);
    setShowAddForm(false);
    setNewSemester(1);
    setNewSubjects([createEmptySubject()]);
  };

  const startEditSemester = (semester: SemesterGrade) => {
    setEditingSemesterId(semester._id);
    setEditSemesterNumber(semester.semester);
    setEditSubjects(
      semester.subjects.map((subject) => ({
        name: subject.name,
        credits: subject.credits,
        grade: subject.grade,
        gradePoint: subject.gradePoint,
        marks: subject.marks,
        maxMarks: subject.maxMarks,
      }))
    );
    setExpandedSemesterId(semester._id);
  };

  const cancelEditSemester = () => {
    setEditingSemesterId(null);
    setEditSemesterNumber(null);
    setEditSubjects([]);
  };

  const submitEditSemester = async () => {
    if (!editSemesterNumber) return;
    await saveSemester(editSemesterNumber, editSubjects);
    cancelEditSemester();
  };

  const handleDeleteSemester = async (id: string) => {
    if (!confirm("Delete this semester record?")) {
      return;
    }
    try {
      await api.delete(`/api/grades/semester/${id}`);
      await fetchGrades();
    } catch (err) {
      console.error("Failed to delete semester:", err);
      setError("Failed to delete semester");
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
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <div className="text-center mb-6">
            <p className="text-sm font-medium text-gray-500">Current CGPA</p>
            <p className={`text-6xl font-bold mt-2 ${summaryMeta.color}`}>{gradesData.cgpa.toFixed(2)}</p>
            <p className={`mt-2 font-medium ${summaryMeta.color}`}>{summaryMeta.label}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 text-center">
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-sm text-gray-500">Total Credits</p>
              <p className="text-2xl font-bold text-gray-900">{gradesData.totalCredits}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-sm text-gray-500">Total Semesters</p>
              <p className="text-2xl font-bold text-gray-900">{gradesData.totalSemesters}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 border border-gray-200">
              <p className="text-sm text-gray-500">Scale</p>
              <p className="text-2xl font-bold text-gray-900">/ 10</p>
            </div>
          </div>
          <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all"
              style={{ width: `${Math.min(100, (gradesData.cgpa / 10) * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Grade Calculator</h1>
          <button
            onClick={() => setShowAddForm(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Semester
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3">{error}</div>
        )}

        {loading ? (
          <div className="bg-white border border-gray-200 rounded-lg p-10 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : gradesData.semesters.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-10 text-center">
            <h2 className="text-xl font-semibold text-gray-900">No semester grades yet</h2>
            <p className="text-gray-600 mt-2">Add your first semester to start tracking CGPA.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {gradesData.semesters.map((semester) => {
              const expanded = expandedSemesterId === semester._id;
              const editing = editingSemesterId === semester._id;
              const subjectsToShow: GradeSubject[] | EditableSubject[] = editing
                ? editSubjects
                : semester.subjects;

              return (
                <div key={semester._id} className="bg-white border border-gray-200 rounded-xl shadow-sm">
                  <button
                    onClick={() => setExpandedSemesterId(expanded ? null : semester._id)}
                    className="w-full p-5 flex items-center justify-between text-left"
                  >
                    <div>
                      <p className="text-lg font-semibold text-gray-900">Semester {semester.semester}</p>
                      <p className="text-sm text-gray-600 mt-1">
                        SGPA{" "}
                        <span className="font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded">
                          {editing ? editSgpaPreview.toFixed(2) : semester.sgpa.toFixed(2)}
                        </span>{" "}
                        • Credits {semester.totalCredits} • Subjects {semester.subjects.length}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (editing) {
                            void submitEditSemester();
                          } else {
                            startEditSemester(semester);
                          }
                        }}
                        className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-1"
                      >
                        {editing ? <Save className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                        {editing ? "Save" : "Edit"}
                      </button>
                      {editing && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            cancelEditSemester();
                          }}
                          className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDeleteSemester(semester._id);
                        }}
                        className="px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 flex items-center gap-1"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                      {expanded ? <ChevronUp className="h-5 w-5 text-gray-600" /> : <ChevronDown className="h-5 w-5 text-gray-600" />}
                    </div>
                  </button>

                  {expanded && (
                    <div className="border-t border-gray-200 p-5">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-left text-gray-600">
                              <th className="py-2">Subject</th>
                              <th className="py-2">Credits</th>
                              <th className="py-2">Grade</th>
                              <th className="py-2">Grade Point</th>
                              <th className="py-2">Marks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {subjectsToShow.map((subject, index) => (
                              <tr key={index} className="border-t border-gray-100">
                                <td className="py-2 pr-2">
                                  {editing ? (
                                    <input
                                      value={subject.name}
                                      onChange={(event) =>
                                        handleEditSubjectChange(index, "name", event.target.value)
                                      }
                                      className="w-full px-2 py-1 border border-gray-300 rounded"
                                    />
                                  ) : (
                                    subject.name
                                  )}
                                </td>
                                <td className="py-2 pr-2">
                                  {editing ? (
                                    <input
                                      type="number"
                                      min={0}
                                      value={subject.credits}
                                      onChange={(event) =>
                                        handleEditSubjectChange(index, "credits", toNumber(event.target.value))
                                      }
                                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                                    />
                                  ) : (
                                    subject.credits
                                  )}
                                </td>
                                <td className="py-2 pr-2">
                                  {editing ? (
                                    <input
                                      value={subject.grade}
                                      onChange={(event) =>
                                        handleEditSubjectChange(index, "grade", event.target.value)
                                      }
                                      onBlur={async (event) => {
                                        const point = await convertGrade(event.target.value);
                                        if (point !== null) {
                                          handleEditSubjectChange(index, "gradePoint", point);
                                        }
                                      }}
                                      className="w-20 px-2 py-1 border border-gray-300 rounded"
                                    />
                                  ) : (
                                    subject.grade
                                  )}
                                </td>
                                <td className="py-2 pr-2">
                                  {editing ? (
                                    <input
                                      type="number"
                                      min={0}
                                      max={10}
                                      step="0.1"
                                      value={subject.gradePoint}
                                      onChange={(event) =>
                                        handleEditSubjectChange(index, "gradePoint", toNumber(event.target.value))
                                      }
                                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                                    />
                                  ) : (
                                    subject.gradePoint.toFixed(2)
                                  )}
                                </td>
                                <td className="py-2">
                                  {editing ? (
                                    <input
                                      type="number"
                                      min={0}
                                      value={subject.marks ?? ""}
                                      onChange={(event) =>
                                        handleEditSubjectChange(
                                          index,
                                          "marks",
                                          event.target.value === "" ? null : toNumber(event.target.value)
                                        )
                                      }
                                      className="w-24 px-2 py-1 border border-gray-300 rounded"
                                    />
                                  ) : subject.marks !== null ? (
                                    `${subject.marks}/${subject.maxMarks}`
                                  ) : (
                                    "-"
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-4 text-right text-sm text-gray-700">
                        SGPA:{" "}
                        <span className="font-semibold text-blue-700">
                          {editing ? editSgpaPreview.toFixed(2) : semester.sgpa.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showAddForm && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-5xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Add Semester</h2>
              <button onClick={() => setShowAddForm(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSemester} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                <select
                  value={newSemester}
                  onChange={(event) => setNewSemester(Number(event.target.value))}
                  className="w-48 px-3 py-2 border border-gray-300 rounded-lg"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <option key={sem} value={sem}>
                      Semester {sem}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                {newSubjects.map((subject, index) => (
                  <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                    <input
                      value={subject.name}
                      onChange={(event) => handleNewSubjectChange(index, "name", event.target.value)}
                      placeholder="Subject name"
                      className="md:col-span-4 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="number"
                      min={0}
                      value={subject.credits}
                      onChange={(event) => handleNewSubjectChange(index, "credits", toNumber(event.target.value))}
                      placeholder="Credits"
                      className="md:col-span-1 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      value={subject.grade}
                      onChange={(event) => handleNewSubjectChange(index, "grade", event.target.value)}
                      onBlur={async (event) => {
                        const point = await convertGrade(event.target.value);
                        if (point !== null) {
                          handleNewSubjectChange(index, "gradePoint", point);
                        }
                      }}
                      placeholder="Grade"
                      className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step="0.1"
                      value={subject.gradePoint}
                      onChange={(event) =>
                        handleNewSubjectChange(index, "gradePoint", toNumber(event.target.value))
                      }
                      placeholder="Grade Point"
                      className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <input
                      type="number"
                      min={0}
                      value={subject.marks ?? ""}
                      onChange={(event) =>
                        handleNewSubjectChange(
                          index,
                          "marks",
                          event.target.value === "" ? null : toNumber(event.target.value)
                        )
                      }
                      placeholder="Marks (optional)"
                      className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveSubjectRow(index)}
                      className="md:col-span-1 px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleAddSubjectRow}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Add Subject
              </button>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                  SGPA Preview: <span className="font-semibold">{addSgpaPreview.toFixed(2)}</span>
                </p>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 font-medium"
              >
                {saving ? "Saving..." : "Save Semester"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
