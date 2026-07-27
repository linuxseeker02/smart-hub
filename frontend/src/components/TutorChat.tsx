"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { BotMessageSquare, ChevronDown, Send } from "lucide-react";
import api from "@/lib/api";

interface TutorChatProps {
  note: { _id: string; title: string };
}

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export default function TutorChat({ note }: TutorChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageTimes, setMessageTimes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const welcomeMessage = `Hi! I am your AI tutor for '${note.title}'. Ask me anything about this topic!`;

  const getTimestamp = () =>
    new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

  const addMessage = (message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    setMessageTimes((prev) => [...prev, getTimestamp()]);
  };

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      addMessage({
        role: "assistant",
        content: welcomeMessage,
      });
    }
  }, [isOpen, messages.length, welcomeMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();

    const trimmedInput = input.trim();
    if (!trimmedInput || loading) {
      return;
    }

    const previousMessages = messages;
    addMessage({ role: "user", content: trimmedInput });
    setInput("");
    setLoading(true);

    try {
      const history = previousMessages
        .filter(
          (msg) => !(msg.role === "assistant" && msg.content === welcomeMessage)
        )
        .slice(-10);

      const response = await api.post<{ reply: string }>("/api/tutor/chat", {
        noteId: note._id,
        message: trimmedInput,
        history,
      });

      addMessage({
        role: "assistant",
        content: response.data.reply || "I could not generate a response right now.",
      });
    } catch (error) {
      console.error("Tutor chat error:", error);
      addMessage({
        role: "assistant",
        content: "Sorry, I am having trouble connecting. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend(event);
    }
  };

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="inline-flex items-center space-x-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        {isOpen ? <ChevronDown className="h-5 w-5" /> : <BotMessageSquare className="h-5 w-5" />}
        <span>{isOpen ? "Close Tutor" : "Ask AI Tutor"}</span>
      </button>

      {isOpen && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex items-center space-x-2">
              <BotMessageSquare className="h-5 w-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">AI Tutor</h3>
            </div>
            <p className="text-sm text-gray-600 mt-1">{note.title}</p>
          </div>

          <div className="max-h-[400px] overflow-y-auto px-5 py-4 space-y-3 bg-gray-50">
            {messages.map((msg, index) => (
              <div
                key={`${msg.role}-${index}`}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                  <div
                    className={`rounded-lg px-4 py-3 text-sm ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-gray-500 mt-1">{messageTimes[index]}</span>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 rounded-lg px-4 py-3 flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400 animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSend} className="border-t border-gray-200 p-4 bg-white">
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleKeyDown}
                rows={2}
                placeholder="Ask a question about this note..."
                className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="inline-flex items-center justify-center h-[46px] w-[46px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
