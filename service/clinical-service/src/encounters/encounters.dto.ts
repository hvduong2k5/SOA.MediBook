import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export enum EncounterStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_RESULTS = 'PENDING_RESULTS',
  READY_FOR_REVIEW = 'READY_FOR_REVIEW',
  COMPLETED = 'COMPLETED',
  PUBLISHED = 'PUBLISHED',
}

export enum DiagnosisKind {
  PRIMARY = 'PRIMARY',
  SECONDARY = 'SECONDARY',
}

export class ClinicalPageQueryDto {
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
}

export class ListEncountersQueryDto extends ClinicalPageQueryDto {
  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsUUID()
  doctorId?: string;

  @IsOptional()
  @IsEnum(EncounterStatus)
  status?: EncounterStatus;
}

export class CreateEncounterDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  encounterCode?: string;

  @IsUUID()
  queueTicketId!: string;

  @IsUUID()
  patientId!: string;

  @IsUUID()
  doctorId!: string;

  @IsOptional()
  @IsUUID()
  specialtyId?: string | null;

  @IsOptional()
  @IsUUID()
  branchId?: string | null;

  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @IsOptional()
  @IsString()
  chiefComplaint?: string | null;
}

export class UpdateEncounterDto {
  @IsOptional()
  @IsString()
  chiefComplaint?: string | null;

  @IsOptional()
  @IsEnum(EncounterStatus)
  status?: EncounterStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class PublishEncounterDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  versionReason?: string;
}

export class CreateClinicalNoteDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  noteType!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class UpdateClinicalNoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  noteType?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;
}

export class CreateSymptomDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  symptomName!: string;

  @IsOptional()
  @IsDateString()
  onsetAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  severity?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class UpdateSymptomDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  symptomName?: string;

  @IsOptional()
  @IsDateString()
  onsetAt?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  severity?: number | null;

  @IsOptional()
  @IsString()
  description?: string | null;
}

export class CreateFindingDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bodySystem?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  findingName!: string;

  @IsOptional()
  @IsString()
  findingValue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceRange?: string | null;

  @IsOptional()
  @IsBoolean()
  isAbnormal?: boolean | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateFindingDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bodySystem?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  findingName?: string;

  @IsOptional()
  @IsString()
  findingValue?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  unit?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceRange?: string | null;

  @IsOptional()
  @IsBoolean()
  isAbnormal?: boolean | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class CreateDiagnosisDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  diagnosisCode?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  diagnosisName!: string;

  @IsOptional()
  @IsEnum(DiagnosisKind)
  diagnosisKind?: DiagnosisKind;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateDiagnosisDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  diagnosisCode?: string | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  diagnosisName?: string;

  @IsOptional()
  @IsEnum(DiagnosisKind)
  diagnosisKind?: DiagnosisKind;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
