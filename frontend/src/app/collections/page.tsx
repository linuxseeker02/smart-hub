"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Collection } from "@/types";
import { BookOpen, FolderPlus, Loader2, Lock, Globe, Trash2, Eye, X } from "lucide-react";

const PRESET_COLORS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function CollectionsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isPublic, setIsPublic] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
      return;
    }

    if (user) {
      void fetchCollections();
    }
  }, [authLoading, user, router]);

  const fetchCollections = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get<{ collections: Collection[]; total: number }>("/api/collections");
      setCollections(response.data.collections);
    } catch (err) {
      console.error("Fetch collections error:", err);
      setError("Failed to load collections");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setColor(PRESET_COLORS[0]);
    setIsPublic(false);
  };

  const handleCreateCollection = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    try {
      setSaving(true);
      await api.post("/api/collections", {
        name: name.trim(),
        description: description.trim(),
        color,
        isPublic,
      });
      setShowCreateModal(false);
      resetForm();
      await fetchCollections();
    } catch (err) {
      console.error("Create collection error:", err);
      setError("Failed to create collection");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCollection = async (collectionId: string) => {
    if (!confirm("Delete this collection?")) {
      return;
    }

    try {
      await api.delete(`/api/collections/${collectionId}`);
      setCollections((prev) => prev.filter((collection) => collection._id !== collectionId));
      if (selectedCollection?._id === collectionId) {
        setSelectedCollection(null);
      }
    } catch (err) {
      console.error("Delete collection error:", err);
      setError("Failed to delete collection");
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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Collections</h1>
            <p className="text-gray-600 mt-1">Organize your favorite notes.</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
          >
            <FolderPlus className="h-5 w-5" />
            <span>Create Collection</span>
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 text-blue-600 animate-spin" />
          </div>
        ) : collections.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {collections.map((collection) => (
              <div key={collection._id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="h-2 rounded-full mb-4" style={{ backgroundColor: collection.color }} />
                <div className="flex items-start justify-between mb-3">
                  <h2 className="text-xl font-semibold text-gray-900 line-clamp-1">{collection.name}</h2>
                  <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700">
                    {collection.notes.length} notes
                  </span>
                </div>
                <p className="text-sm text-gray-600 min-h-[40px] mb-4">
                  {collection.description || "No description"}
                </p>
                <div className="mb-5">
                  <span
                    className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${
                      collection.isPublic
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {collection.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    <span>{collection.isPublic ? "Public" : "Private"}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedCollection(collection)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium flex items-center justify-center space-x-1"
                  >
                    <Eye className="h-4 w-4" />
                    <span>View</span>
                  </button>
                  <button
                    onClick={() => handleDeleteCollection(collection._id)}
                    className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
            <BookOpen className="h-14 w-14 mx-auto text-gray-400 mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">No collections yet</h3>
            <p className="text-gray-600 mb-6">Create your first collection to organize notes.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Create Collection
            </button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-xl font-semibold text-gray-900">Create Collection</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateCollection} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., Web Security Revision"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
                <div className="flex items-center gap-2">
                  {PRESET_COLORS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setColor(preset)}
                      className={`h-8 w-8 rounded-full border-2 ${color === preset ? "border-gray-800" : "border-transparent"}`}
                      style={{ backgroundColor: preset }}
                    />
                  ))}
                </div>
              </div>
              <label className="inline-flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(event) => setIsPublic(event.target.checked)}
                  className="h-4 w-4 text-blue-600 rounded"
                />
                <span className="text-sm text-gray-700">Make collection public</span>
              </label>
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={saving || !name.trim()}
                  className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  <span>Create</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedCollection && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-2xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">{selectedCollection.name}</h3>
                <p className="text-sm text-gray-600">{selectedCollection.description || "No description"}</p>
              </div>
              <button onClick={() => setSelectedCollection(null)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {selectedCollection.notes.length > 0 ? (
                <div className="space-y-3">
                  {selectedCollection.notes.map((note) => (
                    <div key={note._id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{note.title}</p>
                        <p className="text-sm text-gray-600">{note.subject} • {note.fileType.toUpperCase()}</p>
                      </div>
                      <Link
                        href={`/note/${note._id}`}
                        className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium"
                      >
                        Open
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-gray-500 py-10">No notes in this collection yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
