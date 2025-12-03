import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  ciphertext: string;
  nonce: string;
  ratchetPublicKey: string;
  messageNumber: number;
  createdAt: string;
  decryptedText?: string;
  type?: 'text' | 'media' | 'file' | 'call' | 'system';
  mediaKeys?: {
    mediaId: string;
    filename: string;
    mimeType: string;
    chunkCount: number;
    fileKey?: string; // base64 (éphemeral)
  };
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name?: string;
  avatarUrl?: string;
  participants: any[];
  lastMessage?: Message;
  unreadCount: number;
}

interface MessagesState {
  socket: Socket | null;
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, string[]>;
  
  initSocket: (token: string, deviceId: string) => void;
  disconnectSocket: () => void;
  sendMessage: (conversationId: string, encryptedData: any) => void;
  addMessage: (message: Message) => void;
  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (id: string) => void;
  startTyping: (conversationId: string) => void;
  stopTyping: (conversationId: string) => void;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';

export const useMessagesStore = create<MessagesState>((set, get) => ({
  socket: null,
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},

  initSocket: (token: string, deviceId: string) => {
    const socket = io(`${WS_URL}/messages`, {
      auth: { token },
      query: { deviceId },
    });

    socket.on('connect', () => {
      console.log('WebSocket connected');
    });

    socket.on('message:new', (message: Message) => {
      get().addMessage(message);
    });

    socket.on('typing:start', ({ conversationId, userId }) => {
      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: [
            ...(state.typingUsers[conversationId] || []),
            userId,
          ],
        },
      }));
    });

    socket.on('typing:stop', ({ conversationId, userId }) => {
      set((state) => ({
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: (state.typingUsers[conversationId] || []).filter(
            (id) => id !== userId
          ),
        },
      }));
    });

    socket.on('message:receipt', ({ messageId, userId, status }) => {
      // Mettre à jour statut message
      console.log(`Message ${messageId} ${status} by ${userId}`);
    });

    set({ socket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({ socket: null });
    }
  },

  sendMessage: (conversationId, encryptedData) => {
    const { socket } = get();
    if (socket) {
      socket.emit('message:send', {
        conversationId,
        ...encryptedData,
      });
    }
  },

  addMessage: (message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [message.conversationId]: [
          ...(state.messages[message.conversationId] || []),
          message,
        ],
      },
    }));
  },

  setConversations: (conversations) => {
    set({ conversations });
  },

  setActiveConversation: (id) => {
    set({ activeConversationId: id });
  },

  startTyping: (conversationId) => {
    const { socket } = get();
    if (socket) {
      socket.emit('typing:start', { conversationId });
    }
  },

  stopTyping: (conversationId) => {
    const { socket } = get();
    if (socket) {
      socket.emit('typing:stop', { conversationId });
    }
  },
}));
