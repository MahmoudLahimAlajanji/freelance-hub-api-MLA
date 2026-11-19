import {
  BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Patch, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { avatarUploadOptions } from '../common/upload/upload.options';
import { UpdateFreelancerProfileDto } from './dto/update-freelancer-profile.dto';
import { UsersService } from './users.service';

@ApiTags('Freelancers')
@Controller('freelancers')
export class FreelancersController {
  constructor(private readonly users: UsersService) {}

  @Public()
  @Get(':id')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.users.getFreelancer(id);
  }

  @ApiBearerAuth()
  @Roles('FREELANCER')
  @Patch('me/profile')
  update(@CurrentUser() user: JwtUser, @Body() dto: UpdateFreelancerProfileDto) {
    return this.users.updateProfile(user.userId, dto);
  }

  @ApiBearerAuth()
  @Roles('FREELANCER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } }, required: ['avatar'] } })
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('avatar', avatarUploadOptions()))
  avatar(@CurrentUser() user: JwtUser, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('avatar file is required');
    return this.users.setAvatar(user.userId, file);
  }
}
