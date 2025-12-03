const API_URL = 'http://localhost:3001/api/v1'; // Remplacer par l'URL du serveur

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setToken(token: string) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as any),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
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

  async getConversations() {
    return this.request<any[]>('/messages/conversations');
  }

  async getMessages(conversationId: string, limit = 50) {
    return this.request<any[]>(
      `/messages/conversations/${conversationId}/messages?limit=${limit}`
    );
  }
}

export const apiClient = new ApiClient(API_URL);
