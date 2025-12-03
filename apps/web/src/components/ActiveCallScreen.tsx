'use client';

import { useEffect, useRef, useState } from 'react';
import { WebRTCClient } from '@/lib/webrtc';

interface ActiveCallScreenProps {
  callId: string;
  conversationId: string;
  webrtcClient: WebRTCClient;
  onEndCall: () => void;
}

export default function ActiveCallScreen({
  callId,
  conversationId,
  webrtcClient,
  onEndCall,
}: ActiveCallScreenProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const screenShareRef = useRef<HTMLVideoElement>(null);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    // Timer durée appel
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);

    // Gérer flux vidéo distant
    webrtcClient.onRemoteStream((id, stream) => {
      if (id === callId && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream;
      }
    });

    // Gérer partage d'écran distant
    webrtcClient.onScreenShare((id, stream) => {
      if (id === callId) {
        setRemoteScreenStream(stream);
        if (stream && screenShareRef.current) {
          screenShareRef.current.srcObject = stream;
        }
      }
    });

    return () => {
      clearInterval(timer);
    };
  }, [callId, webrtcClient]);

  const handleToggleMute = () => {
    // TODO: Implémenter mute/unmute audio
    setIsMuted(!isMuted);
  };

  const handleToggleVideo = () => {
    // TODO: Implémenter disable/enable video
    setIsVideoOff(!isVideoOff);
  };

  const handleToggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        await webrtcClient.stopScreenShare(callId);
        setIsScreenSharing(false);
      } else {
        await webrtcClient.startScreenShare(callId);
        setIsScreenSharing(true);
      }
    } catch (err) {
      console.error('[ActiveCallScreen] Screen share error:', err);
      alert('Impossible de partager l\'écran');
    }
  };

  const handleEndCall = () => {
    webrtcClient.endCall(callId);
    onEndCall();
  };

  const formatDuration = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header avec durée */}
      <div className="bg-gray-800 p-4 flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-semibold">Appel en cours</h2>
          <p className="text-gray-400 text-sm">{formatDuration(callDuration)}</p>
        </div>
      </div>

      {/* Grille vidéos */}
      <div className="flex-1 relative">
        {/* Vidéo distante (principale) */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />

        {/* Partage d'écran distant (overlay) */}
        {remoteScreenStream && (
          <div className="absolute inset-0 bg-black">
            <video
              ref={screenShareRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
          </div>
        )}

        {/* Vidéo locale (mini) */}
        <div className="absolute top-4 right-4 w-48 h-36 bg-gray-700 rounded-lg overflow-hidden shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      {/* Contrôles */}
      <div className="bg-gray-800 p-6 flex items-center justify-center gap-4">
        {/* Mute/Unmute */}
        <button
          onClick={handleToggleMute}
          className={`p-4 rounded-full ${
            isMuted ? 'bg-red-600' : 'bg-gray-700'
          } hover:bg-gray-600 transition`}
        >
          {isMuted ? (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )}
        </button>

        {/* Video on/off */}
        <button
          onClick={handleToggleVideo}
          className={`p-4 rounded-full ${
            isVideoOff ? 'bg-red-600' : 'bg-gray-700'
          } hover:bg-gray-600 transition`}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Partage d'écran */}
        <button
          onClick={handleToggleScreenShare}
          className={`p-4 rounded-full ${
            isScreenSharing ? 'bg-blue-600' : 'bg-gray-700'
          } hover:bg-gray-600 transition`}
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </button>

        {/* Raccrocher */}
        <button
          onClick={handleEndCall}
          className="p-4 rounded-full bg-red-600 hover:bg-red-700 transition"
        >
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
