import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { CancelDto, CreateOrderDto, DelayDto, ListOrdersQuery, ProposeChangeDto, RateDto, RespondDto } from './orders.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders') @ApiBearerAuth()
@Controller('orders')
export class OrdersController {
  constructor(private svc: OrdersService) {}

  @Post('quote') @RequirePermission('orders.create') quote(@Body() dto: CreateOrderDto) { return this.svc.quote(dto); }
  @Post() @RequirePermission('orders.create') create(@CurrentUser() u: AuthUser, @Body() dto: CreateOrderDto) { return this.svc.create(u, dto); }
  @Get() @RequirePermission('orders.view') list(@CurrentUser() u: AuthUser, @Query() q: ListOrdersQuery) { return this.svc.list(u, q); }
  @Get('my-addresses') @RequirePermission('orders.create') addresses(@CurrentUser() u: AuthUser) { return this.svc.customerAddresses(u); }
  @Get('customers') @RequirePermission('orders.manage') customers() { return this.svc.customers(); }
  @Get(':id') @RequirePermission('orders.view') get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.get(u, id); }
  @Get(':id/reorder') @RequirePermission('orders.create') reorder(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.reorderTemplate(u, id); }
  @Post(':id/submit') @RequirePermission('orders.create') submit(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.submitDraft(u, id); }
  @Post(':id/confirm') @RequirePermission('orders.manage') confirm(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.confirm(u, id); }
  @Post(':id/propose-change') @RequirePermission('orders.manage') propose(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: ProposeChangeDto) { return this.svc.proposeChange(u, id, dto); }
  @Post(':id/respond-change') @RequirePermission('orders.view') respond(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RespondDto) { return this.svc.respondChange(u, id, dto.approve); }
  @Post(':id/cancel') @RequirePermission('orders.cancel') cancel(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: CancelDto) { return this.svc.cancel(u, id, dto.reason ?? ''); }
  @Post(':id/delay') @RequirePermission('orders.manage') delay(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: DelayDto) { return this.svc.setDelay(u, id, dto); }
  @Post(':id/rate') @RequirePermission('orders.rate') rate(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: RateDto) { return this.svc.rate(u, id, dto); }
}
