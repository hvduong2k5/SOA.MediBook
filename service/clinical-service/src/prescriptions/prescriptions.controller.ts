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
import { ClinicalPageQueryDto } from '../encounters/encounters.dto';
import {
  CreateFollowUpDto,
  CreatePrescriptionDto,
  CreatePrescriptionItemDto,
  UpdateFollowUpDto,
  UpdatePrescriptionDto,
  UpdatePrescriptionItemDto,
} from './prescriptions.dto';
import { PrescriptionsService } from './prescriptions.service';

@Controller('api/v1/clinical')
@UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  // ---------------- PRESCRIPTIONS (5 ops) ----------------

  @Get('encounters/:encounterId/prescriptions')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listEncounterPrescriptions(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.prescriptionsService.listEncounterPrescriptions(req.principal!, encounterId, query);
  }

  @Post('encounters/:encounterId/prescriptions')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'prescription.manage')
  async createEncounterPrescription(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Body() dto: CreatePrescriptionDto,
  ) {
    const data = await this.prescriptionsService.createEncounterPrescription(
      req.principal!,
      encounterId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Patch('encounters/:encounterId/prescriptions/:prescriptionId')
  @RequirePermissions('ALL', 'prescription.manage')
  async updateEncounterPrescription(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('prescriptionId') prescriptionId: string,
    @Body() dto: UpdatePrescriptionDto,
  ) {
    const data = await this.prescriptionsService.updateEncounterPrescription(
      req.principal!,
      encounterId,
      prescriptionId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Get('prescriptions/:prescriptionId')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async getPrescription(
    @Req() req: AuthenticatedRequest,
    @Param('prescriptionId') prescriptionId: string,
  ) {
    const data = await this.prescriptionsService.getPrescription(req.principal!, prescriptionId);
    return { data, requestId: req.traceId };
  }

  @Post('prescriptions/:prescriptionId/issue')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ALL', 'prescription.manage')
  async issuePrescription(
    @Req() req: AuthenticatedRequest,
    @Param('prescriptionId') prescriptionId: string,
  ) {
    const data = await this.prescriptionsService.issuePrescription(req.principal!, prescriptionId);
    return { data, requestId: req.traceId };
  }

  // ---------------- PRESCRIPTION ITEMS (4 ops) ----------------

  @Get('prescriptions/:prescriptionId/items')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listPrescriptionItems(
    @Req() req: AuthenticatedRequest,
    @Param('prescriptionId') prescriptionId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.prescriptionsService.listPrescriptionItems(req.principal!, prescriptionId, query);
  }

  @Post('prescriptions/:prescriptionId/items')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'prescription.manage')
  async createPrescriptionItem(
    @Req() req: AuthenticatedRequest,
    @Param('prescriptionId') prescriptionId: string,
    @Body() dto: CreatePrescriptionItemDto,
  ) {
    const data = await this.prescriptionsService.createPrescriptionItem(
      req.principal!,
      prescriptionId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Patch('prescription-items/:itemId')
  @RequirePermissions('ALL', 'prescription.manage')
  async updatePrescriptionItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() dto: UpdatePrescriptionItemDto,
  ) {
    const data = await this.prescriptionsService.updatePrescriptionItem(
      req.principal!,
      itemId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Delete('prescription-items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ALL', 'prescription.manage')
  async deletePrescriptionItem(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
  ): Promise<void> {
    await this.prescriptionsService.deletePrescriptionItem(req.principal!, itemId);
  }

  // ---------------- FOLLOW-UPS (4 ops) ----------------

  @Get('encounters/:encounterId/follow-ups')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listEncounterFollowUps(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.prescriptionsService.listEncounterFollowUps(req.principal!, encounterId, query);
  }

  @Post('encounters/:encounterId/follow-ups')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async createEncounterFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateFollowUpDto,
  ) {
    const data = await this.prescriptionsService.createEncounterFollowUp(
      req.principal!,
      encounterId,
      idempotencyKey,
      dto,
      req.correlationId || req.traceId || 'unknown-correlation',
    );
    return { data, requestId: req.traceId };
  }

  @Patch('encounters/:encounterId/follow-ups/:followUpId')
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async updateEncounterFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('followUpId') followUpId: string,
    @Body() dto: UpdateFollowUpDto,
  ) {
    const data = await this.prescriptionsService.updateEncounterFollowUp(
      req.principal!,
      encounterId,
      followUpId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Delete('encounters/:encounterId/follow-ups/:followUpId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ALL', 'encounter.update.assigned')
  async deleteEncounterFollowUp(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('followUpId') followUpId: string,
  ): Promise<void> {
    await this.prescriptionsService.deleteEncounterFollowUp(
      req.principal!,
      encounterId,
      followUpId,
    );
  }

  // ---------------- VERSIONS & AUDIT LOGS (2 ops) ----------------

  @Get('encounters/:encounterId/versions')
  @RequirePermissions('ALL', 'clinical.audit.read')
  async listMedicalRecordVersions(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.prescriptionsService.listMedicalRecordVersions(req.principal!, encounterId, query);
  }

  @Get('encounters/:encounterId/audit-logs')
  @RequirePermissions('ALL', 'clinical.audit.read')
  async listClinicalAuditLogs(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.prescriptionsService.listClinicalAuditLogs(req.principal!, encounterId, query);
  }
}
