import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum TestOrderStatus {
  REQUESTED = 'REQUESTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum TestResultStatus {
  PENDING = 'PENDING',
  PRELIMINARY = 'PRELIMINARY',
  FINAL = 'FINAL',
  AMENDED = 'AMENDED',
}

export const ALLOWED_DIAGNOSTIC_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/dicom',
] as const;

export const MAX_DIAGNOSTIC_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export class CreateTestCatalogDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  testCode!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  testName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateTestCatalogDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  testName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class ChangeTestCatalogStatusDto {
  @IsBoolean()
  isActive!: boolean;
}

export class ListTestCatalogQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  size?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}

export class CreateTestOrderItemDto {
  @IsOptional()
  @IsUUID()
  testCatalogId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  testCodeSnapshot?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  testNameSnapshot?: string;
}

export class CreateTestOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  orderCode?: string;

  @IsOptional()
  @IsString()
  clinicalIndication?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTestOrderItemDto)
  items?: CreateTestOrderItemDto[];
}

export class UpdateTestOrderDto {
  @IsOptional()
  @IsEnum(TestOrderStatus)
  status?: TestOrderStatus;

  @IsOptional()
  @IsString()
  clinicalIndication?: string | null;
}

export class ChangeTestOrderItemStatusDto {
  @IsEnum(TestOrderStatus)
  status!: TestOrderStatus;
}

export class CreateTestResultDto {
  @IsOptional()
  @IsEnum(TestResultStatus)
  resultStatus?: TestResultStatus;

  @IsOptional()
  @IsString()
  resultSummary?: string | null;

  @IsOptional()
  @IsObject()
  resultData?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceSystem?: string;
}

export class UpdateTestResultDto {
  @IsOptional()
  @IsEnum(TestResultStatus)
  resultStatus?: TestResultStatus;

  @IsOptional()
  @IsString()
  resultSummary?: string | null;

  @IsOptional()
  @IsObject()
  resultData?: Record<string, unknown>;
}

export class CreateDiagnosticFileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  objectStorageKey!: string;

  @IsIn(ALLOWED_DIAGNOSTIC_CONTENT_TYPES)
  contentType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DIAGNOSTIC_FILE_BYTES)
  fileSizeBytes!: number;
}
