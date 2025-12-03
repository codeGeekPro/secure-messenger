import { Module } from '@nestjs/common';
import { MessagesGateway } from './messages.gateway';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { EphemeralService } from './ephemeral.service';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [MessagesGateway, MessagesService, EphemeralService, SearchService, PrismaService],
  controllers: [MessagesController, SearchController],
  exports: [MessagesService, EphemeralService, SearchService],
})
export class MessagesModule {}
