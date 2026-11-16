import {
  Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { UpdateBidDto } from './dto/update-bid.dto';

@ApiTags('Bids')
@ApiBearerAuth()
@Controller()
export class BidsController {
  constructor(private readonly bids: BidsService) {}

  @Roles('FREELANCER')
  @Post('projects/:projectId/bids')
  create(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: JwtUser,
    @Body() dto: CreateBidDto,
  ) {
    return this.bids.create(user.userId, projectId, dto);
  }

  @Roles('CLIENT')
  @Get('projects/:id/bids')
  forProject(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser, @Query() q: PaginationDto) {
    return this.bids.findForProject(user.userId, id, q);
  }

  @Roles('FREELANCER')
  @Get('bids/my')
  mine(@CurrentUser() user: JwtUser, @Query() q: PaginationDto) {
    return this.bids.findMine(user.userId, q);
  }

  @Roles('FREELANCER')
  @Patch('bids/:id')
  update(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser, @Body() dto: UpdateBidDto) {
    return this.bids.update(id, user.userId, dto);
  }

  @Roles('FREELANCER')
  @Delete('bids/:id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.bids.remove(id, user.userId);
  }
}
