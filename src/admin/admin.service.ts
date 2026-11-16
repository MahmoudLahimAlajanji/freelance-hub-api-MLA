import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginated, PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(q: PaginationDto) {
    const [total, data] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, isBanned: true, createdAt: true },
        orderBy: { id: 'asc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  /** Banning also revokes every session, so refresh stops working immediately (access is blocked by JwtStrategy). */
  async ban(adminId: number, targetId: number) {
    if (adminId === targetId) throw new BadRequestException('You cannot ban yourself');
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true } });
    if (!target) throw new NotFoundException('User not found');
    if (target.role === 'ADMIN') throw new BadRequestException('Admin accounts cannot be banned');

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: targetId },
        data: { isBanned: true },
        select: { id: true, name: true, email: true, role: true, isBanned: true },
      });
      await tx.session.updateMany({ where: { userId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
      return user;
    });
  }

  async unban(targetId: number) {
    const target = await this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new NotFoundException('User not found');
    return this.prisma.user.update({
      where: { id: targetId },
      data: { isBanned: false },
      select: { id: true, name: true, email: true, role: true, isBanned: true },
    });
  }
}
