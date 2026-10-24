import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../common/auth.types';
import { CurrentUser } from '../common/decorators';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications') @ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private svc: NotificationsService) {}
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u.id); }
  @Post('read-all') readAll(@CurrentUser() u: AuthUser) { return this.svc.markRead(u.id); }
  @Post(':id/read') read(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.markRead(u.id, id); }
}
