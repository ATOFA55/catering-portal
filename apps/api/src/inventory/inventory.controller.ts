import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { InventoryService } from './inventory.service';

class ReceiveDto { @IsInt() ingredientId: number; @IsNumber() qty: number; @IsString() lotNo: string; @IsDateString() expiresAt: string; @IsString() location: string; }
class AdjustDto { @IsInt() batchId: number; @IsNumber() qty: number; @IsIn(['WASTE', 'ADJUST']) type: 'WASTE' | 'ADJUST'; @IsOptional() @IsString() note?: string; }

@ApiTags('Inventory') @ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(private svc: InventoryService) {}
  @Get('levels') @RequirePermission('inventory.view') levels() { return this.svc.levels(); }
  @Get('batches') @RequirePermission('inventory.view') batches(@Query('ingredientId') id?: string) { return this.svc.batches(id ? Number(id) : undefined); }
  @Get('movements') @RequirePermission('inventory.view') movements() { return this.svc.movements(); }
  @Get('reservations') @RequirePermission('inventory.view') reservations() { return this.svc.reservations(); }
  @Post('receive') @RequirePermission('inventory.manage') receive(@CurrentUser() u: AuthUser, @Body() dto: ReceiveDto) { return this.svc.receive(u, dto); }
  @Post('adjust') @RequirePermission('inventory.manage') adjust(@CurrentUser() u: AuthUser, @Body() dto: AdjustDto) { return this.svc.adjust(u, dto); }
}
