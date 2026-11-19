import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import { Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = bcrypt.hashSync('koko', BCRYPT_ROUNDS);

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private hash(token: string) {
    // SHA-256, not bcrypt: bcrypt truncates input at 72 bytes and a JWT is longer than that
    return createHash('sha256').update(token).digest('hex');
  }

  private async signTokens(user: { id: number; role: Role }, sid: string) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: user.id, role: user.role, sid },
        { secret: this.config.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: '15m' },
      ),
      this.jwt.signAsync(
        { sub: user.id, sid },
        {
          secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
          expiresIn: '7d',
          jwtid: randomUUID(), // guarantees a different token on every rotation, even within the same second
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  async register(dto: RegisterDto) {
    const hashed = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { name: dto.name, email: dto.email, password: hashed, role: dto.role },
          select: { id: true, name: true, email: true, role: true, isBanned: true, createdAt: true },
        });
        await tx.wallet.create({ data: { userId: created.id } });
        if (dto.role === 'FREELANCER') {
          await tx.freelancerProfile.create({ data: { userId: created.id } });
        }
        return created;
      });
      return user;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Email is already registered');
      }
      throw e;
    }
  }

  async login(dto: LoginDto, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok = await bcrypt.compare(dto.password, user?.password ?? DUMMY_HASH);
    if (!user || !ok) throw new UnauthorizedException('Invalid email or password');
    if (user.isBanned) throw new ForbiddenException('Your account has been banned');

    const sid = randomUUID();
    const tokens = await this.signTokens(user, sid);
    await this.prisma.session.create({
      data: {
        id: sid,
        userId: user.id,
        userAgent: userAgent?.slice(0, 255),
        refreshTokenHash: this.hash(tokens.refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      },
    });
    return tokens;
  }

  
  async refresh(refreshToken: string) {
    let payload: { sub: number; sid: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const session = await this.prisma.session.findUnique({
      where: { id: payload.sid },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Session is no longer valid');
    }

    const oldHash = this.hash(refreshToken);
    if (session.refreshTokenHash !== oldHash) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    if (session.user.isBanned) {
      await this.revokeSession(session.id);
      throw new ForbiddenException('Your account has been banned');
    }

    const tokens = await this.signTokens(session.user, session.id);

    const swapped = await this.prisma.session.updateMany({
      where: { id: session.id, refreshTokenHash: oldHash, revokedAt: null },
      data: { refreshTokenHash: this.hash(tokens.refreshToken) },
    });
    if (swapped.count === 0) {
      await this.revokeSession(session.id);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    return tokens;
  }

  private revokeSession(sid: string) {
    return this.prisma.session.updateMany({
      where: { id: sid, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async logout(sid: string) {
    await this.revokeSession(sid);
    return { message: 'Logged out' };
  }

  async logoutOthers(userId: number, currentSid: string) {
    const res = await this.prisma.session.updateMany({
      where: { userId, id: { not: currentSid }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Logged out from other devices', revokedSessions: res.count };
  }

  async sessions(userId: number, currentSid: string) {
    const list = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return list.map((s) => ({ ...s, current: s.id === currentSid }));
  }
}
