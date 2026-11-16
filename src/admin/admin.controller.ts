import { Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiBearerAuth()
@Roles('ADMIN')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  users(@Query() q: PaginationDto) {
    return this.admin.listUsers(q);
  }

  @HttpCode(200)
  @Patch('users/:id/ban')
  ban(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.admin.ban(user.userId, id);
  }

  @HttpCode(200)
  @Patch('users/:id/unban')
  unban(@Param('id', ParseIntPipe) id: number) {
    return this.admin.unban(id);
  }
}
