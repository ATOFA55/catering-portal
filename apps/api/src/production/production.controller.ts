import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ProductionService } from './production.service';

class WasteDto { @IsInt() ingredientId: number; @IsNumber() qty: number; }
class ReadyDto {
  @IsOptional() @IsBoolean() allergenChecked?: boolean;
  @IsOptional() @IsString() qualityNote?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => WasteDto) waste?: WasteDto[];
}

@ApiTags('Kitchen') @ApiBearerAuth()
@Controller('production')
export class ProductionController {
  constructor(private svc: ProductionService) {}
  @Get() @RequirePermission('production.view') list(@Query('status') status?: string) { return this.svc.list(status); }
  @Get('schedule') @RequirePermission('production.view') schedule(@Query('date') date?: string) { return this.svc.schedule(date); }
  @Post(':id/start') @RequirePermission('production.update') start(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.start(u, id); }
  @Post(':id/ready') @RequirePermission('production.update') ready(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReadyDto) { return this.svc.ready(u, id, dto); }
}
