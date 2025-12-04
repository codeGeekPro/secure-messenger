import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DeviceType } from '@prisma/client';

class RegisterDeviceDto {
  name: string;
  type: DeviceType;
  identityKey: string; // Base64 encoded
  signedPreKey: string; // Base64 encoded
  signature: string; // Base64 encoded
  linkingSecret: string;
}

@Controller('devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  /**
   * @summary Initiate device linking
   * @description Generates a temporary secret for linking a new device.
   * The authenticated device calls this endpoint.
   */
  @UseGuards(JwtAuthGuard)
  @Post('link')
  async initiateLinking(@Request() req: any) {
    const { userId } = req.user;
    return this.devicesService.initiateLinking(userId);
  }

  /**
   * @summary Register a new device
   * @description Registers a new device for the user after validating the linking secret.
   */
  @Post('register')
  async registerDevice(@Body() body: RegisterDeviceDto) {
    // The new device is not authenticated yet, so this is a public endpoint.
    // Authorization is handled by the single-use linkingSecret.
    const userId = this.devicesService.validateLinkingSecret(body.linkingSecret);

    return this.devicesService.registerDevice(userId, {
      name: body.name,
      type: body.type,
      identityKey: Buffer.from(body.identityKey, 'base64'),
      signedPreKey: Buffer.from(body.signedPreKey, 'base64'),
      signature: Buffer.from(body.signature, 'base64'),
    });
  }

  /**
   * @summary List user's devices
   * @description Retrieves a list of all devices associated with the authenticated user.
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async getMyDevices(@Request() req: any) {
    const { userId } = req.user;
    const devices = await this.devicesService.findUserDevices(userId);
    // Don't expose sensitive keys
    return devices.map(d => ({ id: d.id, name: d.name, type: d.type, lastSeen: d.lastSeen }));
  }

  /**
   * @summary Get pre-key bundles for a user's devices
   * @description Fetches the public keys for all active devices of a given user,
   * required to establish encrypted sessions.
   */
  @UseGuards(JwtAuthGuard)
  @Get(':userId/bundles')
  async getUserDeviceBundles(@Param('userId') userId: string) {
    const devices = await this.devicesService.findUserDevices(userId);
    
    // This is a simplified bundle. A real implementation would fetch OneTimeKeys as well.
    return devices.map(d => ({
      deviceId: d.id,
      identityKey: d.identityKey.toString('base64'),
      signedPreKey: d.signedPreKey.toString('base64'),
      signature: d.signature.toString('base64'),
    }));
  }

  /**
   * @summary Revoke a device
   * @description Allows a user to remotely log out one of their other devices.
   */
  @UseGuards(JwtAuthGuard)
  @Delete(':deviceId')
  async revokeDevice(@Request() req: any, @Param('deviceId') deviceId: string) {
    const { userId, deviceId: currentDeviceId } = req.user;

    // A device cannot revoke itself via this endpoint.
    if (deviceId === currentDeviceId) {
      throw new ForbiddenException('A device cannot revoke itself.');
    }

    await this.devicesService.revokeDevice(userId, deviceId);
    return { message: 'Device revoked successfully.' };
  }
}
