import { Body, Controller, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AuthUser } from '../common/auth.types';
import { CurrentUser, RequirePermission } from '../common/decorators';
import { ProductDto } from './catalog.dto';
import { CatalogService } from './catalog.service';

class ActiveDto { @IsBoolean() isActive: boolean; }

@ApiTags('Catalog') @ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private svc: CatalogService) {}
  @Get('products') @RequirePermission('catalog.view', 'orders.create') list(@CurrentUser() u: AuthUser, @Query('all') all?: string) { return this.svc.list(u, all === 'true'); }
  @Get('products/:id') @RequirePermission('catalog.view') get(@CurrentUser() u: AuthUser, @Param('id', ParseIntPipe) id: number) { return this.svc.get(u, id); }
  @Get('categories') @RequirePermission('catalog.view') categories() { return this.svc.categories(); }
  @Get('zones') @RequirePermission('catalog.view', 'orders.create', 'delivery.manage') zones() { return this.svc.zones(); }
  @Get('ingredients') @RequirePermission('catalog.manage', 'inventory.view') ingredients() { return this.svc.ingredients(); }
  @Post('products') @RequirePermission('catalog.manage') create(@Body() dto: ProductDto) { return this.svc.save(null, dto); }
  @Put('products/:id') @RequirePermission('catalog.manage') update(@Param('id', ParseIntPipe) id: number, @Body() dto: ProductDto) { return this.svc.save(id, dto); }
  @Post('products/:id/active') @RequirePermission('catalog.manage') active(@Param('id', ParseIntPipe) id: number, @Body() dto: ActiveDto) { return this.svc.setActive(id, dto.isActive); }
}
