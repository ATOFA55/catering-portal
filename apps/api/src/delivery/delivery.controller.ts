import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { DeliveryService } from './delivery.service';

class AssignDto { @IsInt() driverId: number; @IsOptional() @IsDateString() departAt?: string; }
class ReassignDto { @IsInt() driverId: number; }
class RescheduleDto { @IsDateString() deliveryAt: string; }
class CompleteDto { @IsString() @MaxLength(120) recipientName: string; @IsOptional() @IsString() @MaxLength(500) proofNote?: string; }
class FailDto { @IsString() @MaxLength(300) reason: string; }
class StatusDto { @IsIn(['AVAILABLE', 'OFF_DUTY']) status: 'AVAILABLE' | 'OFF_DUTY'; }

@ApiTags('Delivery') @ApiBearerAuth()
@Controller('delivery')
export class DeliveryController {
  constructor(private svc: DeliveryService) {}
  @Get('board') @RequirePermission('delivery.manage') board() { return this.svc.board(); }
  @Get('drivers') @RequirePermission('delivery.manage') drivers() { return this.svc.drivers(); }
  @Post('orders/:id/assign') @RequirePermission('delivery.manage') assign(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: AssignDto) { return this.svc.assign(u, id, dto); }
  @Post('orders/:id/reassign') @RequirePermission('delivery.manage') reassign(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ReassignDto) { return this.svc.reassign(u, id, dto); }
  @Post('orders/:id/reschedule') @RequirePermission('delivery.manage') reschedule(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RescheduleDto) { return this.svc.reschedule(u, id, dto); }

  @Get('mine') @RequirePermission('delivery.perform') mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u); }
  @Post('mine/status') @RequirePermission('delivery.perform') status(@CurrentUser() u: AuthUser, @Body() dto: StatusDto) { return this.svc.setMyStatus(u, dto.status); }
  @Post(':id/complete') @RequirePermission('delivery.perform') complete(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CompleteDto) { return this.svc.complete(u, id, dto); }
  @Post(':id/fail') @RequirePermission('delivery.perform') fail(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: FailDto) { return this.svc.fail(u, id, dto); }
}
