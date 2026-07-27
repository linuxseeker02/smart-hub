"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Download, Loader2, Trash2, Upload } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PYQ } from "@/types";

type Filters = {
  semester: string;
  courseCode: string;
  year: string;
  examType: string;
};

type UploadForm = {
  courseCode: string;
  courseName: string;
  semester: string;
  year: string;
  examType: string;
  description: string;
  file: File | null;
};

const EXAM_TYPES = [
  "End Semester",
  "Class Test 1 Set 1",
  "Class Test 1 Set 2",
  "Class Test 2 Set 1",
  "Class Test 2 Set 2",
] as const;

const DEFAULT_FILTERS: Filters = {
  semester: "",
  courseCode: "",
  year: "",
  examType: "",
};

const DEFAULT_UPLOAD_FORM: UploadForm = {
  courseCode: "",
  courseName: "",
  semester: "",
  year: "",
  examType: "",
  description: "",
  file: null,
};

const getYearBadgeClass = (year: number) => {
  if (year >= 2026) return "bg-blue-100 text-blue-700";
  if (year >= 2025) return "bg-green-100 text-green-700";
  return "bg-gray-100 text-gray-700";
};

const getExamTypeClass = (examType: PYQ["examType"]) => {
  if (examType === "End Semester") return "bg-red-100 text-red-700";
  if (examType === "Class Test 1 Set 1") return "bg-blue-100 text-blue-700";
  if (examType === "Class Test 1 Set 2") return "bg-indigo-100 text-indigo-700";
  if (examType === "Class Test 2 Set 1") return "bg-orange-100 text-orange-700";
  return "bg-amber-100 text-amber-700";
};

export default function PYQPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [pyqs, setPyqs] = useState<PYQ[]>([]);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploadForm, setUploadForm] = useState<UploadForm>(DEFAULT_UPLOAD_FORM);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const total = useMemo(() => pyqs.length, [pyqs]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      void fetchPYQs();
    }
  }, [authLoading, user, router, filters.semester, filters.courseCode, filters.year, filters.examType]);

  const fetchPYQs = async () => {
    try {
      setLoading(true);
      setMessage(null);
      const response = await api.get<{ pyqs: PYQ[]; total: number }>("/api/pyq", {
        params: {
          semester: filters.semester || undefined,
          courseCode: filters.courseCode.trim() || undefined,
          year: filters.year || undefined,
          examType: filters.examType || undefined,
        },
      });
      setPyqs(response.data.pyqs);
    } catch (error) {
      console.error("Failed to fetch PYQs:", error);
      setMessage({ type: "error", text: "Failed to load PYQs" });
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !uploadForm.courseCode.trim() ||
      !uploadForm.courseName.trim() ||
      !uploadForm.semester ||
      !uploadForm.year ||
      !uploadForm.examType ||
      !uploadForm.file
    ) {
      setMessage({ type: "error", text: "Please fill all required upload fields" });
      return;
    }

    if (uploadForm.file.type !== "application/pdf") {
      setMessage({ type: "error", text: "Only PDF files are allowed" });
      return;
    }

    try {
      setUploading(true);
      setMessage(null);

      const formData = new FormData();
      formData.append("courseCode", uploadForm.courseCode.trim());
      formData.append("courseName", uploadForm.courseName.trim());
      formData.append("semester", uploadForm.semester);
      formData.append("year", uploadForm.year);
      formData.append("examType", uploadForm.examType);
      formData.append("description", uploadForm.description.trim());
      formData.append("file", uploadForm.file);

      await api.post("/api/pyq/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setShowUploadModal(false);
      setUploadForm(DEFAULT_UPLOAD_FORM);
      setMessage({ type: "success", text: "PYQ uploaded successfully" });
      await fetchPYQs();
    } catch (error) {
      console.error("Upload failed:", error);
      setMessage({ type: "error", text: "Failed to upload PYQ" });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (pyq: PYQ) => {
    try {
      setDownloadingId(pyq._id);
      setMessage(null);

      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        setMessage({ type: "error", text: "API URL is not configured" });
        return;
      }

      const response = await fetch(`${apiUrl}/api/pyq/${pyq._id}/download`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = pyq.originalName || "pyq.pdf";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(objectUrl);

      await fetchPYQs();
    } catch (error) {
      console.error("Download failed:", error);
      setMessage({ type: "error", text: "Failed to download PYQ" });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this PYQ permanently?")) return;

    try {
      setMessage(null);
      await api.delete(`/api/pyq/${id}`);
      setMessage({ type: "success", text: "PYQ deleted" });
      await fetchPYQs();
    } catch (error) {
      console.error("Delete failed:", error);
      setMessage({ type: "error", text: "Failed to delete PYQ" });
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
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Archive className="h-8 w-8 text-blue-600" />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">PYQ Bank</h1>
              <p className="text-sm text-gray-600">{total} papers</p>
            </div>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            <span>Upload Paper</span>
          </button>
        </div>

        {message && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              message.type === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          <select
            value={filters.semester}
            onChange={(event) => setFilters((prev) => ({ ...prev, semester: event.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Semesters</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
              <option key={sem} value={sem}>
                Semester {sem}
              </option>
            ))}
          </select>

          <select
            value={filters.year}
            onChange={(event) => setFilters((prev) => ({ ...prev, year: event.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Years</option>
            {[2023, 2024, 2025, 2026, 2027, 2028].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <select
            value={filters.examType}
            onChange={(event) => setFilters((prev) => ({ ...prev, examType: event.target.value }))}
            className="px-3 py-2 border border-gray-300 rounded-lg"
          >
            <option value="">All Exam Types</option>
            {EXAM_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <input
            value={filters.courseCode}
            onChange={(event) => setFilters((prev) => ({ ...prev, courseCode: event.target.value }))}
            placeholder="Course code"
            className="px-3 py-2 border border-gray-300 rounded-lg"
          />

          <button
            onClick={clearFilters}
            className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
          >
            Clear Filters
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : pyqs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-600">
            No PYQs found for the selected filters.
          </div>
        ) : (
          <>
            <div className="hidden lg:block bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="min-w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-xs font-semibold text-gray-600 uppercase">
                    <th className="px-4 py-3">Course</th>
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Semester</th>
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Uploaded By</th>
                    <th className="px-4 py-3">Downloads</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pyqs.map((pyq) => {
                    const uploadedByName =
                      typeof pyq.uploadedBy === "string" ? "Unknown" : pyq.uploadedBy.name;
                    const ownerId = typeof pyq.uploadedBy === "string" ? pyq.uploadedBy : pyq.uploadedBy._id;
                    const canDelete = ownerId === user._id;

                    return (
                      <tr key={pyq._id} className="border-b border-gray-100 last:border-b-0">
                        <td className="px-4 py-3 font-medium text-gray-900">{pyq.courseName}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded-full">
                            {pyq.courseCode}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded-full">
                            Sem {pyq.semester}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${getYearBadgeClass(pyq.year)}`}>
                            {pyq.year}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs rounded-full ${getExamTypeClass(pyq.examType)}`}>
                            {pyq.examType}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{uploadedByName}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{pyq.downloadCount}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleDownload(pyq)}
                              disabled={downloadingId === pyq._id}
                              className="px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 flex items-center gap-1 text-sm"
                            >
                              <Download className="h-4 w-4" />
                              <span>{downloadingId === pyq._id ? "Downloading..." : "Download"}</span>
                            </button>
                            {canDelete && (
                              <button
                                onClick={() => handleDelete(pyq._id)}
                                className="px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 flex items-center gap-1 text-sm"
                              >
                                <Trash2 className="h-4 w-4" />
                                <span>Delete</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="lg:hidden space-y-3">
              {pyqs.map((pyq) => {
                const ownerId = typeof pyq.uploadedBy === "string" ? pyq.uploadedBy : pyq.uploadedBy._id;
                const canDelete = ownerId === user._id;
                return (
                  <div key={pyq._id} className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{pyq.courseName}</h3>
                      <p className="text-sm text-gray-600">{pyq.courseCode}</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-50 text-blue-700">
                        Sem {pyq.semester}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${getYearBadgeClass(pyq.year)}`}>
                        {pyq.year}
                      </span>
                      <span className={`px-2 py-1 text-xs rounded-full ${getExamTypeClass(pyq.examType)}`}>
                        {pyq.examType}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDownload(pyq)}
                      disabled={downloadingId === pyq._id}
                      className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300 flex items-center justify-center gap-2"
                    >
                      <Download className="h-4 w-4" />
                      <span>{downloadingId === pyq._id ? "Downloading..." : "Download"}</span>
                    </button>

                    {canDelete && (
                      <button
                        onClick={() => handleDelete(pyq._id)}
                        className="w-full px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {showUploadModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-xl p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload PYQ</h2>

            <form onSubmit={handleUpload} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  value={uploadForm.courseCode}
                  onChange={(event) =>
                    setUploadForm((prev) => ({ ...prev, courseCode: event.target.value }))
                  }
                  placeholder="Course code"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
                <input
                  value={uploadForm.courseName}
                  onChange={(event) =>
                    setUploadForm((prev) => ({ ...prev, courseName: event.target.value }))
                  }
                  placeholder="Course name"
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={uploadForm.semester}
                  onChange={(event) =>
                    setUploadForm((prev) => ({ ...prev, semester: event.target.value }))
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Semester</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((sem) => (
                    <option key={sem} value={sem}>
                      {sem}
                    </option>
                  ))}
                </select>

                <select
                  value={uploadForm.year}
                  onChange={(event) => setUploadForm((prev) => ({ ...prev, year: event.target.value }))}
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Year</option>
                  {[2023, 2024, 2025, 2026, 2027, 2028].map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>

                <select
                  value={uploadForm.examType}
                  onChange={(event) =>
                    setUploadForm((prev) => ({ ...prev, examType: event.target.value }))
                  }
                  className="px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  <option value="">Exam type</option>
                  {EXAM_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <textarea
                value={uploadForm.description}
                onChange={(event) => setUploadForm((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="Description (optional)"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
              />

              <input
                type="file"
                accept=".pdf,application/pdf"
                onChange={(event) =>
                  setUploadForm((prev) => ({ ...prev, file: event.target.files?.[0] ?? null }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadForm(DEFAULT_UPLOAD_FORM);
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
                >
                  {uploading ? "Uploading..." : "Upload"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
