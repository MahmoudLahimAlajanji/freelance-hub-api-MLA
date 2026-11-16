import {
  ConflictException, ForbiddenException, Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { paginated } from '../common/dto/pagination.dto';
import { assertSignature, removeByUrl } from '../common/upload/upload.options';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

const PROJECT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  client: { select: { id: true, name: true } },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCategory(categoryId: number) {
    const c = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!c) throw new BadRequestException('Category does not exist');
  }

  async create(clientId: number, dto: CreateProjectDto, file?: Express.Multer.File) {
    const attachmentUrl = file ? `/uploads/projects/${file.filename}` : undefined;
    try {
      if (file) assertSignature(file, ['jpg', 'png', 'webp', 'pdf']);
      await this.assertCategory(dto.categoryId);
      return await this.prisma.project.create({
        data: { ...dto, clientId, attachmentUrl },
        include: PROJECT_INCLUDE,
      });
    } catch (e) {
      removeByUrl(attachmentUrl);
      throw e;
    }
  }

  async findAll(q: QueryProjectsDto) {
    const where: Prisma.ProjectWhereInput = {
      status: q.status,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: [{ [q.sortBy]: q.order }, { id: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  /** The client's own projects, any status. */
  async findMine(clientId: number, q: QueryProjectsDto) {
    const where: Prisma.ProjectWhereInput = {
      clientId,
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: [{ [q.sortBy]: q.order }, { id: 'desc' }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
    ]);
    return paginated(data, total, q.page, q.limit);
  }

  async findOne(id: number) {
    const project = await this.prisma.project.findUnique({ where: { id }, include: PROJECT_INCLUDE });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  /** Ownership + OPEN checks give precise errors; the conditional write below makes them race-safe. */
  private async assertOwnedAndOpen(id: number, clientId: number) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found');
    if (project.clientId !== clientId) throw new ForbiddenException('You do not own this project');
    if (project.status !== 'OPEN') throw new ConflictException('Only OPEN projects can be modified');
    return project;
  }

  async update(id: number, clientId: number, dto: UpdateProjectDto, file?: Express.Multer.File) {
    const newUrl = file ? `/uploads/projects/${file.filename}` : undefined;
    try {
      if (file) assertSignature(file, ['jpg', 'png', 'webp', 'pdf']);
      const existing = await this.assertOwnedAndOpen(id, clientId);
      if (dto.categoryId) await this.assertCategory(dto.categoryId);

      const res = await this.prisma.project.updateMany({
        where: { id, clientId, status: 'OPEN' },
        data: { ...dto, ...(newUrl ? { attachmentUrl: newUrl } : {}) },
      });
      if (res.count === 0) throw new ConflictException('Project is no longer open');
      if (newUrl) removeByUrl(existing.attachmentUrl);
      return this.findOne(id);
    } catch (e) {
      removeByUrl(newUrl);
      throw e;
    }
  }

  async remove(id: number, clientId: number) {
    const existing = await this.assertOwnedAndOpen(id, clientId);
    const res = await this.prisma.project.deleteMany({ where: { id, clientId, status: 'OPEN' } });
    if (res.count === 0) throw new ConflictException('Project is no longer open');
    removeByUrl(existing.attachmentUrl);
    return { message: 'Project deleted' };
  }
}
