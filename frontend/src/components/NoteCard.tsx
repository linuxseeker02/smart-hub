"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Collection, Note } from "@/types";
import {
  FileText,
  Download,
  Star,
  Calendar,
  User,
  Loader2,
  Bookmark,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface NoteCardProps {
  note: Note;
}

export default function NoteCard({ note }: NoteCardProps) {
  const { user, setUser } = useAuth();
  const [bookmarked, setBookmarked] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [savingToCollectionId, setSavingToCollectionId] = useState<string | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setBookmarked(Boolean(user?.savedNotes?.includes(note._id)));
  }, [user, note._id]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  const fetchCollections = async () => {
    if (!user) {
      return;
    }

    try {
      setCollectionsLoading(true);
      const response = await api.get<{ collections: Collection[]; total: number }>("/api/collections");
      setCollections(response.data.collections);
    } catch (error) {
      console.error("Failed to fetch collections:", error);
      setCollections([]);
    } finally {
      setCollectionsLoading(false);
    }
  };

  const handleBookmarkToggle = async () => {
    if (!user || bookmarkLoading) {
      return;
    }

    try {
      setBookmarkLoading(true);
      const { data } = await api.post<{ bookmarked: boolean; savedCount: number }>(
        `/api/notes/${note._id}/bookmark`
      );

      setBookmarked(data.bookmarked);
      setUser({
        ...user,
        savedNotes: data.bookmarked
          ? [...new Set([...user.savedNotes, note._id])]
          : user.savedNotes.filter((savedNoteId) => savedNoteId !== note._id),
      });
    } catch (error) {
      console.error("Failed to toggle bookmark:", error);
    } finally {
      setBookmarkLoading(false);
    }
  };

  const handleCollectionSave = async (collectionId: string) => {
    if (!user) {
      return;
    }

    try {
      setSavingToCollectionId(collectionId);
      await api.post(`/api/collections/${collectionId}/notes/${note._id}`);
      showToast("Saved to collection");
      setDropdownOpen(false);
    } catch (error) {
      console.error("Failed to save to collection:", error);
      showToast("Could not save to collection");
    } finally {
      setSavingToCollectionId(null);
    }
  };

  const getFileTypeBadgeColor = (fileType: string) => {
    switch (fileType) {
      case "pdf":
        return "bg-red-100 text-red-700 border-red-200";
      case "docx":
        return "bg-blue-100 text-blue-700 border-blue-200";
      case "ppt":
        return "bg-orange-100 text-orange-700 border-orange-200";
      default:
        return "bg-gray-100 text-gray-700 border-gray-200";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const stars = [];

    for (let i = 0; i < 5; i++) {
      if (i < fullStars) {
        stars.push(
          <Star
            key={i}
            className="h-4 w-4 fill-yellow-400 text-yellow-400"
          />
        );
      } else if (i === fullStars && hasHalfStar) {
        stars.push(
          <Star
            key={i}
            className="h-4 w-4 fill-yellow-400 text-yellow-400 opacity-50"
          />
        );
      } else {
        stars.push(
          <Star key={i} className="h-4 w-4 text-gray-300" />
        );
      }
    }
    return stars;
  };

  const uploaderName =
    typeof note.uploadedBy === "object" && note.uploadedBy
      ? note.uploadedBy.name
      : "Unknown";

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow border border-gray-200 overflow-hidden">
      {note.fileType === "pdf" && (
        <img
          src={`${process.env.NEXT_PUBLIC_API_URL}/api/notes/${note._id}/thumbnail`}
          alt={note.title || note.originalName}
          className="w-full h-32 object-cover rounded-t-lg"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="p-6">
        {/* Header: File type badge + AI processing badge */}
        <div className="flex items-start justify-between mb-3">
          <span
            className={cn(
              "px-3 py-1 rounded-full text-xs font-semibold uppercase border",
              getFileTypeBadgeColor(note.fileType)
            )}
          >
            {note.fileType}
          </span>
          <div className="flex items-center space-x-2">
            {!note.aiProcessed && (
              <span className="flex items-center space-x-1 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>AI Processing...</span>
              </span>
            )}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !dropdownOpen;
                  setDropdownOpen(nextOpen);
                  if (nextOpen && user) {
                    void fetchCollections();
                  }
                }}
                title={!user ? "Login to bookmark" : "Save to collection"}
                className={cn(
                  "p-2 rounded-lg border transition-colors flex items-center gap-1",
                  bookmarked
                    ? "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                <Bookmark className={cn("h-4 w-4", bookmarked && "fill-current")} />
                <ChevronDown className="h-3 w-3" />
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-11 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-2">
                  {!user ? (
                    <p className="text-sm text-gray-600 px-2 py-1">Login to bookmark</p>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleBookmarkToggle}
                        disabled={bookmarkLoading}
                        className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-sm flex items-center justify-between"
                      >
                        <span>{bookmarked ? "Remove bookmark" : "Bookmark note"}</span>
                        {bookmarkLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                      </button>
                      <div className="my-1 border-t border-gray-200" />
                      <p className="text-xs font-semibold text-gray-500 px-3 py-1">Save to Collection</p>
                      {collectionsLoading ? (
                        <div className="px-3 py-2 text-sm text-gray-600 flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading collections...</span>
                        </div>
                      ) : collections.length > 0 ? (
                        <div className="max-h-44 overflow-y-auto">
                          {collections.map((collection) => (
                            <button
                              key={collection._id}
                              type="button"
                              onClick={() => handleCollectionSave(collection._id)}
                              disabled={savingToCollectionId === collection._id}
                              className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-50 text-sm flex items-center justify-between"
                            >
                              <span className="truncate">{collection.name}</span>
                              {savingToCollectionId === collection._id && (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              )}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="px-3 py-2 text-sm text-gray-600">
                          No collections yet. Create one in Collections page.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
          {note.title || note.originalName}
        </h3>

        {/* Summary */}
        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {note.summary || "No summary available yet."}
        </p>

        {/* Keywords */}
        {note.keywords && note.keywords.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {note.keywords.slice(0, 3).map((keyword, index) => (
              <span
                key={index}
                className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
              >
                {keyword}
              </span>
            ))}
            {note.keywords.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs">
                +{note.keywords.length - 3} more
              </span>
            )}
          </div>
        )}

        {/* Subject + Semester */}
        <div className="flex items-center space-x-4 mb-4 text-sm text-gray-600">
          <span className="font-medium">{note.subject}</span>
          <span className="text-gray-400">•</span>
          <span>Semester {note.semester}</span>
        </div>

        {/* Rating + Downloads */}
        <div className="flex items-center space-x-6 mb-4 pb-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <div className="flex">{renderStars(note.averageRating)}</div>
            <span className="text-sm text-gray-600">
              {note.averageRating > 0 ? note.averageRating.toFixed(1) : "No ratings"}
            </span>
          </div>
          <div className="flex items-center space-x-1 text-gray-600">
            <Download className="h-4 w-4" />
            <span className="text-sm">{note.downloadCount}</span>
          </div>
        </div>

        {/* Uploader + Date */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <User className="h-4 w-4" />
            <span>{uploaderName}</span>
          </div>
          <div className="flex items-center space-x-1 text-sm text-gray-500">
            <Calendar className="h-4 w-4" />
            <span>{formatDate(note.createdAt)}</span>
          </div>
        </div>

        {/* View Note Button */}
        <Link
          href={`/note/${note._id}`}
          className="block w-full text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          <div className="flex items-center justify-center space-x-2">
            <FileText className="h-4 w-4" />
            <span>View Note</span>
          </div>
        </Link>

        {toastMessage && (
          <div className="mt-3 px-3 py-2 rounded-md bg-gray-900 text-white text-xs">
            {toastMessage}
          </div>
        )}
      </div>
    </div>
  );
}
