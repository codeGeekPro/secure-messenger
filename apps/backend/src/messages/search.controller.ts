import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

interface AuthRequest extends Request {
  user: { id: string };
}

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /**
   * GET /search/messages?q=keyword&conversationId=X&senderId=Y&type=media&after=2024-01-01&limit=50&cursor=abc
   * Recherche messages par métadonnées
   */
  @Get('messages')
  async searchMessages(
    @Query('q') query: string,
    @Query('conversationId') conversationId: string,
    @Query('senderId') senderId: string,
    @Query('type') type: 'text' | 'media' | 'file',
    @Query('after') after: string,
    @Query('before') before: string,
    @Query('limit') limitStr: string,
    @Query('cursor') cursor: string,
    @Request() req: AuthRequest
  ) {
    const limit = limitStr ? parseInt(limitStr) : 50;
    const afterDate = after ? new Date(after) : undefined;
    const beforeDate = before ? new Date(before) : undefined;

    return this.searchService.searchMessages(
      req.user.id,
      {
        query,
        conversationId,
        senderId,
        type,
        after: afterDate,
        before: beforeDate,
      },
      limit,
      cursor
    );
  }

  /**
   * GET /search/media?conversationId=X&limit=50&cursor=abc
   * Recherche uniquement messages média
   */
  @Get('media')
  async searchMedia(
    @Query('conversationId') conversationId: string,
    @Query('limit') limitStr: string,
    @Query('cursor') cursor: string,
    @Request() req: AuthRequest
  ) {
    const limit = limitStr ? parseInt(limitStr) : 50;
    return this.searchService.searchMediaMessages(
      req.user.id,
      conversationId,
      limit,
      cursor
    );
  }

  /**
   * GET /search/stats?conversationId=X
   * Statistiques recherche
   */
  @Get('stats')
  async getStats(
    @Query('conversationId') conversationId: string,
    @Request() req: AuthRequest
  ) {
    return this.searchService.getSearchStats(req.user.id, conversationId);
  }

  /**
   * GET /search/by-sender?senderId=X&conversationId=Y&limit=50
   * Messages d'un expéditeur spécifique
   */
  @Get('by-sender')
  async searchBySender(
    @Query('senderId') senderId: string,
    @Query('conversationId') conversationId: string,
    @Query('limit') limitStr: string,
    @Request() req: AuthRequest
  ) {
    const limit = limitStr ? parseInt(limitStr) : 50;
    return this.searchService.searchMessagesBySender(
      req.user.id,
      senderId,
      conversationId,
      limit
    );
  }

  /**
   * GET /search/by-date?start=2024-01-01&end=2024-12-31&conversationId=X
   * Messages dans une plage de dates
   */
  @Get('by-date')
  async searchByDate(
    @Query('start') startStr: string,
    @Query('end') endStr: string,
    @Query('conversationId') conversationId: string,
    @Query('limit') limitStr: string,
    @Request() req: AuthRequest
  ) {
    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    const limit = limitStr ? parseInt(limitStr) : 50;

    return this.searchService.searchMessagesByDateRange(
      req.user.id,
      startDate,
      endDate,
      conversationId,
      limit
    );
  }

  /**
   * GET /search/conversation-export?conversationId=X&offset=0&batchSize=1000
   * Exporte messages pour indexation côté client
   */
  @Get('conversation-export')
  async exportForClientSearch(
    @Query('conversationId') conversationId: string,
    @Query('offset') offsetStr: string,
    @Query('batchSize') batchSizeStr: string,
    @Request() req: AuthRequest
  ) {
    const offset = offsetStr ? parseInt(offsetStr) : 0;
    const batchSize = batchSizeStr ? parseInt(batchSizeStr) : 1000;

    return this.searchService.getAllMessagesForClientSearch(
      req.user.id,
      conversationId,
      batchSize,
      offset
    );
  }
}
