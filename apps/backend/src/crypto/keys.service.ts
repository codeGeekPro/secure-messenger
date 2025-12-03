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
        deviceName,
        platform: platform as any,
        pushToken,
        identityKey: privateKeys.identityKey,
        signedPrekey: {
          publicKey: bundle.signedPreKey.publicKey,
          signature: bundle.signedPreKey.signature,
          privateKey: privateKeys.signedPreKey,
        },
        oneTimePrekeys: privateKeys.oneTimePreKeys.map((key, index) => ({
          publicKey: bundle.oneTimePreKeys[index],
          privateKey: key,
          used: false,
        })),
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
        signedPrekey: true,
        oneTimePrekeys: true,
      },
    });

    if (!device) {
      return null;
    }

    const signedPrekey = device.signedPrekey as any;
    const oneTimePrekeys = device.oneTimePrekeys as any[];

    // Filtrer les OneTimePreKeys non utilisées
    const availableOtpks = oneTimePrekeys
      .filter((opk) => !opk.used)
      .map((opk) => opk.publicKey);

    return {
      identityKey: device.identityKey,
      signedPreKey: {
        publicKey: signedPrekey.publicKey,
        signature: signedPrekey.signature,
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
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { oneTimePrekeys: true },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    const oneTimePrekeys = device.oneTimePrekeys as any[];
    const updatedKeys = oneTimePrekeys.map((opk) => {
      if (opk.publicKey === oneTimePreKeyPublic) {
        return { ...opk, used: true };
      }
      return opk;
    });

    await this.prisma.device.update({
      where: { id: deviceId },
      data: { oneTimePrekeys: updatedKeys },
    });
  }

  /**
   * Récupère la clé privée d'une OneTimePreKey
   */
  async getOneTimePreKeyPrivate(
    deviceId: string,
    oneTimePreKeyPublic: string
  ): Promise<string | null> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { oneTimePrekeys: true },
    });

    if (!device) {
      return null;
    }

    const oneTimePrekeys = device.oneTimePrekeys as any[];
    const opk = oneTimePrekeys.find(
      (opk) => opk.publicKey === oneTimePreKeyPublic
    );

    return opk?.privateKey || null;
  }

  /**
   * Recharge les OneTimePreKeys d'un device (rotation)
   */
  async replenishOneTimePreKeys(
    deviceId: string,
    count = 50
  ): Promise<number> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { oneTimePrekeys: true },
    });

    if (!device) {
      throw new Error('Device not found');
    }

    const oneTimePrekeys = device.oneTimePrekeys as any[];
    const availableCount = oneTimePrekeys.filter((opk) => !opk.used).length;

    // Si moins de 20 clés disponibles, générer nouvelles clés
    if (availableCount < 20) {
      const { bundle, privateKeys } = this.x3dh.generateKeyBundle(count);

      const newKeys = privateKeys.oneTimePreKeys.map((key, index) => ({
        publicKey: bundle.oneTimePreKeys[index],
        privateKey: key,
        used: false,
      }));

      // Conserver anciennes clés utilisées + ajouter nouvelles
      const updatedKeys = [
        ...oneTimePrekeys.filter((opk) => opk.used),
        ...newKeys,
      ];

      await this.prisma.device.update({
        where: { id: deviceId },
        data: { oneTimePrekeys: updatedKeys },
      });

      return newKeys.length;
    }

    return 0;
  }

  /**
   * Récupère tous les devices actifs d'un utilisateur
   */
  async getUserDevices(userId: string): Promise<
    Array<{
      id: string;
      deviceName: string;
      platform: string;
      lastActiveAt: Date;
    }>
  > {
    const devices = await this.prisma.device.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        deviceName: true,
        platform: true,
        lastActiveAt: true,
      },
      orderBy: {
        lastActiveAt: 'desc',
      },
    });

    return devices;
  }

  /**
   * Désactive un device (déconnexion)
   */
  async deactivateDevice(deviceId: string): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { isActive: false },
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
        signedPrekey: true,
      },
    });

    if (!device) {
      return null;
    }

    const signedPrekey = device.signedPrekey as any;

    return {
      identityKey: device.identityKey,
      signedPreKeyPrivate: signedPrekey.privateKey,
    };
  }
}
