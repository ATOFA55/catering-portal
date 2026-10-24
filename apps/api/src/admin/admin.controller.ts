import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { AdminService } from './admin.service';

class CreateUserDto { @IsString() name: string; @IsEmail() email: string; @IsString() @MinLength(8) password: string; @IsInt() roleId: number; @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() company?: string; }
class UpdateUserDto { @IsOptional() @IsInt() roleId?: number; @IsOptional() @IsBoolean() isActive?: boolean; }
class PermDto { @IsString() code: string; @IsOptional() @IsIn(['ALL', 'OWN', 'ASSIGNED', null]) scope: 'ALL' | 'OWN' | 'ASSIGNED' | null; }
class SettingDto { @IsString() value: string; }

@ApiTags('Administration') @ApiBearerAuth()
@Controller('admin')
export class AdminController {
  constructor(private svc: AdminService) {}
  @Get('users') @RequirePermission('admin.users') users(@Query('q') q?: string) { return this.svc.users(q); }
  @Post('users') @RequirePermission('admin.users') create(@CurrentUser() u: AuthUser, @Body() dto: CreateUserDto) { return this.svc.createUser(u, dto); }
  @Put('users/:id') @RequirePermission('admin.users') update(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) { return this.svc.updateUser(u, id, dto); }
  @Get('roles') @RequirePermission('admin.roles', 'admin.users') roles() { return this.svc.roles(); }
  @Put('roles/:id/permissions') @RequirePermission('admin.roles') perm(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: PermDto) { return this.svc.setPermission(u, id, dto.code, dto.scope ?? null); }
  @Get('audit') @RequirePermission('admin.audit') audit(@Query('result') result?: string) { return this.svc.auditLog(result); }
  @Get('settings') @RequirePermission('admin.settings') settings() { return this.svc.settingsList(); }
  @Put('settings/:key') @RequirePermission('admin.settings') setSetting(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() dto: SettingDto) { return this.svc.updateSetting(u, key, dto.value); }
}
