import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { randomBytes } from 'crypto';
import { join } from 'path';

interface MediaMeta {
  uploaderUserId: string;
  conversationId: string;
  filename: string;
  mimeType: string;
  size: number;
  chunkSize: number;
  nonces: string[]; // base64 nonces per chunk
  chunks: number; // total chunks (finalized)
  uploaded: boolean[]; // uploaded flags per chunk index
  finalized: boolean;
  createdAt: string;
}

@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}

  private baseDir() {
    return join(process.cwd(), 'apps', 'backend', 'uploads');
  }

  private mediaDir(mediaId: string) {
    return join(this.baseDir(), mediaId);
  }

  private metaPath(mediaId: string) {
    return join(this.mediaDir(mediaId), 'meta.json');
  }

  async initMedia(params: {
    uploaderUserId: string;
    conversationId: string;
    filename: string;
    mimeType: string;
    size: number;
    chunkSize: number;
  }): Promise<{ mediaId: string; fileKey: string; chunkSize: number }>
  {
    const mediaId = crypto.randomUUID();

    const dir = this.mediaDir(mediaId);
    if (!existsSync(this.baseDir())) mkdirSync(this.baseDir(), { recursive: true });
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const meta: MediaMeta = {
      uploaderUserId: params.uploaderUserId,
      conversationId: params.conversationId,
      filename: params.filename,
      mimeType: params.mimeType,
      size: params.size,
      chunkSize: params.chunkSize,
      nonces: [],
      chunks: 0,
      uploaded: [],
      finalized: false,
      createdAt: new Date().toISOString(),
    };

    writeFileSync(this.metaPath(mediaId), JSON.stringify(meta, null, 2));

    // Générer clé éphémère (32 bytes) renvoyée au client uniquement
    const fileKey = randomBytes(32).toString('base64');

    return { mediaId, fileKey, chunkSize: params.chunkSize };
  }

  private readMeta(mediaId: string): MediaMeta {
    const raw = readFileSync(this.metaPath(mediaId), 'utf-8');
    return JSON.parse(raw);
  }

  private writeMeta(mediaId: string, meta: MediaMeta) {
    writeFileSync(this.metaPath(mediaId), JSON.stringify(meta, null, 2));
  }

  async uploadChunk(params: {
    mediaId: string;
    chunkIndex: number;
    ciphertextBase64: string;
    nonceBase64: string;
    userId: string;
  }) {
    const meta = this.readMeta(params.mediaId);

    if (meta.uploaderUserId !== params.userId) {
      throw new Error('Unauthorized uploader');
    }

    const chunkPath = join(this.mediaDir(params.mediaId), `${params.chunkIndex}.enc`);
    const data = Buffer.from(params.ciphertextBase64, 'base64');
    writeFileSync(chunkPath, data);

    // Store nonce (not secret) for receivers to decrypt
    meta.nonces[params.chunkIndex] = params.nonceBase64;
    meta.uploaded[params.chunkIndex] = true;
    this.writeMeta(params.mediaId, meta);

    return { ok: true };
  }

  async completeMedia(params: { mediaId: string; chunkCount: number; userId: string }) {
    const meta = this.readMeta(params.mediaId);
    if (meta.uploaderUserId !== params.userId) throw new Error('Unauthorized');

    meta.chunks = params.chunkCount;
    meta.finalized = true;
    this.writeMeta(params.mediaId, meta);

    return { ok: true };
  }

  async getChunk(params: {
    mediaId: string;
    chunkIndex: number;
    requesterUserId: string;
  }): Promise<{ ciphertextBase64: string; nonceBase64: string; mimeType: string }>
  {
    const meta = this.readMeta(params.mediaId);

    // Vérifier que le requester est participant de la conversation
    const participant = await this.prisma.conversationParticipant.findFirst({
      where: {
        conversationId: meta.conversationId,
        userId: params.requesterUserId,
        leftAt: null,
      },
      select: { userId: true },
    });
    if (!participant) throw new Error('Forbidden');

    const chunkPath = join(this.mediaDir(params.mediaId), `${params.chunkIndex}.enc`);
    const buf = readFileSync(chunkPath);
    const ciphertextBase64 = buf.toString('base64');
    const nonceBase64 = meta.nonces[params.chunkIndex];

    return { ciphertextBase64, nonceBase64, mimeType: meta.mimeType };
  }
}
