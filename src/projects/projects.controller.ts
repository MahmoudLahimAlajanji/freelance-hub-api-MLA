import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post,
  Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { deliveryUploadOptions, projectUploadOptions } from '../common/upload/upload.options';
import { CreateProjectDto } from './dto/create-project.dto';
import { DeliverDto } from './dto/deliver.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { EscrowService } from './escrow.service';
import { ProjectsService } from './projects.service';
import { Throttle } from '@nestjs/throttler';
import { CleanupUploadOnError } from '../common/upload/cleanup-upload-on-error.interceptor';

const projectBody = {
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' }, description: { type: 'string' },
      budget: { type: 'number' }, categoryId: { type: 'integer' },
      attachment: { type: 'string', format: 'binary', description: 'Optional image or PDF, max 5MB' },
    },
  },
};

@ApiTags('Projects')
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly escrow: EscrowService,
  ) {}

  @Public()
  @Get()
  findAll(@Query() q: QueryProjectsDto) {
    return this.projects.findAll(q);
  }

  
  @ApiBearerAuth()
  @Roles('CLIENT')
  @Get('my')
  mine(@CurrentUser() user: JwtUser, @Query() q: QueryProjectsDto) {
    return this.projects.findMine(user.userId, q);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.projects.findOne(id);
  }

  @Throttle({default :{ limit :100 ,ttl :3_600_000}})
  @ApiBearerAuth()
  @Roles('CLIENT')
  @ApiConsumes('multipart/form-data')
  @ApiBody(projectBody)
  @Post()
 @UseInterceptors(FileInterceptor('attachment', projectUploadOptions()), CleanupUploadOnError)
  create(@CurrentUser() user: JwtUser, @Body() dto: CreateProjectDto, @UploadedFile() file?: Express.Multer.File) {
    return this.projects.create(user.userId, dto, file);
  }

  @ApiBearerAuth()
  @Roles('CLIENT')
  @ApiConsumes('multipart/form-data')
  @ApiBody(projectBody)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('attachment', projectUploadOptions()),CleanupUploadOnError)
  update(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
    @Body() dto: UpdateProjectDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.projects.update(id, user.userId, dto, file);
  }

  @ApiBearerAuth()
  @Roles('CLIENT')
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtUser) {
    return this.projects.remove(id, user.userId);
  }

  // ---------- escrow flows ----------

  @ApiBearerAuth()
  @Roles('CLIENT')
  @HttpCode(200)
  @Post(':projectId/bids/:bidId/accept')
  accept(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Param('bidId', ParseIntPipe) bidId: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.escrow.acceptBid(user.userId, projectId, bidId);
  }

 
  @Throttle({ default: { limit: 100, ttl: 3_600_000 } })
  @ApiBearerAuth()
  @Roles('FREELANCER')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: { file: { type: 'string', format: 'binary', description: 'PDF or ZIP, max 20MB' }, notes: { type: 'string' } },
    },
  })
  @Post(':projectId/deliver')
  @UseInterceptors(FileInterceptor('file', deliveryUploadOptions()),CleanupUploadOnError)
  deliver(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: JwtUser,
    @Body() dto: DeliverDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file is required (PDF or ZIP)');
    return this.escrow.deliver(user.userId, projectId, dto, file);
  }
  @ApiBearerAuth()
  @Roles('CLIENT')
  @HttpCode(200)
  @Post(':projectId/approve-delivery')
  approve(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: JwtUser) {
    return this.escrow.approveDelivery(user.userId, projectId);
  }

  @ApiBearerAuth()
  @Get(':projectId/delivery')
  delivery(@Param('projectId', ParseIntPipe) projectId: number, @CurrentUser() user: JwtUser) {
    return this.escrow.getDelivery(user, projectId);
  }

  @ApiBearerAuth()
  @Get(':projectId/delivery/file')
  async downloadDelivery(
    @Param('projectId', ParseIntPipe) projectId: number,
    @CurrentUser() user: JwtUser,
    @Res() res: Response,
  ) {
    const path = await this.escrow.getDeliveryFilePath(user, projectId);
    return res.download(path);
  }
}
