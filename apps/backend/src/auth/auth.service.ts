import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma.service';
import { SignupDto, VerifyOtpDto, LoginResponse } from '@secure-messenger/types';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService
  ) {}

  /**
   * Inscription : génère un OTP et l'envoie par SMS/Email
   */
  async signup(dto: SignupDto): Promise<{ message: string }> {
    // Vérifier si l'utilisateur existe déjà
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: dto.phone }, { email: dto.email }],
      },
    });

    if (existing) {
      throw new ConflictException('User already exists');
    }

    // Générer OTP (6 chiffres)
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // TODO: Envoyer OTP via Twilio/SendGrid
    // Pour le POC, on log juste le code
    console.log(`📱 OTP for ${dto.phone || dto.email}: ${otp}`);

    // Stocker OTP dans Redis avec TTL 5 minutes
    // TODO: Implémenter Redis
    // await redis.setex(`otp:${dto.phone || dto.email}`, 300, otp);

    return {
      message: 'OTP sent successfully',
    };
  }

  /**
   * Vérification OTP et création compte
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<LoginResponse> {
    // TODO: Vérifier OTP depuis Redis
    // const storedOtp = await redis.get(`otp:${dto.phone || dto.email}`);
    // Pour le POC, on accepte toujours '123456'
    if (dto.code !== '123456') {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Créer ou récupérer l'utilisateur
    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ phone: dto.phone }, { email: dto.email }],
      },
    });

    if (!user) {
      // Créer nouveau user
      user = await this.prisma.user.create({
        data: {
          phone: dto.phone,
          email: dto.email,
          displayName: dto.phone || dto.email?.split('@')[0] || 'User',
        },
      });
    }

    // Générer tokens JWT
    const tokens = await this.generateTokens(user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        phone: user.phone || undefined,
        email: user.email || undefined,
        username: user.username || undefined,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl || undefined,
        statusText: user.statusText || undefined,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSeenAt: user.lastSeenAt,
      },
    };
  }

  /**
   * Refresh token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('JWT_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException();
      }

      const accessToken = this.jwtService.sign({ sub: user.id });

      return { accessToken };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Génère access token et refresh token
   */
  private async generateTokens(userId: string): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const accessToken = this.jwtService.sign({ sub: userId });

    const refreshToken = this.jwtService.sign(
      { sub: userId },
      {
        expiresIn: this.config.get('JWT_REFRESH_EXPIRATION', '7d'),
      }
    );

    return { accessToken, refreshToken };
  }

  /**
   * Valide un access token
   */
  async validateToken(token: string): Promise<{ userId: string }> {
    try {
      const payload = this.jwtService.verify(token);
      return { userId: payload.sub };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
