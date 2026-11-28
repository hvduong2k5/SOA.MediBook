import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum PrescriptionStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CANCELLED = 'CANCELLED',
}

export class CreatePrescriptionItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  medicationCode?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  medicationName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  strength?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  dosage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  frequency?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number | null;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @IsString()
  usageInstruction?: string | null;
}

export class UpdatePrescriptionItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  medicationCode?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  medicationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  strength?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  dosage?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  route?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  frequency?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  durationDays?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @IsOptional()
  @IsString()
  usageInstruction?: string | null;
}

export class CreatePrescriptionDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  prescriptionCode?: string;

  @IsOptional()
  @IsString()
  instructions?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  items?: CreatePrescriptionItemDto[];
}

export class UpdatePrescriptionDto {
  @IsOptional()
  @IsString()
  instructions?: string | null;

  @IsOptional()
  @IsEnum(PrescriptionStatus)
  status?: PrescriptionStatus;
}

export class CreateFollowUpDto {
  @IsDateString()
  reminderAt!: string;

  @IsOptional()
  @IsDateString()
  recommendedDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  recommendedAfterDays?: number | null;

  @IsOptional()
  @IsString()
  instructions?: string | null;
}

export class UpdateFollowUpDto {
  @IsOptional()
  @IsDateString()
  recommendedDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  recommendedAfterDays?: number | null;

  @IsOptional()
  @IsString()
  instructions?: string | null;
}
