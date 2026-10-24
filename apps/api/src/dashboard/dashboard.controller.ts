import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboards') @ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private svc: DashboardService) {}
  @Get('me') mine(@CurrentUser() u: AuthUser) { return this.svc.mine(u); }
  @Get('executive') @RequirePermission('dashboard.executive')
  executive(@Query('period') period?: 'today' | 'week' | 'month' | 'year') { return this.svc.executive(period ?? 'month'); }
}
