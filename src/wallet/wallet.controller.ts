import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationDto } from '../common/dto/pagination.dto';
import { DepositDto } from './dto/deposit.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallet: WalletService) {}

  @Get()
  mine(@CurrentUser() user: JwtUser) {
    return this.wallet.getMine(user.userId);
  }

  @Get('transactions')
  transactions(@CurrentUser() user: JwtUser, @Query() q: PaginationDto) {
    return this.wallet.transactions(user.userId, q);
  }

  @Roles('CLIENT')
  @HttpCode(200)
  @Post('deposit')
  deposit(@CurrentUser() user: JwtUser, @Body() dto: DepositDto) {
    return this.wallet.deposit(user.userId, dto);
  }
}
