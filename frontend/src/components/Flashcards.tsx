"use client";

import { useMemo, useState } from "react";
import { Loader2, RefreshCw, Shuffle } from "lucide-react";
import api from "@/lib/api";

interface FlashcardsProps {
  noteId: string;
}

interface FlashcardItem {
  id: number;
  front: string;
  back: string;
}

export default function Flashcards({ noteId }: FlashcardsProps) {
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [knownIds, setKnownIds] = useState<number[]>([]);

  const currentCard = flashcards[currentIndex];
  const knownCount = knownIds.length;
  const knownPercentage = flashcards.length
    ? Math.round((knownCount / flashcards.length) * 100)
    : 0;

  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < flashcards.length - 1;

  const hasCards = flashcards.length > 0;

  const generateFlashcards = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await api.get<{ flashcards: Array<{ front: string; back: string }> }>(
        `/api/notes/${noteId}/flashcards`
      );

      const normalized = response.data.flashcards.map((card, index) => ({
        id: index + 1,
        front: card.front,
        back: card.back,
      }));

      setFlashcards(normalized);
      setCurrentIndex(0);
      setFlipped(false);
      setKnownIds([]);
    } catch (err) {
      console.error("Generate flashcards error:", err);
      setError("Failed to generate flashcards. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const shuffleCards = () => {
    const shuffled = [...flashcards].sort(() => Math.random() - 0.5);
    setFlashcards(shuffled);
    setCurrentIndex(0);
    setFlipped(false);
  };

  const markKnown = (isKnown: boolean) => {
    if (!currentCard) {
      return;
    }

    setKnownIds((prev) => {
      const exists = prev.includes(currentCard.id);
      if (isKnown && !exists) {
        return [...prev, currentCard.id];
      }
      if (!isKnown && exists) {
        return prev.filter((id) => id !== currentCard.id);
      }
      return prev;
    });
  };

  const cardSideLabel = useMemo(() => (flipped ? "BACK" : "FRONT"), [flipped]);

  if (!hasCards) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-2xl font-bold text-gray-900">Flashcards</h3>
            <p className="text-gray-600 mt-1">Practice key concepts from this note.</p>
          </div>
          <button
            onClick={generateFlashcards}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-5 w-5" />
                <span>Generate Flashcards</span>
              </>
            )}
          </button>
        </div>
        {error && <p className="text-red-600 mt-4">{error}</p>}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Flashcards</h3>
          <p className="text-sm text-gray-600">Card {currentIndex + 1} of {flashcards.length}</p>
        </div>
        <button
          onClick={shuffleCards}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center space-x-2"
        >
          <Shuffle className="h-4 w-4" />
          <span>Shuffle</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>{knownCount}/{flashcards.length} Known</span>
          <span>{knownPercentage}%</span>
        </div>
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${knownPercentage}%` }}
          />
        </div>
      </div>

      <div style={{ perspective: "1000px" }}>
        <button
          type="button"
          onClick={() => setFlipped((prev) => !prev)}
          className="w-full h-72 relative rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{ transformStyle: "preserve-3d" }}
        >
          <div
            className="absolute inset-0"
            style={{
              transformStyle: "preserve-3d",
              transition: "transform 0.6s",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            <div
              className="absolute inset-0 rounded-xl border border-gray-200 bg-blue-50 p-8 flex flex-col justify-center"
              style={{ backfaceVisibility: "hidden" }}
            >
              <span className="text-xs font-semibold text-blue-700 tracking-wide mb-3">
                {cardSideLabel}
              </span>
              <p className="text-xl font-semibold text-gray-900 text-center">{currentCard.front}</p>
            </div>
            <div
              className="absolute inset-0 rounded-xl border border-gray-200 bg-gray-100 p-8 flex flex-col justify-center"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <span className="text-xs font-semibold text-gray-600 tracking-wide mb-3">BACK</span>
              <p className="text-lg text-gray-900 text-center">{currentCard.back}</p>
            </div>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => {
            if (canGoPrevious) {
              setCurrentIndex((prev) => prev - 1);
              setFlipped(false);
            }
          }}
          disabled={!canGoPrevious}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => {
            if (canGoNext) {
              setCurrentIndex((prev) => prev + 1);
              setFlipped(false);
            }
          }}
          disabled={!canGoNext}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => markKnown(true)}
          className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
        >
          Known
        </button>
        <button
          onClick={() => markKnown(false)}
          className="flex-1 px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors"
        >
          Still Learning
        </button>
      </div>

      {error && <p className="text-red-600">{error}</p>}
    </div>
  );
}
