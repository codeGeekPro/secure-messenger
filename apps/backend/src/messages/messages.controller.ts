import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';

class CreateConversationDto {
  type: 'direct' | 'group';
  participantIds: string[];
  name?: string;
  avatarUrl?: string;
}

/**
 * Contrôleur REST pour messages (en complément du WebSocket)
 */
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  /**
   * Crée une nouvelle conversation
   * POST /api/v1/messages/conversations
   */
  @Post('conversations')
  async createConversation(
    @GetUser('id') userId: string,
    @Body() dto: CreateConversationDto
  ) {
    const conversation = await this.messagesService.createConversation(
      dto.type,
      userId,
      dto.participantIds,
      dto.name,
      dto.avatarUrl
    );

    return {
      success: true,
      data: conversation,
    };
  }

  /**
   * Liste les conversations de l'utilisateur
   * GET /api/v1/messages/conversations
   */
  @Get('conversations')
  async getConversations(@GetUser('id') userId: string) {
    const conversations =
      await this.messagesService.getUserConversations(userId);

    return {
      success: true,
      data: conversations,
    };
  }

  /**
   * Récupère les messages d'une conversation (paginés)
   * GET /api/v1/messages/conversations/:id/messages
   */
  @Get('conversations/:id/messages')
  async getMessages(
    @Param('id') conversationId: string,
    @Query('limit') limit?: string,
    @Query('beforeId') beforeId?: string
  ) {
    const messages = await this.messagesService.getMessages(
      conversationId,
      limit ? parseInt(limit) : 50,
      beforeId
    );

    return {
      success: true,
      data: messages,
    };
  }

  /**
   * Liste les participants d'une conversation avec leurs devices
   * GET /api/v1/messages/conversations/:id/participants
   */
  @Get('conversations/:id/participants')
  async getConversationParticipantsWithDevices(
    @Param('id') conversationId: string,
    @GetUser('id') userId: string
  ) {
    // Optionnel: vérifier que le user est participant
    const isParticipant = await this.messagesService.getConversationParticipants(
      conversationId
    );
    if (!isParticipant.find((p: any) => p.userId === userId)) {
      return { success: false, error: 'Unauthorized' };
    }

    const participants =
      await this.messagesService.getConversationParticipantsWithDevices(
        conversationId
      );

    return {
      success: true,
      data: participants,
    };
  }

  /**
   * Quitte une conversation
   * POST /api/v1/messages/conversations/:id/leave
   */
  @Post('conversations/:id/leave')
  async leaveConversation(
    @Param('id') conversationId: string,
    @GetUser('id') userId: string
  ) {
    await this.messagesService.leaveConversation(conversationId, userId);

    return {
      success: true,
      data: {
        message: 'Left conversation successfully',
      },
    };
  }

  /**
   * Supprime un message
   * DELETE /api/v1/messages/:id
   */
  @Delete(':id')
  async deleteMessage(
    @Param('id') messageId: string,
    @GetUser('id') userId: string
  ) {
    await this.messagesService.deleteMessage(messageId, userId);

    return {
      success: true,
      data: {
        message: 'Message deleted successfully',
      },
    };
  }
}
