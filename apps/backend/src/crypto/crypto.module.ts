import { Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { X3dhService } from './x3dh.service';
import { RatchetService } from './ratchet.service';
import { KeysService } from './keys.service';
import { KeysController } from './keys.controller';
import { PrismaService } from '../common/prisma.service';

@Module({
  providers: [CryptoService, X3dhService, RatchetService, KeysService, PrismaService],
  controllers: [KeysController],
  exports: [CryptoService, X3dhService, RatchetService, KeysService],
})
export class CryptoModule {}
