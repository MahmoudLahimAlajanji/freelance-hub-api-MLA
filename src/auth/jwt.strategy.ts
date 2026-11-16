import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { JwtUser } from '../common/decorators/current-user.decorator';

interface AccessPayload {
  sub: number;
  role: string;
  sid: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /**
   * Runs on every protected request. One DB lookup makes logout / logout-others / ban
   * effective immediately instead of waiting for the 15m access token to expire.
   * The role is read from the DB (not from the token), so role changes apply instantly too.
   */
  async validate(payload: AccessPayload): Promise<JwtUser> {
    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: { select: { id: true, role: true, isBanned: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session is no longer valid');
    }
    if (session.user.isBanned) {
      throw new ForbiddenException('Your account has been banned');
    }
    return { userId: session.user.id, role: session.user.role, sid: session.id };
  }
}
