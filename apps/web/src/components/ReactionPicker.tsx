'use client';

import { useState } from 'react';

interface ReactionPickerProps {
  messageId: string;
  onReactionSelect: (emoji: string) => void;
}

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '😡', '🎉', '🔥'];

export default function ReactionPicker({
  messageId,
  onReactionSelect,
}: ReactionPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = (emoji: string) => {
    onReactionSelect(emoji);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-1 hover:bg-gray-100 rounded transition"
        title="Réagir"
      >
        <svg
          className="w-5 h-5 text-gray-500"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-2 flex gap-1 z-10">
          {EMOJI_LIST.map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleSelect(emoji)}
              className="text-2xl hover:scale-125 transition-transform p-1"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ReactionDisplayProps {
  reactions: { emoji: string; userId: string; count: number }[];
  currentUserId: string;
  onToggle: (emoji: string) => void;
}

export function ReactionDisplay({
  reactions,
  currentUserId,
  onToggle,
}: ReactionDisplayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((reaction) => {
        const hasReacted = false; // TODO: vérifier si currentUserId a réagi

        return (
          <button
            key={reaction.emoji}
            onClick={() => onToggle(reaction.emoji)}
            className={`flex items-center gap-1 px-2 py-1 rounded-full text-sm transition ${
              hasReacted
                ? 'bg-blue-100 border border-blue-300'
                : 'bg-gray-100 border border-gray-200 hover:bg-gray-200'
            }`}
          >
            <span>{reaction.emoji}</span>
            {reaction.count > 1 && (
              <span className="text-xs text-gray-600">{reaction.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
