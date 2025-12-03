import { Module } from '@nestjs/common';
import { ReactionsGateway } from './reactions.gateway';
import { ReactionsService } from './reactions.service';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [ReactionsGateway, ReactionsService, PrismaService],
  exports: [ReactionsService],
})
export class ReactionsModule {}
