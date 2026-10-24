import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { FinanceService } from './finance.service';

class PaymentDto { @IsNumber() amount: number; @IsIn(['CASH', 'BANK_TRANSFER', 'CARD']) method: string; @IsOptional() @IsString() reference?: string; }

@ApiTags('Finance') @ApiBearerAuth()
@Controller('finance')
export class FinanceController {
  constructor(private svc: FinanceService) {}
  @Get('invoices') @RequirePermission('finance.view') list(@CurrentUser() u: AuthUser, @Query('status') status?: string) { return this.svc.list(u, status); }
  @Get('summary') @RequirePermission('reports.financial') summary() { return this.svc.summary(); }
  @Get('invoices/:id') @RequirePermission('finance.view') get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.get(u, id); }
  @Post('invoices/:id/payments') @RequirePermission('finance.manage') pay(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number, @Body() dto: PaymentDto) { return this.svc.recordPayment(u, id, dto); }
}
