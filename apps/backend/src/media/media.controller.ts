import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GetUser } from '../common/decorators/get-user.decorator';
import { MediaService } from './media.service';

class InitMediaDto {
  conversationId: string;
  filename: string;
  mimeType: string;
  size: number;
  chunkSize: number;
}

class UploadChunkDto {
  mediaId: string;
  chunkIndex: number;
  ciphertextBase64: string;
  nonceBase64: string;
}

class CompleteMediaDto {
  mediaId: string;
  chunkCount: number;
}

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('init')
  @HttpCode(HttpStatus.CREATED)
  async initMedia(@GetUser('id') userId: string, @Body() dto: InitMediaDto) {
    const { mediaId, fileKey, chunkSize } = await this.mediaService.initMedia({
      uploaderUserId: userId,
      conversationId: dto.conversationId,
      filename: dto.filename,
      mimeType: dto.mimeType,
      size: dto.size,
      chunkSize: dto.chunkSize,
    });

    return { success: true, data: { mediaId, fileKey, chunkSize } };
  }

  @Post('upload')
  async uploadChunk(@GetUser('id') userId: string, @Body() dto: UploadChunkDto) {
    await this.mediaService.uploadChunk({
      mediaId: dto.mediaId,
      chunkIndex: dto.chunkIndex,
      ciphertextBase64: dto.ciphertextBase64,
      nonceBase64: dto.nonceBase64,
      userId,
    });

    return { success: true };
  }

  @Post('complete')
  async complete(@GetUser('id') userId: string, @Body() dto: CompleteMediaDto) {
    await this.mediaService.completeMedia({ mediaId: dto.mediaId, chunkCount: dto.chunkCount, userId });
    return { success: true };
  }

  @Get('download/:mediaId/:chunkIndex')
  async downloadChunk(
    @GetUser('id') userId: string,
    @Param('mediaId') mediaId: string,
    @Param('chunkIndex') chunkIndex: string,
  ) {
    const data = await this.mediaService.getChunk({ mediaId, chunkIndex: parseInt(chunkIndex), requesterUserId: userId });
    return { success: true, data };
  }
}
