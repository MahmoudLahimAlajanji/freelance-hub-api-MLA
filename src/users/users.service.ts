import { Injectable, NotFoundException } from '@nestjs/common';
import { assertSignature, removeByUrl } from '../common/upload/upload.options';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async me(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, role: true, createdAt: true,
        freelancerProfile: { select: { id: true, bio: true, hourlyRate: true, avatarUrl: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Public: any visitor can view a freelancer's profile. Never exposes email/password. */
  async getFreelancer(userId: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, role: 'FREELANCER', isBanned: false },
      select: {
        id: true, name: true, createdAt: true,
        freelancerProfile: { select: { bio: true, hourlyRate: true, avatarUrl: true } },
      },
    });
    if (!user) throw new NotFoundException('Freelancer not found');
    return user;
  }

  /** The profile is looked up by the JWT user id, so a freelancer can only ever edit their own. */
  updateProfile(userId: number, dto: UpdateFreelancerProfileDto) {
    return this.prisma.freelancerProfile.update({
      where: { userId },
      data: dto,
      select: { id: true, bio: true, hourlyRate: true, avatarUrl: true },
    });
  }

  async setAvatar(userId: number, file: Express.Multer.File) {
    assertSignature(file, ['jpg', 'png', 'webp']);
    const previous = await this.prisma.freelancerProfile.findUnique({ where: { userId }, select: { avatarUrl: true } });
    const avatarUrl = `/uploads/avatars/${file.filename}`;
    try {
      const profile = await this.prisma.freelancerProfile.update({
        where: { userId },
        data: { avatarUrl },
        select: { id: true, bio: true, hourlyRate: true, avatarUrl: true },
      });
      removeByUrl(previous?.avatarUrl); // do not leave the old image on disk
      return profile;
    } catch (e) {
      removeByUrl(avatarUrl);
      throw e;
    }
  }
}
