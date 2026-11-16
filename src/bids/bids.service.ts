import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { paginated, PaginationDto } from '../common/dto/pagination.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { UpdateBidDto } from './dto/update-bid.dto';

@Injectable()
export class BidsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(freelancerId: number, projectId: number, dto: CreateBidDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const project = await tx.project.findUnique({ where: { id: projectId } });
        if (!project) throw new NotFoundException('Project not found');
        if (project.clientId === freelancerId) throw new ForbiddenException('You cannot bid on your own project');
        if (project.status !== 'OPEN') throw new ConflictException('Project is not open for bids');

        // Row-lock the project while it is still OPEN: this serialises with "accept bid",
        // so a bid can never be added to a project that has just been accepted.
        const locked = await tx.project.updateMany({
          where: { id: projectId, status: 'OPEN' },
          data: { updatedAt: new Date() },
        });
        if (locked.count === 0) throw new ConflictException('Project is not open for bids');

        return tx.bid.create({ data: { ...dto, projectId, freelancerId } });
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('You already placed a bid on this project');
      }
      throw e;
    }
  }

  /** Only the project owner sees the bids of a project. */
  async findForProject(clientId: number, projectId: number, q: PaginationDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId }, select: { clientId: true } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.clientId !== clientId) throw new ForbiddenException('You do not own this project');

    const where = { projectId };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.bid.count({ where }),
      this.prisma.bid.findMany({
        where,
        include: {
          freelancer: {
            select: { id: true, name: true, freelancerProfile: { select: { bio: true, hourlyRate: true, avatarUrl: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  /** A freelancer sees only his own bids and their status. */
  async findMine(freelancerId: number, q: PaginationDto) {
    const where = { freelancerId };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.bid.count({ where }),
      this.prisma.bid.findMany({
        where,
        include: { project: { select: { id: true, title: true, status: true, budget: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  private async assertEditable(bidId: number, freelancerId: number) {
    const bid = await this.prisma.bid.findUnique({ where: { id: bidId }, include: { project: { select: { status: true } } } });
    if (!bid) throw new NotFoundException('Bid not found');
    if (bid.freelancerId !== freelancerId) throw new ForbiddenException('This is not your bid');
    if (bid.status !== 'PENDING' || bid.project.status !== 'OPEN') {
      throw new ConflictException('Only PENDING bids on OPEN projects can be changed');
    }
  }

  async update(bidId: number, freelancerId: number, dto: UpdateBidDto) {
    await this.assertEditable(bidId, freelancerId);
    const res = await this.prisma.bid.updateMany({
      where: { id: bidId, freelancerId, status: 'PENDING', project: { status: 'OPEN' } },
      data: dto,
    });
    if (res.count === 0) throw new ConflictException('Bid can no longer be changed');
    return this.prisma.bid.findUnique({ where: { id: bidId } });
  }

  async remove(bidId: number, freelancerId: number) {
    await this.assertEditable(bidId, freelancerId);
    const res = await this.prisma.bid.deleteMany({
      where: { id: bidId, freelancerId, status: 'PENDING', project: { status: 'OPEN' } },
    });
    if (res.count === 0) throw new ConflictException('Bid can no longer be deleted');
    return { message: 'Bid deleted' };
  }
}
