import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { CryptoModule } from './crypto/crypto.module';
import { MessagesModule } from './messages/messages.module';
import { PrismaService } from './common/prisma.service';
import { MediaModule } from './media/media.module';
import { CallsModule } from './calls/calls.module';
import { ReactionsModule } from './reactions/reactions.module';
import { GroupsModule } from './groups/groups.module';
import { DevicesModule } from './devices/devices.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minute
        limit: 100, // 100 requests
      },
    ]),
    AuthModule,
    CryptoModule,
    MessagesModule,
    MediaModule,
    CallsModule,
    ReactionsModule,
    GroupsModule,
    DevicesModule,
  ],
  controllers: [AppController],
  providers: [PrismaService],
})
export class AppModule {}
