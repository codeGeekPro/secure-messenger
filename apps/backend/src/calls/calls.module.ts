import { Module } from '@nestjs/common';
import { CallsGateway } from './calls.gateway';
import { CallsService } from './calls.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [CallsGateway, CallsService, PrismaService],
  exports: [CallsService],
})
export class CallsModule {}
