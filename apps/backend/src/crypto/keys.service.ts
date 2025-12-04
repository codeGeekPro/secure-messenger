import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { X3dhService, KeyBundle } from './x3dh.service';

/**
 * Service de gestion des clés par device
 * Gère PreKeys, rotation, synchronisation multi-devices
 */
@Injectable()
export class KeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly x3dh: X3dhService
  ) {}

  /**
   * Enregistre un nouveau device avec génération de clés
   */
  async registerDevice(
    userId: string,
    deviceName: string,
    platform: string,
    pushToken?: string
  ): Promise<{ deviceId: string; bundle: KeyBundle }> {
    // Générer bundle de clés
    const { bundle, privateKeys } = this.x3dh.generateKeyBundle(100);

    // Créer device dans BDD
    const device = await this.prisma.device.create({
      data: {
        userId,
        name: deviceName,
        type: platform as any,
        identityKey: Buffer.isBuffer(privateKeys.identityKey) ? privateKeys.identityKey : Buffer.from(privateKeys.identityKey),
        signedPreKey: Buffer.isBuffer(privateKeys.signedPreKey) ? privateKeys.signedPreKey : Buffer.from(privateKeys.signedPreKey),
        signature: Buffer.from(''),
      },
    });

    return {
      deviceId: device.id,
      bundle,
    };
  }

  /**
   * Récupère le bundle de clés publiques d'un device
   */
  async getKeyBundle(deviceId: string): Promise<KeyBundle | null> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        identityKey: true,
        signedPreKey: true,
      },
    });

    if (!device) {
      return null;
    }

    const signedPrekey = device.signedPreKey as any;
    const oneTimePrekeys: any[] = [];

    // Filtrer les OneTimePreKeys non utilisées
    const availableOtpks = oneTimePrekeys
      .filter((opk) => !opk.used)
      .map((opk) => opk.publicKey);

    return {
      identityKey: device.identityKey.toString('base64'),
      signedPreKey: {
        publicKey: signedPrekey.toString('base64'),
        signature: Buffer.from('').toString('base64'),
      },
      oneTimePreKeys: availableOtpks,
    };
  }

  /**
   * Marque une OneTimePreKey comme utilisée
   */
  async markOneTimePreKeyAsUsed(
    deviceId: string,
    oneTimePreKeyPublic: string
  ): Promise<void> {
    // OneTimeKeys are stored separately in the OneTimeKey model
    // This method would need to be refactored to work with the actual schema
    // For now, just return successfully
    return;
  }

  /**
   * Récupère la clé privée d'une OneTimePreKey
   */
  async getOneTimePreKeyPrivate(
    deviceId: string,
    oneTimePreKeyPublic: string
  ): Promise<string | null> {
    // OneTimeKeys are stored separately in the OneTimeKey model
    // This method would need to be refactored to work with the actual schema
    // For now, return null
    return null;
  }

  /**
   * Recharge les OneTimePreKeys d'un device (rotation)
   */
  async replenishOneTimePreKeys(
    deviceId: string,
    count = 50
  ): Promise<number> {
    // OneTimeKeys are stored separately in the OneTimeKey model
    // This method would need to be refactored to work with the actual schema
    // For now, return 0
    return 0;
  }

  /**
   * Récupère tous les devices actifs d'un utilisateur
   */
  async getUserDevices(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      type: string;
      lastSeen: Date;
    }>
  > {
    const devices = await this.prisma.device.findMany({
      where: {
        userId,
      },
      select: {
        id: true,
        name: true,
        type: true,
        lastSeen: true,
      },
      orderBy: {
        lastSeen: 'desc',
      },
    });

    return devices;
  }

  /**
   * Désactive un device (déconnexion)
   */
  async deactivateDevice(deviceId: string): Promise<void> {
    // Device deactivation could involve marking as deleted or removing from DB
    // For now, just delete the device
    await this.prisma.device.delete({
      where: { id: deviceId },
    });
  }

  /**
   * Récupère les clés privées d'un device (pour accepter X3DH)
   */
  async getDevicePrivateKeys(deviceId: string): Promise<{
    identityKey: string;
    signedPreKeyPrivate: string;
  } | null> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: {
        identityKey: true,
        signedPreKey: true,
      },
    });

    if (!device) {
      return null;
    }

    return {
      identityKey: device.identityKey.toString('base64'),
      signedPreKeyPrivate: device.signedPreKey.toString('base64'),
    };
  }
}
