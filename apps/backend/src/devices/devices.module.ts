import { Module } from '@nestjs/common';
import { DevicesService } from './devices.service';
import { DevicesController } from './devices.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [DevicesService, PrismaService],
  controllers: [DevicesController],
  exports: [DevicesService],
})
export class DevicesModule {}
