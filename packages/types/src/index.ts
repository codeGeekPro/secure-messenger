import { z } from 'zod';

// User types
export const UserSchema = z.object({
  id: z.string().uuid(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  username: z.string().min(3).max(50).optional(),
  displayName: z.string().min(1).max(100),
  avatarUrl: z.string().url().optional(),
  statusText: z.string().max(200).optional(),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastSeenAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

// Auth DTOs
export const SignupDtoSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
  email: z.string().email().optional(),
  displayName: z.string().min(1).max(100),
}).refine(data => data.phone || data.email, {
  message: 'Either phone or email must be provided',
});

export type SignupDto = z.infer<typeof SignupDtoSchema>;

export const VerifyOtpDtoSchema = z.object({
  phone: z.string().optional(),
  email: z.string().email().optional(),
  code: z.string().length(6),
}).refine(data => data.phone || data.email, {
  message: 'Either phone or email must be provided',
});

export type VerifyOtpDto = z.infer<typeof VerifyOtpDtoSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: UserSchema,
});

export type LoginResponse = z.infer<typeof LoginResponseSchema>;

// Message types
export const MessageSchema = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  senderDeviceId: z.string().uuid(),
  ciphertext: z.instanceof(Uint8Array),
  type: z.enum(['text', 'media', 'file', 'call', 'system']),
  replyToId: z.string().uuid().optional(),
  mediaKeys: z.any().optional(),
  createdAt: z.date(),
  editedAt: z.date().optional(),
  deletedAt: z.date().optional(),
  expiresAt: z.date().optional(),
});

export type Message = z.infer<typeof MessageSchema>;

// Conversation types
export const ConversationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['direct', 'group']),
  name: z.string().max(100).optional(),
  avatarUrl: z.string().url().optional(),
  description: z.string().optional(),
  createdBy: z.string().uuid(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastMessageAt: z.date(),
});

export type Conversation = z.infer<typeof ConversationSchema>;

// API Response wrapper
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    timestamp: z.date(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: Date;
};
