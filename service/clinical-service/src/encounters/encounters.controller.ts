import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthenticatedRequest, JwtAuthGuard } from '../common/auth.guard';
import { PermissionsGuard, RequirePermissions } from '../common/permissions.decorator';
import { RateLimitGuard } from '../common/rate-limit.guard';
import { EncounterRecordsService } from './encounter-records.service';
import {
  ClinicalPageQueryDto,
  CreateClinicalNoteDto,
  CreateDiagnosisDto,
  CreateEncounterDto,
  CreateFindingDto,
  CreateSymptomDto,
  ListEncountersQueryDto,
  PublishEncounterDto,
  UpdateClinicalNoteDto,
  UpdateDiagnosisDto,
  UpdateEncounterDto,
  UpdateFindingDto,
  UpdateSymptomDto,
} from './encounters.dto';
import { EncountersService } from './encounters.service';

@Controller('api/v1/clinical/encounters')
@UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
export class EncountersController {
  constructor(
    private readonly encountersService: EncountersService,
    private readonly recordsService: EncounterRecordsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'encounter.create')
  async createEncounter(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateEncounterDto,
  ) {
    const data = await this.encountersService.createEncounter(
      req.principal!,
      idempotencyKey,
      dto,
      req.correlationId || req.traceId || 'unknown-correlation',
    );
    return { data, requestId: req.traceId };
  }

  @Get()
  @RequirePermissions('ANY', 'encounter.read.assigned', 'clinical.audit.read')
  async listEncounters(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListEncountersQueryDto,
  ) {
    return this.encountersService.listEncounters(req.principal!, query);
  }

  // Declared before :encounterId so /me is never parsed as encounterId
  @Get('me')
  @RequirePermissions('ALL', 'encounter.read.self')
  async listMyPublishedEncounters(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListEncountersQueryDto,
  ) {
    return this.encountersService.listMyPublishedEncounters(req.principal!, query);
  }

  @Get(':encounterId')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async getEncounter(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
  ) {
    const data = await this.encountersService.getEncounter(req.principal!, encounterId);
    return { data, requestId: req.traceId };
  }

  @Patch(':encounterId')
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async updateEncounter(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body() dto: UpdateEncounterDto,
  ) {
    const data = await this.encountersService.updateEncounter(req.principal!, encounterId, dto);
    return { data, requestId: req.traceId };
  }

  @Post(':encounterId/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ALL', 'encounter.publish')
  async completeEncounter(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
  ) {
    const data = await this.encountersService.completeEncounter(req.principal!, encounterId);
    return { data, requestId: req.traceId };
  }

  @Post(':encounterId/publish')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ALL', 'encounter.publish')
  async publishEncounter(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body() dto: PublishEncounterDto,
  ) {
    const data = await this.encountersService.publishEncounter(
      req.principal!,
      encounterId,
      dto,
      req.correlationId || req.traceId || 'unknown-correlation',
    );
    return { data, requestId: req.traceId };
  }

  // ---------------- NOTES ----------------

  @Get(':encounterId/notes')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listEncounterNotes(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.recordsService.listNotes(req.principal!, encounterId, query);
  }

  @Post(':encounterId/notes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async createEncounterNote(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateClinicalNoteDto,
  ) {
    const data = await this.recordsService.createNote(req.principal!, encounterId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch(':encounterId/notes/:noteId')
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async updateEncounterNote(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateClinicalNoteDto,
  ) {
    const data = await this.recordsService.updateNote(req.principal!, encounterId, noteId, dto);
    return { data, requestId: req.traceId };
  }

  @Delete(':encounterId/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async deleteEncounterNote(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    await this.recordsService.deleteNote(req.principal!, encounterId, noteId);
  }

  // ---------------- SYMPTOMS ----------------

  @Get(':encounterId/symptoms')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listEncounterSymptoms(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.recordsService.listSymptoms(req.principal!, encounterId, query);
  }

  @Post(':encounterId/symptoms')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async createEncounterSymptom(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateSymptomDto,
  ) {
    const data = await this.recordsService.createSymptom(req.principal!, encounterId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch(':encounterId/symptoms/:symptomId')
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async updateEncounterSymptom(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('symptomId') symptomId: string,
    @Body() dto: UpdateSymptomDto,
  ) {
    const data = await this.recordsService.updateSymptom(req.principal!, encounterId, symptomId, dto);
    return { data, requestId: req.traceId };
  }

  @Delete(':encounterId/symptoms/:symptomId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async deleteEncounterSymptom(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('symptomId') symptomId: string,
  ): Promise<void> {
    await this.recordsService.deleteSymptom(req.principal!, encounterId, symptomId);
  }

  // ---------------- FINDINGS ----------------

  @Get(':encounterId/findings')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listEncounterFindings(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.recordsService.listFindings(req.principal!, encounterId, query);
  }

  @Post(':encounterId/findings')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async createEncounterFinding(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateFindingDto,
  ) {
    const data = await this.recordsService.createFinding(req.principal!, encounterId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch(':encounterId/findings/:findingId')
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async updateEncounterFinding(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('findingId') findingId: string,
    @Body() dto: UpdateFindingDto,
  ) {
    const data = await this.recordsService.updateFinding(req.principal!, encounterId, findingId, dto);
    return { data, requestId: req.traceId };
  }

  @Delete(':encounterId/findings/:findingId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async deleteEncounterFinding(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('findingId') findingId: string,
  ): Promise<void> {
    await this.recordsService.deleteFinding(req.principal!, encounterId, findingId);
  }

  // ---------------- DIAGNOSES ----------------

  @Get(':encounterId/diagnoses')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listEncounterDiagnoses(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.recordsService.listDiagnoses(req.principal!, encounterId, query);
  }

  @Post(':encounterId/diagnoses')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'diagnosis.manage')
  async createEncounterDiagnosis(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreateDiagnosisDto,
  ) {
    const data = await this.recordsService.createDiagnosis(req.principal!, encounterId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch(':encounterId/diagnoses/:diagnosisId')
  @RequirePermissions('ALL', 'diagnosis.manage')
  async updateEncounterDiagnosis(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('diagnosisId') diagnosisId: string,
    @Body() dto: UpdateDiagnosisDto,
  ) {
    const data = await this.recordsService.updateDiagnosis(req.principal!, encounterId, diagnosisId, dto);
    return { data, requestId: req.traceId };
  }

  @Delete(':encounterId/diagnoses/:diagnosisId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ALL', 'diagnosis.manage')
  async deleteEncounterDiagnosis(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('diagnosisId') diagnosisId: string,
  ): Promise<void> {
    await this.recordsService.deleteDiagnosis(req.principal!, encounterId, diagnosisId);
  }
}
