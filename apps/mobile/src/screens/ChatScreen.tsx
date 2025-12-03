import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { apiClient } from '../lib/api';

interface ChatScreenProps {
  user: any;
  onLogout: () => void;
}

export default function ChatScreen({ user, onLogout }: ChatScreenProps) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [activeConv, setActiveConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  async function loadConversations() {
    setLoading(true);
    try {
      const res = await apiClient.getConversations();
      if (res.success && res.data) {
        setConversations(res.data);
      }
    } catch (err) {
      console.error('Load conversations error', err);
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(convId: string) {
    try {
      const res = await apiClient.getMessages(convId);
      if (res.success && res.data) {
        setMessages(res.data.reverse());
      }
    } catch (err) {
      console.error('Load messages error', err);
    }
  }

  function handleSelectConv(conv: any) {
    setActiveConv(conv);
    loadMessages(conv.id);
  }

  function handleSendMessage() {
    if (!messageText.trim()) return;
    // TODO: envoyer via WebSocket + chiffrement
    setMessageText('');
  }

  if (!activeConv) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          <TouchableOpacity onPress={onLogout}>
            <Text style={styles.logoutText}>Déconnexion</Text>
          </TouchableOpacity>
        </View>
        {loading ? (
          <View style={styles.empty}>
            <Text>Chargement...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Aucune conversation</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.convItem}
                onPress={() => handleSelectConv(item)}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>
                    {item.name?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
                <View style={styles.convInfo}>
                  <Text style={styles.convName}>{item.name || 'Conversation'}</Text>
                  <Text style={styles.convPreview} numberOfLines={1}>
                    Dernier message...
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setActiveConv(null)}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{activeConv.name || 'Chat'}</Text>
        <View style={{ width: 60 }} />
      </View>

      <FlatList
        style={styles.messagesList}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const isMine = item.senderId === user.id;
          return (
            <View
              style={[
                styles.messageBubble,
                isMine ? styles.messageMine : styles.messageTheirs,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  isMine ? styles.messageTextMine : styles.messageTextTheirs,
                ]}
              >
                {item.decryptedText || '[Chiffré]'}
              </Text>
            </View>
          );
        }}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.composerInput}
          placeholder="Message..."
          value={messageText}
          onChangeText={setMessageText}
          multiline
        />
        <TouchableOpacity
          style={styles.sendButton}
          onPress={handleSendMessage}
          disabled={!messageText.trim()}
        >
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: 'white',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  logoutText: {
    color: '#4f46e5',
    fontSize: 14,
  },
  backText: {
    color: '#4f46e5',
    fontSize: 16,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
  convItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600',
  },
  convInfo: {
    flex: 1,
  },
  convName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  convPreview: {
    fontSize: 14,
    color: '#6b7280',
  },
  messagesList: {
    flex: 1,
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  messageMine: {
    backgroundColor: '#4f46e5',
    alignSelf: 'flex-end',
  },
  messageTheirs: {
    backgroundColor: 'white',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
  },
  messageTextMine: {
    color: 'white',
  },
  messageTextTheirs: {
    color: '#111827',
  },
  composer: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  composerInput: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 16,
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontSize: 18,
  },
});
