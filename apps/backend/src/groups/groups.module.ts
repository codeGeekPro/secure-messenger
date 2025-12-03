import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { InvitationsService } from './invitations.service';
import { GroupsController } from './groups.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [GroupsService, InvitationsService, PrismaService],
  controllers: [GroupsController],
  exports: [GroupsService, InvitationsService],
})
export class GroupsModule {}
