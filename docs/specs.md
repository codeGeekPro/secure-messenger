# Spécifications Fonctionnelles - Secure Messenger

## 1. Vision et Objectifs

### Vision
Créer une application de messagerie instantanée qui place la **sécurité** et la **confidentialité** au cœur de l'expérience utilisateur, tout en offrant des fonctionnalités modernes et une interface intuitive.

### Objectifs stratégiques
- **Sécurité :** Chiffrement end-to-end par défaut, aucune donnée en clair côté serveur
- **Performance :** Latence < 200ms p95 pour l'envoi/réception de messages
- **Scalabilité :** Support de 1M MAU dès le lancement
- **Simplicité :** Onboarding en < 2 minutes, UX familière

## 2. Personas

### Persona 1 : Sophie - Utilisatrice grand public
- **Âge :** 28 ans
- **Besoin :** Communiquer avec amis/famille de manière sécurisée
- **Pain points :** Apps complexes, publicités ciblées, vie privée

### Persona 2 : Marc - Professionnel
- **Âge :** 35 ans
- **Besoin :** Échanges professionnels confidentiels, appels vidéo
- **Pain points :** Failles de sécurité, manque de contrôle sur les données

### Persona 3 : Julie - Admin entreprise
- **Âge :** 42 ans
- **Besoin :** Déploiement équipe, conformité RGPD, reporting
- **Pain points :** Gestion des accès, eDiscovery

## 3. Cas d'usage principaux

### UC-001 : Inscription et onboarding
**Acteur :** Utilisateur nouveau  
**Préconditions :** App installée  
**Flux nominal :**
1. L'utilisateur ouvre l'app
2. Saisie numéro de téléphone ou email
3. Réception code OTP (SMS/email)
4. Validation code
5. Création profil (nom, photo optionnelle)
6. Génération paire de clés E2E automatique
7. Accueil avec suggestions de contacts

**Postconditions :** Compte créé, clés E2E prêtes  
**Critères d'acceptation :**
- Temps < 2 minutes
- Pas de friction (auto-détection contacts)
- Explications claires sur le chiffrement

### UC-002 : Envoi de message 1:1
**Acteur :** Utilisateur authentifié  
**Préconditions :** Contact ajouté ou conversation existante  
**Flux nominal :**
1. Sélection contact/conversation
2. Saisie texte dans le composer
3. (Optionnel) Ajout emoji, pièce jointe
4. Clic "Envoyer"
5. Message chiffré côté client
6. Envoi via WebSocket
7. Réception notification destinataire
8. Affichage statut "Envoyé" puis "Lu"

**Postconditions :** Message délivré et stocké chiffré  
**Critères d'acceptation :**
- Latence envoi→réception < 200ms (p95)
- Indicateur de chiffrement visible
- Retry automatique si échec

### UC-003 : Création de groupe
**Acteur :** Utilisateur authentifié  
**Flux nominal :**
1. Clic "Nouveau groupe"
2. Sélection membres (min. 2)
3. Nom du groupe + photo (optionnels)
4. Définition rôle (owner par défaut)
5. Création clé de groupe E2E
6. Distribution clé aux membres
7. Notification membres

**Postconditions :** Groupe créé, tous membres ont la clé  
**Critères d'acceptation :**
- Support jusqu'à 256 membres (MVP)
- Permissions (owner/admin/member)
- Messages de groupe chiffrés

### UC-004 : Appel audio/vidéo 1:1
**Acteur :** Utilisateur authentifié  
**Préconditions :** Connexion réseau stable  
**Flux nominal :**
1. Ouverture conversation
2. Clic icône "Appel vidéo"
3. Signaling via serveur
4. Établissement connexion WebRTC P2P
5. Chiffrement SRTP (DTLS-SRTP)
6. Indicateur durée, mute, caméra
7. Fin d'appel

**Postconditions :** Appel enregistré dans historique (durée)  
**Critères d'acceptation :**
- Établissement < 3s
- Qualité audio stable > 30 min
- Bascule réseau sans déconnexion

### UC-005 : Recherche de messages
**Acteur :** Utilisateur authentifié  
**Flux nominal :**
1. Clic icône recherche
2. Saisie mots-clés
3. Recherche locale (historique déchiffré)
4. Affichage résultats avec contexte
5. Filtres (date, expéditeur, conversation)
6. Clic résultat → navigation vers message

**Postconditions :** Résultats pertinents affichés  
**Critères d'acceptation :**
- Latence < 300ms (p95)
- Surlignage mots-clés
- Recherche multi-lingue

### UC-006 : Synchronisation multi-appareils
**Acteur :** Utilisateur avec 2+ appareils  
**Flux nominal :**
1. Connexion nouvel appareil (QR code ou lien)
2. Échange clés device-to-device
3. Sync historique messages chiffrés
4. Sync état lu/non-lu
5. Notifications sur tous appareils

**Postconditions :** Appareils synchronisés  
**Critères d'acceptation :**
- Sync < 10s pour historique 7 jours
- Aucune duplication messages
- Gestion conflits (last-write-wins)

## 4. Fonctionnalités détaillées

### 4.1 Authentification & Sécurité
- [ ] Inscription par téléphone ou email
- [ ] OTP (6 chiffres, validité 5 min)
- [ ] 2FA optionnel (TOTP)
- [ ] Biométrie (Face ID, Touch ID, empreinte Android)
- [ ] Verrouillage app par code PIN
- [ ] Session timeout (configurable)

### 4.2 Messagerie
- [ ] Texte avec formatage Markdown léger
- [ ] Emoji picker et réactions
- [ ] Pièces jointes (images, vidéos, documents ≤ 100 MB)
- [ ] Brouillons sauvegardés
- [ ] Messages éphémères (auto-destruction)
- [ ] Accusés de lecture (activable/désactivable)
- [ ] Statut "En train d'écrire..."
- [ ] Citations et réponses
- [ ] Édition messages (15 min post-envoi)
- [ ] Suppression messages (pour soi / pour tous)

### 4.3 Groupes
- [ ] Création/suppression groupes
- [ ] Rôles : Owner, Admin, Member
- [ ] Invitations par lien
- [ ] Modération : expulsion, bannissement
- [ ] Messages épinglés
- [ ] Descriptions de groupe
- [ ] Historique des actions

### 4.4 Appels
- [ ] Appels audio/vidéo 1:1
- [ ] Appels de groupe (4-8 participants MVP)
- [ ] Partage d'écran (desktop)
- [ ] Enregistrement (avec consentement)
- [ ] Sous-titres automatiques (post-MVP)

### 4.5 Médias
- [ ] Galerie photos/vidéos
- [ ] Compression automatique
- [ ] Aperçu avant envoi
- [ ] Téléchargement progressif
- [ ] Miniatures chiffrées

### 4.6 Notifications
- [ ] Push temps réel (FCM/APNs)
- [ ] Aperçu message (configurable)
- [ ] Sons et vibrations personnalisables
- [ ] Ne pas déranger (DND)
- [ ] Notifications groupées

### 4.7 Recherche
- [ ] Full-text dans messages
- [ ] Recherche contacts
- [ ] Filtres avancés (date, type, expéditeur)
- [ ] Historique recherches

### 4.8 Paramètres & Profil
- [ ] Photo et nom de profil
- [ ] Bio / À propos
- [ ] Statut en ligne (visible/invisible)
- [ ] Thème (clair/sombre/auto)
- [ ] Langue
- [ ] Confidentialité (qui voit photo, statut, dernier vu)
- [ ] Blocage utilisateurs
- [ ] Export de données (RGPD)
- [ ] Suppression compte

## 5. Exigences non-fonctionnelles (NFR)

### Performance
- **P95 latence message :** < 200 ms intra-région
- **P95 recherche :** < 300 ms
- **Cold start mobile :** < 2s (appareil milieu de gamme)
- **Frame rate UI :** ≥ 60 fps interactions principales

### Disponibilité
- **SLO :** 99.9% (MVP), 99.95% (post-GA)
- **Taux erreurs client :** < 0.5%
- **RTO :** ≤ 30 min
- **RPO :** ≤ 5 min

### Sécurité
- **Chiffrement :** E2E obligatoire (Double Ratchet)
- **Stockage serveur :** Aucune donnée en clair
- **Rotation secrets :** ≤ 90 jours
- **Conformité :** RGPD, CCPA

### Scalabilité
- **MAU cible :** 1M (MVP), 10M (an 2)
- **Messages/sec :** 10k soutenus
- **Connexions WS/nœud :** 100k
- **Stockage :** 50 TB initiaux, +10 TB/mois

### UX
- **Onboarding :** < 2 min
- **A11y :** WCAG 2.1 AA
- **Langues :** FR, EN, ES (MVP)
- **Plateformes :** iOS 15+, Android 10+, Web (Chrome, Firefox, Safari)

## 6. Hors périmètre (MVP)
- Appels de groupe > 8 participants
- Traduction automatique
- Bots et intégrations tierces
- Messagerie SMS/RCS
- Stickers personnalisés
- Statuts éphémères (stories)
- Mode multi-compte
- Widgets desktop

## 7. Règles métier

### RM-001 : Conservation des messages
- Messages conservés 1 an par défaut
- Option "Conserver indéfiniment" ou "Supprimer après X jours"
- Suppression automatique après expiration

### RM-002 : Taille des groupes
- MVP : 256 membres max
- Post-MVP : 5000 membres (canaux)

### RM-003 : Pièces jointes
- Taille max : 100 MB par fichier
- Formats autorisés : images (JPEG, PNG, GIF, WebP), vidéos (MP4, MOV), docs (PDF, DOC, XLS)
- Scan antivirus côté serveur (métadonnées uniquement)

### RM-004 : Rate limiting
- Envoi messages : 20/min par utilisateur
- Création groupes : 5/heure
- Invitations : 50/heure

### RM-005 : Modération
- Signalement utilisateur → review manuel
- Bannissement temporaire ou permanent
- Pas de scan automatique contenu (E2E)

## 8. Dépendances et intégrations

### Dépendances externes
- **SMS OTP :** Twilio ou AWS SNS
- **Email :** SendGrid ou AWS SES
- **Push notifications :** FCM (Android/Web), APNs (iOS)
- **CDN :** Cloudflare ou AWS CloudFront
- **Stockage médias :** S3-compatible
- **Monitoring :** Datadog, Grafana Cloud, ou Prometheus/Grafana

### Intégrations futures
- OAuth (Google, Apple, Microsoft)
- Import contacts depuis autres apps
- Backup cloud chiffré (iCloud, Google Drive)

## 9. Acceptance Criteria globaux

### Fonctionnel
- ✅ Tous les UC principaux implémentés et testés
- ✅ E2E fonctionnel et audité
- ✅ Sync multi-appareils stable

### Non-fonctionnel
- ✅ SLOs atteints sur 7 jours consécutifs
- ✅ 0 P0/P1 en production
- ✅ Tests E2E passent à 100%
- ✅ Couverture code > 85%

### UX
- ✅ NPS ≥ 45 en bêta
- ✅ Crash-free sessions ≥ 99.7%
- ✅ Onboarding complété par 90%+ des nouveaux utilisateurs

---
**Document owner :** Product Manager  
**Dernière révision :** 3 décembre 2025  
**Statut :** Draft → À valider par stakeholders
