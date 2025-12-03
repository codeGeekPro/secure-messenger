const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Client HTTP pour API REST
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const token = localStorage.getItem('accessToken');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as any),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data.message || 'Une erreur est survenue',
        };
      }

      return data;
    } catch (error) {
      console.error('API request error:', error);
      return {
        success: false,
        error: 'Erreur de connexion au serveur',
      };
    }
  }

  // Auth endpoints
  async signup(phone: string, displayName: string) {
    return this.request<{ message: string }>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ phone, displayName }),
    });
  }

  async verifyOtp(phone: string, code: string) {
    return this.request<{
      user: any;
      accessToken: string;
      refreshToken: string;
    }>('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  }

  async refreshToken(refreshToken: string) {
    return this.request<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
  }

  // Keys endpoints
  async registerDevice(deviceName: string, platform: string) {
    return this.request<{ deviceId: string; bundle: any }>('/keys/devices', {
      method: 'POST',
      body: JSON.stringify({ deviceName, platform }),
    });
  }

  async getKeyBundle(deviceId: string) {
    return this.request<any>(`/keys/devices/${deviceId}/bundle`);
  }

  // Media endpoints
  async mediaInit(payload: {
    conversationId: string;
    filename: string;
    mimeType: string;
    size: number;
    chunkSize: number;
  }) {
    return this.request<{
      mediaId: string;
      fileKey: string;
      chunkSize: number;
    }>(`/media/init`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async mediaUpload(payload: {
    mediaId: string;
    chunkIndex: number;
    ciphertextBase64: string;
    nonceBase64: string;
  }) {
    return this.request(`/media/upload`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async mediaComplete(payload: { mediaId: string; chunkCount: number }) {
    return this.request(`/media/complete`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async mediaDownload(mediaId: string, chunkIndex: number) {
    return this.request(`/media/download/${mediaId}/${chunkIndex}`);
  }

  // Messages endpoints
  async createConversation(
    type: 'direct' | 'group',
    participantIds: string[],
    name?: string
  ) {
    return this.request<any>('/messages/conversations', {
      method: 'POST',
      body: JSON.stringify({ type, participantIds, name }),
    });
  }

  async getConversations() {
    return this.request<any[]>('/messages/conversations');
  }

  async getMessages(conversationId: string, limit = 50, beforeId?: string) {
    const params = new URLSearchParams({
      limit: limit.toString(),
      ...(beforeId && { beforeId }),
    });
    return this.request<any[]>(
      `/messages/conversations/${conversationId}/messages?${params}`
    );
  }

  async deleteMessage(messageId: string) {
    return this.request(`/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  async getConversationParticipants(conversationId: string) {
    return this.request<any[]>(
      `/messages/conversations/${conversationId}/participants`
    );
  }
}

export const apiClient = new ApiClient(API_URL);
