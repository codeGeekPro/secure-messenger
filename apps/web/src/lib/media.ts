import sodium from 'libsodium-wrappers';
import { apiClient } from './api';

export interface InitMediaResponse {
  mediaId: string;
  fileKey: string; // base64
  chunkSize: number;
}

export async function initCrypto() {
  await sodium.ready;
}

export async function initMediaUpload(
  conversationId: string,
  filename: string,
  mimeType: string,
  size: number,
  preferredChunkSize = 1024 * 1024 // 1MB
): Promise<InitMediaResponse> {
  const res = await apiClient.mediaInit({
    conversationId,
    filename,
    mimeType,
    size,
    chunkSize: preferredChunkSize,
  });
  if (!res.success || !res.data) throw new Error(res.error || 'initMedia failed');
  return res.data as InitMediaResponse;
}

export async function encryptAndUploadFile(
  file: File,
  mediaId: string,
  fileKeyBase64: string,
  chunkSize: number,
  onProgress?: (uploadedBytes: number, totalBytes: number) => void
) {
  const total = file.size;
  const fileKey = sodium.from_base64(fileKeyBase64, sodium.base64_variants.ORIGINAL);

  let offset = 0;
  let chunkIndex = 0;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const blob = file.slice(offset, end);
    const arrayBuffer = await blob.arrayBuffer();
    const plaintext = new Uint8Array(arrayBuffer);

    const nonce = sodium.randombytes_buf(
      sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES
    );
    const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
      plaintext,
      null,
      null,
      nonce,
      fileKey
    );

    const ciphertextBase64 = sodium.to_base64(
      ciphertext,
      sodium.base64_variants.ORIGINAL
    );
    const nonceBase64 = sodium.to_base64(
      nonce,
      sodium.base64_variants.ORIGINAL
    );

    const res = await apiClient.mediaUpload({
      mediaId,
      chunkIndex,
      ciphertextBase64,
      nonceBase64,
    });
    if (!res.success) throw new Error(res.error || 'mediaUpload failed');

    chunkIndex++;
    offset = end;
    onProgress?.(offset, total);
  }

  const complete = await apiClient.mediaComplete({ mediaId, chunkCount: chunkIndex });
  if (!complete.success) throw new Error(complete.error || 'mediaComplete failed');
}

export async function downloadAndDecrypt(
  mediaId: string,
  chunkCount: number,
  fileKeyBase64: string,
  mimeType: string
): Promise<Blob> {
  const fileKey = sodium.from_base64(fileKeyBase64, sodium.base64_variants.ORIGINAL);
  const parts: Uint8Array[] = [];

  for (let i = 0; i < chunkCount; i++) {
    const res = await apiClient.mediaDownload(mediaId, i);
    if (!res.success || !res.data) throw new Error(res.error || 'mediaDownload failed');
    const { ciphertextBase64, nonceBase64 } = res.data as any;

    const ciphertext = sodium.from_base64(
      ciphertextBase64,
      sodium.base64_variants.ORIGINAL
    );
    const nonce = sodium.from_base64(nonceBase64, sodium.base64_variants.ORIGINAL);

    const plaintext = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
      null,
      ciphertext,
      null,
      nonce,
      fileKey
    );
    parts.push(plaintext);
  }

  // Concatener
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const merged = new Uint8Array(totalLength);
  let pos = 0;
  for (const p of parts) {
    merged.set(p, pos);
    pos += p.length;
  }
  return new Blob([merged], { type: mimeType });
}
