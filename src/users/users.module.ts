import { Module } from '@nestjs/common';
import { FreelancersController } from './freelancers.controller';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController, FreelancersController],
  providers: [UsersService],
})
export class UsersModule {}
