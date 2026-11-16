import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { slugify } from '../common/utils/slugify';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export const CATEGORIES_CACHE_KEY = 'categories:all';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  /** Cache-Aside: read cache -> on miss read DB and fill the cache. */
  async findAll() {
    const cached = await this.cache.get<unknown[]>(CATEGORIES_CACHE_KEY);
    if (cached) return cached;
    const categories = await this.prisma.category.findMany({ orderBy: { name: 'asc' } });
    await this.cache.set(CATEGORIES_CACHE_KEY, categories);
    return categories;
  }

  async create(dto: CreateCategoryDto) {
    const slug = slugify(dto.name);
    if (!slug) throw new BadRequestException('Category name must contain letters or digits');
    const category = await this.prisma.category.create({ data: { name: dto.name, slug } });
    await this.cache.del(CATEGORIES_CACHE_KEY); // invalidation: everyone sees the change immediately
    return category;
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const exists = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Category not found');
    const data: { name?: string; slug?: string } = {};
    if (dto.name) {
      data.name = dto.name;
      data.slug = slugify(dto.name);
      if (!data.slug) throw new BadRequestException('Category name must contain letters or digits');
    }
    const category = await this.prisma.category.update({ where: { id }, data });
    await this.cache.del(CATEGORIES_CACHE_KEY);
    return category;
  }

  async remove(id: number) {
    const exists = await this.prisma.category.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Category not found');
    // P2003 (category still has projects) is turned into 409 by PrismaExceptionFilter
    const category = await this.prisma.category.delete({ where: { id } });
    await this.cache.del(CATEGORIES_CACHE_KEY);
    return category;
  }
}
