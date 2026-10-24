import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class ComponentDto { @IsInt() itemId: number; @IsNumber() @Min(0.01) qty: number; }
export class OptionDto {
  @IsIn(['SUBSTITUTION', 'EXTRA']) kind: 'SUBSTITUTION' | 'EXTRA';
  @IsString() label: string; @IsOptional() @IsString() labelAr?: string;
  @IsOptional() @IsInt() fromItemId?: number; @IsInt() toItemId: number; @IsNumber() priceDelta: number;
}
export class RecipeDto { @IsInt() ingredientId: number; @IsNumber() @Min(0) qtyPerPortion: number; }

export class ProductDto {
  @IsString() @MaxLength(40) sku: string;
  @IsIn(['FOOD_ITEM', 'PACKAGE', 'EVENT_MENU', 'SERVICE']) type: 'FOOD_ITEM' | 'PACKAGE' | 'EVENT_MENU' | 'SERVICE';
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() nameAr?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() descriptionAr?: string;
  @IsInt() categoryId: number;
  @IsNumber() @Min(0) price: number;
  @IsString() unit: string;
  @IsOptional() @IsInt() @Min(1) minQty?: number;
  @IsOptional() @IsInt() @Min(0) leadTimeHours?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) dietaryTags?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) allergens?: string[];
  @IsOptional() @IsString() image?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ComponentDto) components?: ComponentDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RecipeDto) recipe?: RecipeDto[];
}
