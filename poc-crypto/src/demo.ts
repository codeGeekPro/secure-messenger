import { initCrypto, generateKeyPair } from './crypto';
import { generateKeyBundle, initiateX3DH, acceptX3DH } from './x3dh';
import {
  initRatchetSender,
  initRatchetReceiver,
  ratchetEncrypt,
  ratchetDecrypt,
  RatchetState,
} from './ratchet';

/**
 * Démo complète : Alice envoie des messages à Bob
 */
async function demo() {
  console.log('🔐 POC Chiffrement E2E - Signal Protocol\n');

  // Initialiser libsodium
  await initCrypto();
  console.log('✅ Libsodium initialisé\n');

  // === PHASE 1 : Setup (Bob génère ses clés) ===
  console.log('📦 Bob génère son bundle de clés...');
  const bobKeys = generateKeyBundle(10); // 10 One-Time Prekeys
  console.log(`   - Identity Key: ${toHex(bobKeys.bundle.identityKey).slice(0, 16)}...`);
  console.log(`   - Signed Prekey: ${toHex(bobKeys.bundle.signedPreKey.publicKey).slice(0, 16)}...`);
  console.log(`   - ${bobKeys.bundle.oneTimePreKeys.length} One-Time Prekeys\n`);

  // === PHASE 2 : Alice initie session (X3DH) ===
  console.log('🤝 Alice initie session avec Bob (X3DH)...');
  const aliceIdentity = generateKeyPair();
  const aliceEphemeral = generateKeyPair();

  const aliceRootKey = initiateX3DH(
    aliceIdentity.privateKey,
    aliceEphemeral.privateKey,
    bobKeys.bundle,
    true // Utilise One-Time Prekey
  );

  console.log(`   - Root Key: ${toHex(aliceRootKey).slice(0, 32)}...\n`);

  // === PHASE 3 : Bob accepte session ===
  console.log('🔓 Bob accepte session...');
  const bobRootKey = acceptX3DH(
    bobKeys.privateKeys.identityKey,
    bobKeys.privateKeys.signedPreKey,
    bobKeys.privateKeys.oneTimePreKeys[0], // Utilise le premier OPK
    aliceIdentity.publicKey,
    aliceEphemeral.publicKey
  );

  console.log(`   - Root Key: ${toHex(bobRootKey).slice(0, 32)}...`);
  console.log(`   ✅ Root Keys match: ${buffersEqual(aliceRootKey, bobRootKey)}\n`);

  // === PHASE 4 : Double Ratchet ===
  console.log('🔄 Initialisation Double Ratchet...\n');
  let aliceState = initRatchetSender(aliceRootKey);
  let bobState = initRatchetReceiver(bobRootKey, aliceState.sendRatchetKey.publicKey);

  // === PHASE 5 : Échange de messages ===
  console.log('💬 Alice → Bob : 5 messages\n');

  const messages = [
    'Hello Bob!',
    'Comment ça va ?',
    'Voici un message secret 🔒',
    'Le chiffrement E2E fonctionne !',
    'Fin de la démo',
  ];

  for (const plaintext of messages) {
    console.log(`📤 Alice envoie: "${plaintext}"`);
    const encrypted = ratchetEncrypt(aliceState, plaintext);
    console.log(`   Ciphertext: ${toHex(encrypted.ciphertext).slice(0, 32)}...`);

    console.log(`📥 Bob reçoit et déchiffre...`);
    const decrypted = ratchetDecrypt(bobState, encrypted);
    console.log(`   Plaintext: "${decrypted}"`);
    console.log(`   ✅ Match: ${plaintext === decrypted}\n`);
  }

  // === PHASE 6 : Bob répond (DH Ratchet) ===
  console.log('💬 Bob → Alice : Réponse\n');

  const bobMessage = 'Salut Alice, tout va bien !';
  console.log(`📤 Bob envoie: "${bobMessage}"`);
  const encryptedFromBob = ratchetEncrypt(bobState, bobMessage);

  console.log(`📥 Alice reçoit et déchiffre...`);
  const decryptedByAlice = ratchetDecrypt(aliceState, encryptedFromBob);
  console.log(`   Plaintext: "${decryptedByAlice}"`);
  console.log(`   ✅ Match: ${bobMessage === decryptedByAlice}\n`);

  // === PHASE 7 : Test Out-of-Order ===
  console.log('🔀 Test messages hors-ordre...\n');

  const msg1 = ratchetEncrypt(aliceState, 'Message 1');
  const msg2 = ratchetEncrypt(aliceState, 'Message 2');
  const msg3 = ratchetEncrypt(aliceState, 'Message 3');

  // Bob reçoit dans l'ordre 2, 1, 3 (simuler latence réseau)
  console.log('📥 Bob reçoit msg2, msg1, msg3...');
  const dec2 = ratchetDecrypt(bobState, msg2);
  console.log(`   msg2: "${dec2}"`);

  // Note : Ce POC ne gère pas encore les messages hors-ordre
  // Il faudrait un buffer pour stocker les messages futurs
  console.log('⚠️  Gestion hors-ordre à implémenter (buffer de messages)\n');

  console.log('✅ POC terminé avec succès !');
}

// Helpers
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function buffersEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Lancer la démo
demo().catch(console.error);
