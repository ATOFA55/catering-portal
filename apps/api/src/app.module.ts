import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { AuthGuard } from './common/auth.guard';
import { CommonModule } from './common/common.module';
import { DashboardController } from './dashboard/dashboard.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { DbModule } from './db/db.module';
import { DeliveryController } from './delivery/delivery.controller';
import { DeliveryService } from './delivery/delivery.service';
import { EventsController } from './events/events.controller';
import { FinanceController } from './finance/finance.controller';
import { FinanceService } from './finance/finance.service';
import { HealthController } from './health.controller';
import { InventoryController } from './inventory/inventory.controller';
import { InventoryService } from './inventory/inventory.service';
import { JobsService } from './jobs/jobs.service';
import { OrderOps } from './orders/order-ops.service';
import { OrdersController } from './orders/orders.controller';
import { OrdersService } from './orders/orders.service';
import { PricingService } from './pricing/pricing.service';
import { ProductionController } from './production/production.controller';
import { ProductionService } from './production/production.service';
import { CoreModule } from './settings/core.module';

@Module({
  imports: [
    DbModule, CommonModule, CoreModule,
    JwtModule.register({ global: true, secret: process.env.JWT_SECRET ?? 'dev-secret', signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as '8h' } }),
  ],
  controllers: [
    HealthController, AuthController, CatalogController, OrdersController, ProductionController, DeliveryController,
    InventoryController, FinanceController, DashboardController, AdminController, EventsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService, CatalogService, PricingService, OrderOps, OrdersService, ProductionService, DeliveryService,
    InventoryService, FinanceService, DashboardService, AdminService, JobsService,
  ],
})
export class AppModule {}
