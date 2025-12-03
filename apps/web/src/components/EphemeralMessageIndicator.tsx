'use client';

import { useEffect, useState } from 'react';

interface EphemeralMessageIndicatorProps {
  messageId: string;
  expiresAt: Date;
  onExpired?: () => void;
}

export default function EphemeralMessageIndicator({
  messageId,
  expiresAt,
  onExpired,
}: EphemeralMessageIndicatorProps) {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const expires = expiresAt.getTime();
      const remaining = Math.max(0, Math.floor((expires - now) / 1000));

      setTimeRemaining(remaining);

      if (remaining === 0) {
        onExpired?.();
      }
    };

    // Mise à jour immédiate
    updateTimer();

    // Mise à jour toutes les secondes
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const formatTime = (seconds: number): string => {
    if (seconds >= 3600) {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    }
    if (seconds >= 60) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
    return `${seconds}s`;
  };

  const getColorClass = (): string => {
    if (timeRemaining <= 10) return 'text-red-500';
    if (timeRemaining <= 60) return 'text-orange-500';
    return 'text-blue-500';
  };

  if (timeRemaining === 0) return null;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <svg
        className={`w-4 h-4 ${getColorClass()} animate-pulse`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className={`font-mono ${getColorClass()}`}>
        {formatTime(timeRemaining)}
      </span>
    </div>
  );
}
