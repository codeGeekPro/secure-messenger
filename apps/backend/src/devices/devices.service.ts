import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { Prisma, Device, DeviceType } from '@prisma/client';
import { randomBytes } from 'crypto';

interface RegisterDeviceDto {
  name: string;
  type: DeviceType;
  identityKey: Buffer;
  signedPreKey: Buffer;
  signature: Buffer;
  // linkingSignature: Buffer; // Signature from an existing device to authorize this new one
}

@Injectable()
export class DevicesService {
  // Store linking secrets in memory for simplicity. In production, use Redis.
  private linkingSecrets = new Map<string, { userId: string; expiresAt: Date }>();

  constructor(private prisma: PrismaService) {}

  /**
   * Initiates the device linking process by creating a temporary secret.
   * An existing, authenticated device calls this.
   * @param userId The ID of the user linking a new device.
   * @returns A secret to be shown as a QR code.
   */
  async initiateLinking(userId: string): Promise<{ linkingSecret: string; expiresAt: Date }> {
    const linkingSecret = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // Expires in 5 minutes

    this.linkingSecrets.set(linkingSecret, { userId, expiresAt });

    // Clean up expired secrets
    setTimeout(() => {
      if (this.linkingSecrets.get(linkingSecret)?.expiresAt === expiresAt) {
        this.linkingSecrets.delete(linkingSecret);
      }
    }, 5 * 60 * 1000 + 1000);

    return { linkingSecret, expiresAt };
  }

  /**
   * Validates a linking secret provided by a new device.
   * @param secret The secret scanned from the QR code.
   * @returns The user ID associated with the secret.
   */
  validateLinkingSecret(secret: string): string {
    const linkData = this.linkingSecrets.get(secret);

    if (!linkData || linkData.expiresAt < new Date()) {
      throw new ForbiddenException('Invalid or expired linking secret.');
    }

    // The secret is single-use
    this.linkingSecrets.delete(secret);

    return linkData.userId;
  }

  /**
   * Registers a new device for a user.
   * This should be called after a successful device linking process.
   * @param userId The user for whom to register the device.
   * @param data DTO with device name, type, and public keys.
   */
  async registerDevice(userId: string, data: RegisterDeviceDto): Promise<Device> {
    // In a real implementation, we would verify the `linkingSignature` here
    // to ensure an existing device authorized this registration.

    const device = await this.prisma.device.create({
      data: {
        userId,
        name: data.name,
        type: data.type,
        identityKey: data.identityKey,
        signedPreKey: data.signedPreKey,
        signature: data.signature,
      },
    });

    return device;
  }

  /**
   * Lists all active devices for a given user.
   * @param userId The user's ID.
   */
  async findUserDevices(userId: string): Promise<Device[]> {
    return this.prisma.device.findMany({
      where: { userId },
    });
  }

  /**
   * Finds a specific device by its ID.
   * @param deviceId The device's ID.
   */
  async findDeviceById(deviceId: string): Promise<Device | null> {
    return this.prisma.device.findUnique({ where: { id: deviceId } });
  }

  /**
   * Revokes a device, effectively logging it out.
   * @param userId The ID of the user performing the action.
   * @param deviceIdToRevoke The ID of the device to revoke.
   */
  async revokeDevice(userId: string, deviceIdToRevoke: string): Promise<Device> {
    const device = await this.findDeviceById(deviceIdToRevoke);

    if (!device) {
      throw new NotFoundException('Device not found.');
    }

    // A user can only revoke their own devices.
    if (device.userId !== userId) {
      throw new ForbiddenException('You can only revoke your own devices.');
    }

    // A user cannot revoke their last device. They should delete their account instead.
    const allDevices = await this.findUserDevices(userId);
    if (allDevices.length <= 1) {
      throw new ForbiddenException('Cannot revoke the last device.');
    }

    // For now, we just delete it. A soft-delete might be better.
    return this.prisma.device.delete({
      where: { id: deviceIdToRevoke },
    });
  }

  /**
   * Updates the last seen timestamp for a device.
   * @param deviceId The device's ID.
   */
  async updateLastSeen(deviceId: string): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { lastSeen: new Date() },
    });
  }
}
