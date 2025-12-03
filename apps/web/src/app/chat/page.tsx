'use client';

import { useState } from 'react';
import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api';
import { initCrypto, initMediaUpload, encryptAndUploadFile, downloadAndDecrypt } from '@/lib/media';
import { encryptFileKeyForDevices } from '@/lib/envelope';
import { useAuthStore } from '@/stores/auth.store';
import { useMessagesStore } from '@/stores/messages.store';

export default function ChatPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const { sendMessage } = useMessagesStore();
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleAttachFile() {
    fileInputRef.current?.click();
  }

  async function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;
    try {
      await initCrypto();
      const init = await initMediaUpload(
        activeConversation.id,
        file.name,
        file.type || 'application/octet-stream',
        file.size
      );
      const chunkCount = Math.ceil(file.size / init.chunkSize);
      await encryptAndUploadFile(
        file,
        init.mediaId,
        init.fileKey,
        init.chunkSize
      );

      // Récupérer participants et leurs devices
      const participantsRes = await apiClient.getConversationParticipants(
        activeConversation.id
      );
      if (!participantsRes.success || !participantsRes.data) {
        throw new Error('Failed to get participants');
      }

      // Extraire tous les devices avec identityKey
      const allDevices: Array<{ id: string; identityKey: string }> = [];
      for (const p of participantsRes.data as any[]) {
        if (p.user?.devices) {
          for (const d of p.user.devices) {
            allDevices.push({ id: d.id, identityKey: d.identityKey });
          }
        }
      }

      // Chiffrer fileKey pour chaque device
      const encryptedFileKeys = await encryptFileKeyForDevices(
        init.fileKey,
        allDevices
      );

      const mediaKeys = {
        mediaId: init.mediaId,
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        chunkCount,
        encryptedFileKeys,
      };

      sendMessage(activeConversation.id, {
        ciphertext: '',
        nonce: '',
        ratchetPublicKey: '',
        messageNumber: 0,
        previousChainLength: 0,
        type: 'media',
        mediaKeys,
      });
    } catch (err) {
      console.error('Upload media error', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  if (!user) {
    router.push('/auth/login');
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900">
      {/* Sidebar - Liste conversations */}
      <aside className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Messages
          </h1>
          <button
            onClick={logout}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            aria-label="Se déconnecter"
          >
            🚪
          </button>
        </div>

        {/* Search */}
        <div className="p-4">
          <input
            type="text"
            placeholder="Rechercher..."
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">
              <p className="mb-2">Aucune conversation</p>
              <button className="text-primary-600 dark:text-primary-400 hover:underline">
                Démarrer une discussion
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setActiveConversation(conv)}
                  className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                    {conv.name?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                        {conv.name || 'Conversation'}
                      </h3>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        12:34
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
                      Dernier message...
                    </p>
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="px-2 py-1 text-xs font-semibold text-white bg-primary-600 rounded-full">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <main className="flex-1 flex flex-col">
        {!activeConversation ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <div className="text-6xl mb-4">💬</div>
              <p className="text-xl font-semibold mb-2">
                Sélectionnez une conversation
              </p>
              <p>ou créez-en une nouvelle pour commencer</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <header className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold">
                  {activeConversation.name?.[0] || '?'}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 dark:text-white">
                    {activeConversation.name || 'Conversation'}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    En ligne
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Appel vocal"
                >
                  📞
                </button>
                <button
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Appel vidéo"
                >
                  📹
                </button>
                <button
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Plus d'options"
                >
                  ⋮
                </button>
              </div>
            </header>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <p>Aucun message pour le moment</p>
                  <p className="text-sm mt-2">
                    🔒 Messages chiffrés de bout en bout
                  </p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.senderId === user.id ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-md px-4 py-2 rounded-2xl ${
                        msg.senderId === user.id
                          ? 'bg-primary-600 text-white'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                      }`}
                    >
                      {msg.type === 'media' && msg.mediaKeys ? (
                        <MediaAttachment attachment={msg.mediaKeys} />
                      ) : (
                        <p>{msg.decryptedText || '[Message chiffré]'}</p>
                      )}
                      <span className="text-xs opacity-70 mt-1 block">
                        12:34
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Composer */}
            <footer className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-end gap-2">
                <button
                  onClick={handleAttachFile}
                  className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  aria-label="Joindre un fichier"
                >
                  📎
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  onChange={onFileSelected}
                  accept="image/*,video/*,audio/*"
                />
                <div className="flex-1">
                  <textarea
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Écrivez un message..."
                    rows={1}
                    className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        // TODO: Send message
                      }
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    // TODO: Send message
                    setMessageText('');
                  }}
                  disabled={!messageText.trim()}
                  className="p-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  aria-label="Envoyer"
                >
                  ➤
                </button>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function MediaAttachment({
  attachment,
}: {
  attachment: {
    mediaId: string;
    filename: string;
    mimeType: string;
    chunkCount: number;
    fileKey?: string;
  };
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleDownload() {
    if (!attachment.fileKey) return;
    setLoading(true);
    try {
      await initCrypto();
      const blob = await downloadAndDecrypt(
        attachment.mediaId,
        attachment.chunkCount,
        attachment.fileKey,
        attachment.mimeType
      );
      const objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    } catch (e) {
      console.error('Decrypt media error', e);
    } finally {
      setLoading(false);
    }
  }

  const isImage = attachment.mimeType.startsWith('image/');
  const isVideo = attachment.mimeType.startsWith('video/');
  const isAudio = attachment.mimeType.startsWith('audio/');

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">{attachment.filename}</div>
      {!attachment.fileKey ? (
        <div className="text-sm opacity-80">Clé de média en attente (E2E)</div>
      ) : !url ? (
        <button
          onClick={handleDownload}
          className="px-3 py-2 bg-white/20 rounded hover:bg.white/30"
          aria-label="Télécharger et déchiffrer"
          disabled={loading}
        >
          {loading ? 'Déchiffrement…' : 'Télécharger'}
        </button>
      ) : isImage ? (
        <img src={url} alt={attachment.filename} className="max-w-xs rounded" />
      ) : isVideo ? (
        <video src={url} controls className="max-w-xs rounded" />
      ) : isAudio ? (
        <audio src={url} controls />
      ) : (
        <a href={url} download={attachment.filename} className="underline">
          Télécharger le fichier
        </a>
      )}
    </div>
  );
}
