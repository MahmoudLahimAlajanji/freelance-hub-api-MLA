import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, JwtUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

@Public()
@Throttle({ default: { limit: 100, ttl: 3_600_000 } })
@Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // 5 attempts per minute per IP
  @HttpCode(200)
  @Post('login')
  login(@Body() dto: LoginDto, @Headers('user-agent') userAgent?: string) {
    return this.auth.login(dto, userAgent);
  }

  @Public()
  @HttpCode(200)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('logout')
  logout(@CurrentUser() user: JwtUser) {
    return this.auth.logout(user.sid);
  }

  @ApiBearerAuth()
  @HttpCode(200)
  @Post('logout-others')
  logoutOthers(@CurrentUser() user: JwtUser) {
    return this.auth.logoutOthers(user.userId, user.sid);
  }

  @ApiBearerAuth()
  @Get('sessions')
  sessions(@CurrentUser() user: JwtUser) {
    return this.auth.sessions(user.userId, user.sid);
  }
}
