"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { Note } from "@/types";
import NoteCard from "@/components/NoteCard";
import {
  User,
  Calendar,
  FileText,
  Loader2,
  Trash2,
  Bookmark,
  Upload,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<"uploads" | "saved">("uploads");
  const [uploadedNotes, setUploadedNotes] = useState<Note[]>([]);
  const [savedNotes, setSavedNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [savedLoading, setSavedLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (user) {
      fetchUploadedNotes();
    }
  }, [user, authLoading, router]);

  const fetchUploadedNotes = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Fetch user's uploaded notes
      const response = await api.get<{ notes: Note[] }>("/api/notes", {
        params: { limit: 100 }, // Get all user's notes
      });

      // Filter to only show notes uploaded by current user
      const userNotes = response.data.notes.filter((note) => {
        if (typeof note.uploadedBy === "object" && note.uploadedBy) {
          return note.uploadedBy._id === user?._id;
        }
        return false;
      });

      setUploadedNotes(userNotes);
    } catch (err) {
      console.error("Error fetching notes:", err);
      setError("Failed to load your notes");
    } finally {
      setLoading(false);
    }
  };

  const fetchSavedNotes = async () => {
    try {
      setSavedLoading(true);
      setSavedError(null);

      const response = await api.get<{ notes: Note[]; total: number }>("/api/notes/bookmarks");
      setSavedNotes(response.data.notes);
    } catch (err) {
      console.error("Error fetching saved notes:", err);
      setSavedError("Failed to load your saved notes");
    } finally {
      setSavedLoading(false);
    }
  };

  const handleDelete = async (noteId: string) => {
    if (!confirm("Are you sure you want to delete this note? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingId(noteId);
      await api.delete(`/api/notes/${noteId}`);
      
      // Remove from list without page reload
      setUploadedNotes((prev) => prev.filter((note) => note._id !== noteId));
    } catch (err: unknown) {
      console.error("Delete error:", err);
      if (err && typeof err === "object" && "response" in err) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        alert(axiosError.response?.data?.message || "Failed to delete note");
      } else {
        alert("Failed to delete note");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* User Profile Summary */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Welcome, {user.name}!
              </h1>
              <div className="space-y-1 text-gray-600">
                <div className="flex items-center space-x-2">
                  <User className="h-4 w-4" />
                  <span>{user.email}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4" />
                  <span>Joined {formatDate(user.createdAt)}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <FileText className="h-4 w-4" />
                  <span>{uploadedNotes.length} notes uploaded</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => router.push("/upload")}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
            >
              <Upload className="h-5 w-5" />
              <span>Upload Note</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab("uploads")}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "uploads"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <FileText className="h-5 w-5" />
                  <span>My Uploads ({uploadedNotes.length})</span>
                </div>
              </button>
              <button
                onClick={() => {
                  setActiveTab("saved");
                  fetchSavedNotes();
                }}
                className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "saved"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center space-x-2">
                  <Bookmark className="h-5 w-5" />
                  <span>Saved Notes ({savedNotes.length})</span>
                </div>
              </button>
            </nav>
          </div>

          <div className="p-8">
            {/* My Uploads Tab */}
            {activeTab === "uploads" && (
              <div>
                {loading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  </div>
                ) : error ? (
                  <div className="text-center py-12">
                    <p className="text-red-600">{error}</p>
                    <button
                      onClick={fetchUploadedNotes}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : uploadedNotes.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {uploadedNotes.map((note) => (
                      <div key={note._id} className="relative">
                        <NoteCard note={note} />
                        {/* Delete Button Overlay */}
                        <button
                          onClick={() => handleDelete(note._id)}
                          disabled={deletingId === note._id}
                          className="absolute top-4 right-4 p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-lg disabled:bg-gray-400 disabled:cursor-not-allowed"
                          title="Delete note"
                        >
                          {deletingId === note._id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <FileText className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      No notes uploaded yet
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Start sharing your knowledge with the community!
                    </p>
                    <button
                      onClick={() => router.push("/upload")}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Upload Your First Note
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Saved Notes Tab */}
            {activeTab === "saved" && (
              <div>
                {savedLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
                  </div>
                ) : savedError ? (
                  <div className="text-center py-12">
                    <p className="text-red-600">{savedError}</p>
                    <button
                      onClick={fetchSavedNotes}
                      className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : savedNotes.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {savedNotes.map((note) => (
                      <NoteCard key={note._id} note={note} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Bookmark className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                      No saved notes yet
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Browse notes and bookmark your favorites
                    </p>
                    <button
                      onClick={() => router.push("/browse")}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                    >
                      Browse Notes
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
