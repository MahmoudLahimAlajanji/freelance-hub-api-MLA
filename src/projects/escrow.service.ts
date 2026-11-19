import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  InternalServerErrorException, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { assertSignature, removeByUrl, UPLOAD_ROOT } from '../common/upload/upload.options';
import { PrismaService } from '../prisma/prisma.service';
import { basename, join } from 'path';
import { DeliverDto } from './dto/deliver.dto';

export const PLATFORM_FEE_PERCENT = 10;


@Injectable()
export class EscrowService {
  constructor(private readonly prisma: PrismaService) {}

  async acceptBid(clientId: number, projectId: number, bidId: number) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) throw new NotFoundException('Project not found');
      if (project.clientId !== clientId) throw new ForbiddenException('You do not own this project');
      if (project.status !== 'OPEN') throw new ConflictException('Project is not open');

      const bid = await tx.bid.findFirst({ where: { id: bidId, projectId } });
      if (!bid) throw new NotFoundException('Bid not found on this project');
      if (bid.status !== 'PENDING') throw new ConflictException('Bid is not pending');

      // 1) claim the project first: this row lock serialises with concurrent accepts / new bids
      const claimed = await tx.project.updateMany({
        where: { id: projectId, clientId, status: 'OPEN' },
        data: { status: 'IN_PROGRESS', acceptedBidId: bid.id },
      });
      if (claimed.count === 0) throw new ConflictException('Project is no longer open');

      // 2) accept the bid; price is part of the condition so an edit made meanwhile cannot slip through
      const accepted = await tx.bid.updateMany({
        where: { id: bid.id, projectId, status: 'PENDING', price: bid.price },
        data: { status: 'ACCEPTED' },
      });
      if (accepted.count === 0) throw new ConflictException('Bid changed, please review it again');

      await tx.bid.updateMany({
        where: { projectId, id: { not: bid.id } },
        data: { status: 'REJECTED' },
      });

      // 3) atomic hold: only succeeds if balance >= price (no read-then-write race)
      const held = await tx.wallet.updateMany({
        where: { userId: clientId, balance: { gte: bid.price } },
        data: { balance: { decrement: bid.price }, heldBalance: { increment: bid.price } },
      });
      if (held.count === 0) throw new BadRequestException('Insufficient wallet balance');

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: clientId } });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: bid.price,
          type: 'HOLD',
          referenceId: projectId,
          description: `Funds held in escrow for project #${projectId}`,
        },
      });

      return { projectId, bidId: bid.id, status: 'IN_PROGRESS', held: bid.price, wallet };
    });
  }

  async deliver(freelancerId: number, projectId: number, dto: DeliverDto, file: Express.Multer.File) {
    const fileUrl = `/uploads/deliveries/${file.filename}`;
    try {
      assertSignature(file, ['pdf', 'zip']);
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        include: { acceptedBid: true, delivery: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      if (project.status !== 'IN_PROGRESS' || !project.acceptedBid) {
        throw new ConflictException('Project is not in progress');
      }
      if (project.acceptedBid.freelancerId !== freelancerId) {
        throw new ForbiddenException('Only the winning freelancer can deliver this project');
      }
      if (project.delivery) throw new ConflictException('A delivery was already submitted');

      // projectId is @unique on Delivery: a concurrent double-submit fails with P2002 -> 409
      return await this.prisma.delivery.create({
        data: { projectId, freelancerId, fileUrl, notes: dto.notes },
      });
    } catch (e) {
      removeByUrl(fileUrl);
      throw e;
    }
  }

  async approveDelivery(clientId: number, projectId: number) {
    return this.prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        include: { acceptedBid: true, delivery: true },
      });
      if (!project) throw new NotFoundException('Project not found');
      if (project.clientId !== clientId) throw new ForbiddenException('You do not own this project');
      if (project.status !== 'IN_PROGRESS' || !project.acceptedBid) {
        throw new ConflictException('Project is not in progress');
      }
      if (!project.delivery) throw new BadRequestException('No delivery has been submitted yet');

      const d = await tx.delivery.updateMany({
        where: { projectId, status: 'SUBMITTED' },
        data: { status: 'APPROVED' },
      });
      if (d.count === 0) throw new ConflictException('Delivery was already approved');
      const p = await tx.project.updateMany({
        where: { id: projectId, status: 'IN_PROGRESS' },
        data: { status: 'COMPLETED' },
      });
      if (p.count === 0) throw new ConflictException('Project is not in progress');

      const price = new Prisma.Decimal(project.acceptedBid.price);
      const fee = price.mul(PLATFORM_FEE_PERCENT).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const payout = price.sub(fee);

      const released = await tx.wallet.updateMany({
        where: { userId: clientId, heldBalance: { gte: price } },
        data: { heldBalance: { decrement: price } },
      });
      if (released.count === 0) {
        throw new InternalServerErrorException('Escrow inconsistency: held balance is lower than the bid price');
      }

      const freelancerWallet = await tx.wallet.update({
        where: { userId: project.acceptedBid.freelancerId },
        data: { balance: { increment: payout } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: freelancerWallet.id,
          amount: payout,
          type: 'RELEASE_PAYOUT',
          referenceId: projectId,
          description: `Payout (${100 - PLATFORM_FEE_PERCENT}%) for project #${projectId}`,
        },
      });

      const platformWallet = await tx.wallet.findFirst({
        where: { user: { role: 'ADMIN' } },
        orderBy: { id: 'asc' },
      });
      if (!platformWallet) throw new InternalServerErrorException('Platform wallet is not configured (run the seed)');
      await tx.wallet.update({ where: { id: platformWallet.id }, data: { balance: { increment: fee } } });
      await tx.walletTransaction.create({
        data: {
          walletId: platformWallet.id,
          amount: fee,
          type: 'PLATFORM_FEE',
          referenceId: projectId,
          description: `Platform fee (${PLATFORM_FEE_PERCENT}%) for project #${projectId}`,
        },
      });

      return { projectId, status: 'COMPLETED', total: price, freelancerPayout: payout, platformFee: fee };
    });
  }

  async getDeliveryFilePath(user: { userId: number; role: string }, projectId: number) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { delivery: true, acceptedBid: true },
    });
    if (!project || !project.delivery) throw new NotFoundException('Delivery not found');
    const allowed =
      user.role === 'ADMIN' ||
      project.clientId === user.userId ||
      project.delivery.freelancerId === user.userId;
    if (!allowed) throw new ForbiddenException('You cannot access this delivery');
    return join(UPLOAD_ROOT, 'deliveries', basename(project.delivery.fileUrl));
  }
  
  async getDelivery(user: { userId: number; role: string }, projectId: number) {
  const project = await this.prisma.project.findUnique({ where: { id: projectId }, include: { delivery: true } });
  if (!project?.delivery) throw new NotFoundException('Delivery not found');
  const allowed = user.role === 'ADMIN' || project.clientId === user.userId || project.delivery.freelancerId === user.userId;
  if (!allowed) throw new ForbiddenException('You cannot access this delivery');
  const { fileUrl, ...delivery } = project.delivery;
  return delivery;
}
}
