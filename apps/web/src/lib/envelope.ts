import sodium from 'libsodium-wrappers';

/**
 * Chiffre une clé de fichier pour plusieurs devices via crypto_box_seal (sealed box).
 * Sealed box = chiffrement asymétrique avec recipient public key uniquement.
 * Format: { deviceId, scheme: 'sealedBox', ciphertextBase64 }
 */
export async function encryptFileKeyForDevices(
  fileKeyBase64: string,
  devices: Array<{ id: string; identityKey: string }>
): Promise<Array<{ deviceId: string; scheme: string; ciphertextBase64: string }>> {
  await sodium.ready;

  const fileKeyBytes = sodium.from_base64(fileKeyBase64, sodium.base64_variants.ORIGINAL);
  const encryptedKeys = [];

  for (const device of devices) {
    // identityKey est en base64, on la décode
    const recipientPublicKey = sodium.from_base64(
      device.identityKey,
      sodium.base64_variants.ORIGINAL
    );

    // crypto_box_seal chiffre avec la clé publique du destinataire
    // Le destinataire déchiffrera avec sa clé privée via crypto_box_seal_open
    const ciphertext = sodium.crypto_box_seal(fileKeyBytes, recipientPublicKey);
    const ciphertextBase64 = sodium.to_base64(ciphertext, sodium.base64_variants.ORIGINAL);

    encryptedKeys.push({
      deviceId: device.id,
      scheme: 'sealedBox',
      ciphertextBase64,
    });
  }

  return encryptedKeys;
}

/**
 * Déchiffre une clé de fichier reçue via sealed box (nécessite identityKey privée du device).
 * Note: côté client, on devrait stocker la keypair (public + private) du device.
 * Pour l'instant, cette fonction est un placeholder.
 */
export async function decryptFileKeyForDevice(
  encryptedFileKey: { scheme: string; ciphertextBase64: string },
  devicePrivateKeyBase64: string,
  devicePublicKeyBase64: string
): Promise<string> {
  await sodium.ready;

  if (encryptedFileKey.scheme !== 'sealedBox') {
    throw new Error(`Unsupported scheme: ${encryptedFileKey.scheme}`);
  }

  const ciphertext = sodium.from_base64(
    encryptedFileKey.ciphertextBase64,
    sodium.base64_variants.ORIGINAL
  );
  const privateKey = sodium.from_base64(devicePrivateKeyBase64, sodium.base64_variants.ORIGINAL);
  const publicKey = sodium.from_base64(devicePublicKeyBase64, sodium.base64_variants.ORIGINAL);

  const decrypted = sodium.crypto_box_seal_open(ciphertext, publicKey, privateKey);
  return sodium.to_base64(decrypted, sodium.base64_variants.ORIGINAL);
}
