import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, Public } from '../common/decorators';
import { AuthService } from './auth.service';

class LoginDto { @IsEmail() email: string; @IsString() @MinLength(1) password: string; }
class ForgotDto { @IsEmail() email: string; }
class ResetDto { @IsString() token: string; @IsString() @MinLength(8) newPassword: string; }
class LangDto { @IsIn(['en', 'ar']) language: 'en' | 'ar'; }

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private svc: AuthService) {}

  @Public() @Post('login') login(@Body() dto: LoginDto, @Ip() ip: string) { return this.svc.login(dto.email, dto.password, ip); }
  @Public() @Post('forgot-password') forgot(@Body() dto: ForgotDto) { return this.svc.forgotPassword(dto.email); }
  @Public() @Post('reset-password') reset(@Body() dto: ResetDto) { return this.svc.resetPassword(dto.token, dto.newPassword); }

  @ApiBearerAuth() @Get('me') me(@CurrentUser() u: AuthUser) { return this.svc.profile(u); }
  @ApiBearerAuth() @Post('language') lang(@CurrentUser() u: AuthUser, @Body() dto: LangDto) { return this.svc.changeLanguage(u.id, dto.language); }
}
