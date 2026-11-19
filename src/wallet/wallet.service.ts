import { Injectable, NotFoundException } from '@nestjs/common';
import { paginated, PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { DepositDto } from './dto/deposit.dto';

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async getMine(userId: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, heldBalance: true, updatedAt: true },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  async transactions(userId: number, q: PaginationDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    const where = { walletId: wallet.id };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.walletTransaction.count({ where }),
      this.prisma.walletTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  
  deposit(userId: number, dto: DepositDto) {
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.update({
        where: { userId },
        data: { balance: { increment: dto.amount } }, 
        select: { id: true, balance: true, heldBalance: true },
      });
      await tx.walletTransaction.create({
        data: { walletId: wallet.id, amount: dto.amount, type: 'DEPOSIT', description: 'Wallet top-up' },
      });
      return wallet;
    });
  }
}
