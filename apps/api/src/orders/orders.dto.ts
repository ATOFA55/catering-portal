import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CustomizationDto { @IsInt() optionId: number; @IsInt() @Min(1) qty: number; }

export class LineDto {
  @IsInt() productId: number;
  @IsInt() @Min(1) qty: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CustomizationDto) customizations?: CustomizationDto[];
}

export class CreateOrderDto {
  @IsIn(['DAILY', 'EVENT']) type: 'DAILY' | 'EVENT';
  @IsIn(['DIRECT', 'PACKAGE', 'CUSTOM', 'EVENT']) mode: 'DIRECT' | 'PACKAGE' | 'CUSTOM' | 'EVENT';
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => LineDto) lines: LineDto[];
  @IsInt() zoneId: number;
  @IsDateString() deliveryAt: string;
  @IsOptional() @IsInt() addressId?: number;
  @IsOptional() @IsString() @MaxLength(300) addressText?: string;
  @IsOptional() @IsString() @MaxLength(120) contactName?: string;
  @IsOptional() @IsString() @MaxLength(40) contactPhone?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsString() @MaxLength(500) allergyNotes?: string;
  @IsOptional() @IsInt() @Min(1) guestCount?: number;
  @IsOptional() @IsString() @MaxLength(300) eventLocation?: string;
  @IsOptional() @IsDateString() setupAt?: string;
  @IsOptional() @IsInt() customerId?: number;
  @IsOptional() @IsBoolean() submit?: boolean;
}

export class ListOrdersQuery {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() delayed?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
  @IsOptional() @IsIn(['delivery', 'created']) sort?: string;
  @IsOptional() @IsIn(['asc', 'desc']) dir?: string;
}

export class ProposeChangeDto {
  @IsOptional() @IsDateString() deliveryAt?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsString() @MaxLength(300) reason: string;
}
export class RespondDto { @IsBoolean() approve: boolean; }
export class CancelDto { @IsOptional() @IsString() @MaxLength(300) reason?: string; }
export class DelayDto { @IsBoolean() delayed: boolean; @IsOptional() @IsDateString() delayedUntil?: string; @IsOptional() @IsString() reason?: string; }
export class RateDto {
  @IsInt() @Min(1) @Max(5) food: number; @IsInt() @Min(1) @Max(5) punctuality: number; @IsInt() @Min(1) @Max(5) service: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
