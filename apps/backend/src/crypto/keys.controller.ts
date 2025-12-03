import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { KeysService } from './keys.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

class RegisterDeviceDto {
  deviceName: string;
  platform: string;
  pushToken?: string;
}

class ReplenishKeysDto {
  count?: number;
}

/**
 * Contrôleur pour la gestion des clés cryptographiques
 */
@Controller('keys')
@UseGuards(JwtAuthGuard)
export class KeysController {
  constructor(private readonly keysService: KeysService) {}

  /**
   * Enregistre un nouveau device avec génération de clés
   * POST /api/v1/keys/devices
   */
  @Post('devices')
  @HttpCode(HttpStatus.CREATED)
  async registerDevice(
    @GetUser('id') userId: string,
    @Body() dto: RegisterDeviceDto
  ) {
    const result = await this.keysService.registerDevice(
      userId,
      dto.deviceName,
      dto.platform,
      dto.pushToken
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * Récupère le bundle de clés publiques d'un device
   * GET /api/v1/keys/devices/:deviceId/bundle
   */
  @Get('devices/:deviceId/bundle')
  async getKeyBundle(@Param('deviceId') deviceId: string) {
    const bundle = await this.keysService.getKeyBundle(deviceId);

    if (!bundle) {
      return {
        success: false,
        error: 'Device not found',
      };
    }

    return {
      success: true,
      data: bundle,
    };
  }

  /**
   * Recharge les OneTimePreKeys d'un device
   * POST /api/v1/keys/devices/:deviceId/replenish
   */
  @Post('devices/:deviceId/replenish')
  @HttpCode(HttpStatus.OK)
  async replenishKeys(
    @Param('deviceId') deviceId: string,
    @Body() dto: ReplenishKeysDto
  ) {
    const count = await this.keysService.replenishOneTimePreKeys(
      deviceId,
      dto.count
    );

    return {
      success: true,
      data: {
        keysAdded: count,
      },
    };
  }

  /**
   * Liste tous les devices actifs de l'utilisateur
   * GET /api/v1/keys/devices
   */
  @Get('devices')
  async getUserDevices(@GetUser('id') userId: string) {
    const devices = await this.keysService.getUserDevices(userId);

    return {
      success: true,
      data: devices,
    };
  }

  /**
   * Désactive un device (déconnexion)
   * POST /api/v1/keys/devices/:deviceId/deactivate
   */
  @Post('devices/:deviceId/deactivate')
  @HttpCode(HttpStatus.OK)
  async deactivateDevice(@Param('deviceId') deviceId: string) {
    await this.keysService.deactivateDevice(deviceId);

    return {
      success: true,
      data: {
        message: 'Device deactivated successfully',
      },
    };
  }
}
