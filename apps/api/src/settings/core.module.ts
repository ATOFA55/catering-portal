import { Global, Module } from '@nestjs/common';
import { NotificationsController } from '../notifications/notifications.controller';
import { NotificationsService } from '../notifications/notifications.service';
import { SettingsService } from './settings.service';

@Global()
@Module({ providers: [SettingsService, NotificationsService], controllers: [NotificationsController], exports: [SettingsService, NotificationsService] })
export class CoreModule {}
