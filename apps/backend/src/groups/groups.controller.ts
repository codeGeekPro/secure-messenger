import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { InvitationsService } from './invitations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: string };
}

@Controller('groups')
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly invitationsService: InvitationsService
  ) {}

  /**
   * POST /groups - Crée un nouveau groupe
   */
  @Post()
  async createGroup(
    @Body() body: { name: string; description?: string; memberIds: string[] },
    @Request() req: AuthRequest
  ) {
    return this.groupsService.createGroup({
      name: body.name,
      description: body.description,
      creatorId: req.user.id,
      memberIds: body.memberIds,
    });
  }

  /**
   * PATCH /groups/:id/settings - Met à jour les paramètres du groupe
   */
  @Patch(':id/settings')
  async updateSettings(
    @Param('id') conversationId: string,
    @Body() body: { name?: string; description?: string; avatarUrl?: string },
    @Request() req: AuthRequest
  ) {
    return this.groupsService.updateSettings(conversationId, req.user.id, body);
  }

  /**
   * POST /groups/:id/members - Ajoute des membres
   */
  @Post(':id/members')
  async addMembers(
    @Param('id') conversationId: string,
    @Body() body: { memberIds: string[] },
    @Request() req: AuthRequest
  ) {
    return this.groupsService.addMembers(
      conversationId,
      req.user.id,
      body.memberIds
    );
  }

  /**
   * DELETE /groups/:id/members/:userId - Retire un membre
   */
  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
    @Request() req: AuthRequest
  ) {
    return this.groupsService.removeMember(
      conversationId,
      req.user.id,
      targetUserId
    );
  }

  /**
   * PATCH /groups/:id/members/:userId/role - Change le rôle d'un membre
   */
  @Patch(':id/members/:userId/role')
  async updateRole(
    @Param('id') conversationId: string,
    @Param('userId') targetUserId: string,
    @Body() body: { role: 'admin' | 'member' },
    @Request() req: AuthRequest
  ) {
    return this.groupsService.updateMemberRole(
      conversationId,
      req.user.id,
      targetUserId,
      body.role
    );
  }

  /**
   * POST /groups/:id/messages/:messageId/pin - Épingle un message
   */
  @Post(':id/messages/:messageId/pin')
  async pinMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Request() req: AuthRequest
  ) {
    return this.groupsService.pinMessage(
      conversationId,
      messageId,
      req.user.id
    );
  }

  /**
   * DELETE /groups/:id/messages/:messageId/pin - Désépingle un message
   */
  @Delete(':id/messages/:messageId/pin')
  async unpinMessage(
    @Param('id') conversationId: string,
    @Param('messageId') messageId: string,
    @Request() req: AuthRequest
  ) {
    return this.groupsService.unpinMessage(
      conversationId,
      messageId,
      req.user.id
    );
  }

  /**
   * GET /groups/:id/pinned - Liste les messages épinglés
   */
  @Get(':id/pinned')
  async getPinnedMessages(@Param('id') conversationId: string) {
    return this.groupsService.getPinnedMessages(conversationId);
  }

  /**
   * GET /groups/:id/audit-log - Récupère le journal d'audit
   */
  @Get(':id/audit-log')
  async getAuditLog(
    @Param('id') conversationId: string,
    @Query('limit') limit: string,
    @Request() req: AuthRequest
  ) {
    return this.groupsService.getAuditLog(
      conversationId,
      req.user.id,
      limit ? parseInt(limit) : 50
    );
  }

  /**
   * POST /groups/:id/leave - Quitte le groupe
   */
  @Post(':id/leave')
  async leaveGroup(
    @Param('id') conversationId: string,
    @Request() req: AuthRequest
  ) {
    return this.groupsService.leaveGroup(conversationId, req.user.id);
  }

  /**
   * POST /groups/:id/invites - Génère un lien d'invitation
   */
  @Post(':id/invites')
  async generateInvite(
    @Param('id') conversationId: string,
    @Body() body: { expiresIn?: number; maxUses?: number },
    @Request() req: AuthRequest
  ) {
    return this.invitationsService.generateInviteLink(
      conversationId,
      req.user.id,
      body
    );
  }

  /**
   * GET /groups/:id/invites - Liste les invitations actives
   */
  @Get(':id/invites')
  async listInvites(
    @Param('id') conversationId: string,
    @Request() req: AuthRequest
  ) {
    return this.invitationsService.listInvites(conversationId, req.user.id);
  }

  /**
   * DELETE /groups/invites/:inviteId - Révoque une invitation
   */
  @Delete('invites/:inviteId')
  async revokeInvite(
    @Param('inviteId') inviteId: string,
    @Request() req: AuthRequest
  ) {
    return this.invitationsService.revokeInvite(inviteId, req.user.id);
  }

  /**
   * POST /groups/join/:code - Rejoint un groupe via code d'invitation
   */
  @Post('join/:code')
  async joinViaInvite(
    @Param('code') code: string,
    @Request() req: AuthRequest
  ) {
    return this.invitationsService.acceptInvite(code, req.user.id);
  }
}
