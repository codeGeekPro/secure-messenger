import { io, Socket } from 'socket.io-client';

/**
 * Configuration STUN/TURN pour traversée NAT
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // TODO: Ajouter serveur TURN en production
];

export interface CallSession {
  callId: string;
  conversationId: string;
  isInitiator: boolean;
  peerConnection: RTCPeerConnection;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  screenStream?: MediaStream;
  isScreenSharing: boolean;
}

export class WebRTCClient {
  private socket: Socket | null = null;
  private sessions = new Map<string, CallSession>();
  private onRemoteStreamCallback?: (callId: string, stream: MediaStream) => void;
  private onScreenShareCallback?: (callId: string, stream: MediaStream | null) => void;
  private onCallEndedCallback?: (callId: string) => void;

  constructor(private apiUrl: string, private token: string) {}

  /**
   * Connecte au serveur WebSocket pour signaling
   */
  connect() {
    this.socket = io(`${this.apiUrl}/calls`, {
      auth: { token: this.token },
      transports: ['websocket'],
    });

    this.setupSocketListeners();
  }

  /**
   * Configure les listeners Socket.IO pour signaling WebRTC
   */
  private setupSocketListeners() {
    if (!this.socket) return;

    // Appel entrant
    this.socket.on('call:incoming', async (data) => {
      console.log('[WebRTC] Incoming call:', data);
      // Notifier l'UI (géré par le composant parent)
    });

    // Appel accepté
    this.socket.on('call:accepted', async (data) => {
      console.log('[WebRTC] Call accepted:', data.callId);
      // Démarrer négociation SDP
      await this.createOffer(data.callId);
    });

    // Offre SDP reçue
    this.socket.on('call:offer', async (data) => {
      const session = this.sessions.get(data.callId);
      if (!session) return;

      await session.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
      );

      const answer = await session.peerConnection.createAnswer();
      await session.peerConnection.setLocalDescription(answer);

      this.socket?.emit('call:answer', {
        callId: data.callId,
        sdp: answer.sdp,
      });
    });

    // Réponse SDP reçue
    this.socket.on('call:answer', async (data) => {
      const session = this.sessions.get(data.callId);
      if (!session) return;

      await session.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp: data.sdp })
      );
    });

    // Candidat ICE reçu
    this.socket.on('call:ice-candidate', async (data) => {
      const session = this.sessions.get(data.callId);
      if (!session || !data.candidate) return;

      await session.peerConnection.addIceCandidate(
        new RTCIceCandidate(data.candidate)
      );
    });

    // Partage d'écran démarré
    this.socket.on('call:screen-share-started', async (data) => {
      console.log('[WebRTC] Screen share started by peer');
      // Traiter le SDP avec track écran
      const session = this.sessions.get(data.callId);
      if (!session) return;

      await session.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
      );

      const answer = await session.peerConnection.createAnswer();
      await session.peerConnection.setLocalDescription(answer);

      this.socket?.emit('call:answer', {
        callId: data.callId,
        sdp: answer.sdp,
      });
    });

    // Partage d'écran arrêté
    this.socket.on('call:screen-share-stopped', (data) => {
      console.log('[WebRTC] Screen share stopped by peer');
      this.onScreenShareCallback?.(data.callId, null);
    });

    // Appel terminé
    this.socket.on('call:ended', (data) => {
      this.handleCallEnded(data.callId);
    });

    // Reconnexion réseau
    this.socket.on('reconnect', () => {
      console.log('[WebRTC] Reconnected, restarting ICE...');
      this.restartIceForAllSessions();
    });
  }

  /**
   * Initie un nouvel appel audio/vidéo
   */
  async initiateCall(
    conversationId: string,
    recipientId: string,
    type: 'audio' | 'video'
  ): Promise<string> {
    if (!this.socket) throw new Error('Socket not connected');

    // Obtenir flux média local
    const localStream = await this.getUserMedia(type);

    // Créer session
    const callId = crypto.randomUUID();
    const peerConnection = this.createPeerConnection(callId);

    // Ajouter tracks locaux
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const session: CallSession = {
      callId,
      conversationId,
      isInitiator: true,
      peerConnection,
      localStream,
      isScreenSharing: false,
    };

    this.sessions.set(callId, session);

    // Envoyer au serveur
    this.socket.emit('call:initiate', {
      conversationId,
      recipientId,
      type,
    });

    return callId;
  }

  /**
   * Accepte un appel entrant
   */
  async acceptCall(callId: string, type: 'audio' | 'video'): Promise<void> {
    if (!this.socket) throw new Error('Socket not connected');

    const localStream = await this.getUserMedia(type);
    const peerConnection = this.createPeerConnection(callId);

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });

    const session: CallSession = {
      callId,
      conversationId: '', // Rempli par l'UI
      isInitiator: false,
      peerConnection,
      localStream,
      isScreenSharing: false,
    };

    this.sessions.set(callId, session);

    this.socket.emit('call:accept', { callId });
  }

  /**
   * Termine un appel
   */
  endCall(callId: string) {
    this.socket?.emit('call:end', { callId });
    this.handleCallEnded(callId);
  }

  /**
   * Démarre le partage d'écran
   */
  async startScreenShare(callId: string): Promise<void> {
    const session = this.sessions.get(callId);
    if (!session) return;

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });

      session.screenStream = screenStream;
      session.isScreenSharing = true;

      // Remplacer track vidéo par track écran
      const videoTrack = screenStream.getVideoTracks()[0];
      const sender = session.peerConnection
        .getSenders()
        .find((s) => s.track?.kind === 'video');

      if (sender) {
        await sender.replaceTrack(videoTrack);
      } else {
        session.peerConnection.addTrack(videoTrack, screenStream);
      }

      // Créer nouvelle offre SDP avec track écran
      const offer = await session.peerConnection.createOffer();
      await session.peerConnection.setLocalDescription(offer);

      this.socket?.emit('call:screen-share-start', {
        callId,
        sdp: offer.sdp,
      });

      // Gérer arrêt manuel du partage
      videoTrack.onended = () => {
        this.stopScreenShare(callId);
      };
    } catch (err) {
      console.error('[WebRTC] Screen share error:', err);
      throw err;
    }
  }

  /**
   * Arrête le partage d'écran
   */
  async stopScreenShare(callId: string): Promise<void> {
    const session = this.sessions.get(callId);
    if (!session || !session.screenStream) return;

    // Arrêter tracks écran
    session.screenStream.getTracks().forEach((track) => track.stop());

    // Revenir à la caméra
    if (session.localStream) {
      const videoTrack = session.localStream.getVideoTracks()[0];
      const sender = session.peerConnection
        .getSenders()
        .find((s) => s.track?.kind === 'video');

      if (sender && videoTrack) {
        await sender.replaceTrack(videoTrack);
      }
    }

    session.screenStream = undefined;
    session.isScreenSharing = false;

    this.socket?.emit('call:screen-share-stop', { callId });
    this.onScreenShareCallback?.(callId, null);
  }

  /**
   * Crée une RTCPeerConnection avec configuration ICE
   */
  private createPeerConnection(callId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Envoyer candidats ICE au pair
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket?.emit('call:ice-candidate', {
          callId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Recevoir flux distant
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received');
      const session = this.sessions.get(callId);
      if (session) {
        session.remoteStream = event.streams[0];
        this.onRemoteStreamCallback?.(callId, event.streams[0]);
      }
    };

    // Gérer changements état connexion
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.handleConnectionFailure(callId);
      }
    };

    return pc;
  }

  /**
   * Crée l'offre SDP initiale
   */
  private async createOffer(callId: string) {
    const session = this.sessions.get(callId);
    if (!session) return;

    const offer = await session.peerConnection.createOffer();
    await session.peerConnection.setLocalDescription(offer);

    this.socket?.emit('call:offer', {
      callId,
      sdp: offer.sdp,
    });
  }

  /**
   * Obtient flux média local (caméra/micro)
   */
  private async getUserMedia(type: 'audio' | 'video'): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { width: 1280, height: 720 } : false,
    });
  }

  /**
   * Gère la fin d'un appel
   */
  private handleCallEnded(callId: string) {
    const session = this.sessions.get(callId);
    if (!session) return;

    // Arrêter tous les flux
    session.localStream?.getTracks().forEach((track) => track.stop());
    session.remoteStream?.getTracks().forEach((track) => track.stop());
    session.screenStream?.getTracks().forEach((track) => track.stop());

    // Fermer connexion WebRTC
    session.peerConnection.close();

    this.sessions.delete(callId);
    this.onCallEndedCallback?.(callId);
  }

  /**
   * Gère perte connexion (4G → Wi-Fi)
   */
  private async handleConnectionFailure(callId: string) {
    console.log('[WebRTC] Connection failure, attempting ICE restart...');
    const session = this.sessions.get(callId);
    if (!session) return;

    // ICE restart pour réétablir connexion
    const offer = await session.peerConnection.createOffer({ iceRestart: true });
    await session.peerConnection.setLocalDescription(offer);

    this.socket?.emit('call:offer', {
      callId,
      sdp: offer.sdp,
    });
  }

  /**
   * Redémarre ICE pour toutes les sessions (après reconnexion)
   */
  private async restartIceForAllSessions() {
    for (const [callId, session] of this.sessions) {
      if (session.peerConnection.connectionState === 'connected') continue;

      await this.handleConnectionFailure(callId);
    }
  }

  /**
   * Callbacks pour événements
   */
  onRemoteStream(callback: (callId: string, stream: MediaStream) => void) {
    this.onRemoteStreamCallback = callback;
  }

  onScreenShare(callback: (callId: string, stream: MediaStream | null) => void) {
    this.onScreenShareCallback = callback;
  }

  onCallEnded(callback: (callId: string) => void) {
    this.onCallEndedCallback = callback;
  }

  /**
   * Ferme toutes les connexions
   */
  disconnect() {
    this.sessions.forEach((session, callId) => {
      this.handleCallEnded(callId);
    });
    this.socket?.disconnect();
  }
}
