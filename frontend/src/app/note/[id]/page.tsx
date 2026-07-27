"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Note } from "@/types";
import { useAuth } from "@/context/AuthContext";
import TutorChat from "@/components/TutorChat";
import Flashcards from "@/components/Flashcards";
import PDFViewer from "@/components/pdf/PDFViewer";
import {
  FileText,
  Download,
  Star,
  Calendar,
  User,
  CheckCircle,
  Loader2,
  Bot,
  Trophy,
  MessageSquare,
  AlertCircle,
} from "lucide-react";

export default function NotePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const noteId = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rating state
  const [userRating, setUserRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  // Quiz state
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});
  const [score, setScore] = useState(0);

  // Review state
  const [reviewText, setReviewText] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  useEffect(() => {
    fetchNote();
  }, [noteId]);

  const fetchNote = async () => {
    try {
      setLoading(true);
      const response = await api.get<Note>(`/api/notes/${noteId}`);
      setNote(response.data);
      
      // Check if user has already rated
      if (user && response.data.ratings) {
        const existingRating = response.data.ratings.find(
          (r) => r.userId === user._id
        );
        if (existingRating) {
          setUserRating(existingRating.stars);
        }
      }
    } catch (err: unknown) {
      console.error("Error fetching note:", err);
      if (err && typeof err === "object" && "response" in err) {
        const axiosError = err as { response?: { status?: number } };
        if (axiosError.response?.status === 404) {
          setError("Note not found");
        } else {
          setError("Failed to load note");
        }
      } else {
        setError("Failed to load note");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!note) return;

    try {
      window.open(`${process.env.NEXT_PUBLIC_API_URL}/api/notes/${noteId}/download`, "_blank");
    } catch (err) {
      console.error("Error downloading file:", err);
    }
  };

  const handleRating = async (stars: number) => {
    if (!user) {
      router.push("/login");
      return;
    }

    try {
      setSubmittingRating(true);
      const response = await api.post(`/api/notes/${noteId}/rate`, { stars });
      
      setUserRating(stars);
      
      // Update note with new average rating
      if (response.data.averageRating !== undefined) {
        setNote((prev) =>
          prev ? { ...prev, averageRating: response.data.averageRating } : prev
        );
      }
    } catch (err) {
      console.error("Error submitting rating:", err);
    } finally {
      setSubmittingRating(false);
    }
  };

  const checkAnswer = (questionIndex: number) => {
    if (!note) return;

    const question = note.quizQuestions[questionIndex];
    const userAnswer = selectedAnswers[questionIndex];

    if (userAnswer === question.answer) {
      setScore((prev) => prev + 1);
    }

    setRevealedAnswers((prev) => ({ ...prev, [questionIndex]: true }));
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      router.push("/login");
      return;
    }

    if (!reviewText.trim()) return;

    try {
      setSubmittingReview(true);
      const response = await api.post(`/api/notes/${noteId}/review`, {
        text: reviewText,
      });

      // Add new review to the list
      if (response.data && note) {
        const newReview = {
          ...response.data,
          userId: { _id: user._id, name: user.name },
        };
        setNote((prev) =>
          prev ? { ...prev, reviews: [...prev.reviews, newReview] } : prev
        );
        setReviewText("");
      }
    } catch (err: unknown) {
      console.error("Error submitting review:", err);
      if (err && typeof err === "object" && "response" in err) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        alert(axiosError.response?.data?.message || "Failed to submit review");
      } else {
        alert("Failed to submit review");
      }
    } finally {
      setSubmittingReview(false);
    }
  };

  const renderStars = (rating: number, interactive = false) => {
    const stars = [];
    const displayRating = interactive && hoverRating > 0 ? hoverRating : rating;

    for (let i = 1; i <= 5; i++) {
      const filled = i <= displayRating;
      stars.push(
        <button
          key={i}
          type="button"
          disabled={!interactive || submittingRating}
          onClick={() => interactive && handleRating(i)}
          onMouseEnter={() => interactive && setHoverRating(i)}
          onMouseLeave={() => interactive && setHoverRating(0)}
          className={`${
            interactive ? "cursor-pointer hover:scale-110" : "cursor-default"
          } transition-transform`}
        >
          <Star
            className={`h-6 w-6 ${
              filled
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300"
            }`}
          />
        </button>
      );
    }
    return stars;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="animate-pulse space-y-6">
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {error || "Note not found"}
            </h2>
            <p className="text-gray-600 mb-6">
              The note you're looking for doesn't exist or has been removed.
            </p>
            <button
              onClick={() => router.push("/browse")}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Browse Notes
            </button>
          </div>
        </div>
      </div>
    );
  }

  const uploaderName =
    typeof note.uploadedBy === "object" && note.uploadedBy
      ? note.uploadedBy.name
      : "Unknown";

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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {/* Header Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">{note.title}</h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase border ${getFileTypeBadgeColor(
                note.fileType
              )}`}
            >
              {note.fileType}
            </span>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
              {note.subject}
            </span>
            <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              Semester {note.semester}
            </span>
            <span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-medium">
              {note.topic}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm text-gray-600 mb-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span>{uploaderName}</span>
              </div>
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(note.createdAt)}</span>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {note.aiProcessed ? (
                <>
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-green-600 font-medium">AI Processed</span>
                </>
              ) : (
                <>
                  <Loader2 className="h-5 w-5 text-amber-500 animate-spin" />
                  <span className="text-amber-600 font-medium">Processing...</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <button
              onClick={handleDownload}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Download className="h-5 w-5" />
              <span>Download ({note.downloadCount})</span>
            </button>

            <div className="flex flex-col items-center space-y-2">
              <div className="flex items-center space-x-1">
                {renderStars(userRating || note.averageRating, !!user)}
              </div>
              <span className="text-sm text-gray-600">
                {user
                  ? userRating > 0
                    ? `You rated ${userRating} stars`
                    : "Click to rate"
                  : "Login to rate"}{" "}
                • {note.averageRating > 0 ? note.averageRating.toFixed(1) : "No ratings"}
              </span>
            </div>
          </div>
        </div>

        {/* PDF Viewer Section */}
        {note.fileType === "pdf" && (
          <PDFViewer fileUrl={note.fileUrl} fileName={note.originalName} noteId={note._id} />
        )}

        {/* Non-PDF File Preview */}
        {note.fileType !== "pdf" && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <FileText className="h-16 w-16 text-gray-400" />
              <div className="text-center">
                <p className="text-gray-700 font-medium mb-2">Preview not available for this file type</p>
                <p className="text-sm text-gray-600">{note.fileType.toUpperCase()} files cannot be previewed in browser</p>
              </div>
              <a
                href={`${process.env.NEXT_PUBLIC_API_URL}/api/notes/${note._id}/download`}
                download={note.originalName}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center space-x-2"
              >
                <Download className="h-4 w-4" />
                <span>Download File</span>
              </a>
            </div>
          </div>
        )}

        {/* Summary Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="flex items-center space-x-2 mb-4">
            <Bot className="h-6 w-6 text-blue-600" />
            <h2 className="text-2xl font-bold text-gray-900">AI Summary</h2>
          </div>
          <p className="text-gray-700 leading-relaxed mb-6">
            {note.summary || "No summary available yet."}
          </p>

          {note.keywords && note.keywords.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {note.keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <TutorChat note={{ _id: note._id, title: note.title }} />

        {/* Quiz Section */}
        {note.quizQuestions && note.quizQuestions.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-2">
                <Trophy className="h-6 w-6 text-yellow-600" />
                <h2 className="text-2xl font-bold text-gray-900">Practice Quiz</h2>
              </div>
              <div className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg font-semibold">
                Score: {score}/{note.quizQuestions.length}
              </div>
            </div>

            <div className="space-y-6">
              {note.quizQuestions.map((question, qIndex) => (
                <div
                  key={qIndex}
                  className="border border-gray-200 rounded-lg p-6 bg-gray-50"
                >
                  <h3 className="font-semibold text-gray-900 mb-4">
                    {qIndex + 1}. {question.question}
                  </h3>

                  <div className="space-y-2 mb-4">
                    {question.options.map((option, oIndex) => {
                      const isSelected = selectedAnswers[qIndex] === option;
                      const isCorrect = option === question.answer;
                      const isRevealed = revealedAnswers[qIndex];

                      return (
                        <label
                          key={oIndex}
                          className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            isRevealed && isCorrect
                              ? "bg-green-100 border-green-500"
                              : isRevealed && isSelected && !isCorrect
                              ? "bg-red-100 border-red-500"
                              : isSelected
                              ? "bg-blue-50 border-blue-500"
                              : "bg-white border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`question-${qIndex}`}
                            value={option}
                            checked={isSelected}
                            disabled={revealedAnswers[qIndex]}
                            onChange={(e) =>
                              setSelectedAnswers((prev) => ({
                                ...prev,
                                [qIndex]: e.target.value,
                              }))
                            }
                            className="h-4 w-4 text-blue-600"
                          />
                          <span
                            className={`flex-1 ${
                              isRevealed && isCorrect
                                ? "font-semibold text-green-800"
                                : ""
                            }`}
                          >
                            {option}
                            {isRevealed && isCorrect && (
                              <span className="ml-2 text-green-600">✓ Correct</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {!revealedAnswers[qIndex] && (
                    <button
                      onClick={() => checkAnswer(qIndex)}
                      disabled={!selectedAnswers[qIndex]}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                    >
                      Check Answer
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <Flashcards noteId={note._id} />

        {/* Reviews Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="flex items-center space-x-2 mb-6">
            <MessageSquare className="h-6 w-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-900">
              Reviews ({note.reviews.length})
            </h2>
          </div>

          {/* Add Review Form */}
          {user && (
            <form onSubmit={handleReviewSubmit} className="mb-6">
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Share your thoughts about this note..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={4}
                maxLength={500}
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-sm text-gray-500">
                  {reviewText.length}/500 characters
                </span>
                <button
                  type="submit"
                  disabled={!reviewText.trim() || submittingReview}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {submittingReview ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <span>Submit Review</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {!user && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-blue-800">
                <button
                  onClick={() => router.push("/login")}
                  className="font-semibold underline hover:text-blue-900"
                >
                  Login
                </button>{" "}
                to add a review
              </p>
            </div>
          )}

          {/* Reviews List */}
          <div className="space-y-4">
            {note.reviews.length > 0 ? (
              note.reviews
                .sort(
                  (a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                )
                .map((review) => {
                  const reviewerName =
                    typeof review.userId === "object" && review.userId
                      ? review.userId.name
                      : "Anonymous";

                  return (
                    <div
                      key={review._id}
                      className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <User className="h-5 w-5 text-gray-600" />
                          <span className="font-semibold text-gray-900">
                            {reviewerName}
                          </span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {formatDate(review.createdAt)}
                        </span>
                      </div>
                      <p className="text-gray-700">{review.text}</p>
                    </div>
                  );
                })
            ) : (
              <p className="text-center text-gray-500 py-8">
                No reviews yet. Be the first to review this note!
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
