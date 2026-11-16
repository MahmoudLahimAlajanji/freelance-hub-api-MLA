import { Module } from '@nestjs/common';
import { EscrowService } from './escrow.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  controllers: [ProjectsController],
  providers: [ProjectsService, EscrowService],
})
export class ProjectsModule {}
