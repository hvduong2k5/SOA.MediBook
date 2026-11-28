import {
  Body,
  Controller,
  Delete,
  Get,
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
import {
  CreateEmergencyContactDto,
  CreatePatientAddressDto,
  CreatePatientContactDto,
  ListContactsQueryDto,
  SubresourcePageQueryDto,
  UpdateEmergencyContactDto,
  UpdatePatientAddressDto,
  UpdatePatientContactDto,
} from './subresources.dto';
import { SubresourcesService } from './subresources.service';

@Controller('api/v1/patients/:patientId')
@UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
export class SubresourcesController {
  constructor(private readonly subresourcesService: SubresourcesService) {}

  // ---------------- CONTACTS ----------------

  @Get('contacts')
  @RequirePermissions('ANY', 'patient.contact.manage.self', 'patient.contact.manage.all')
  async listPatientContacts(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query() query: ListContactsQueryDto,
  ) {
    return this.subresourcesService.listContacts(req.principal!, patientId, query);
  }

  @Post('contacts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ANY', 'patient.contact.manage.self', 'patient.contact.manage.all')
  async createPatientContact(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreatePatientContactDto,
  ) {
    const data = await this.subresourcesService.createContact(req.principal!, patientId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch('contacts/:contactId')
  @RequirePermissions('ANY', 'patient.contact.manage.self', 'patient.contact.manage.all')
  async updatePatientContact(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdatePatientContactDto,
  ) {
    const data = await this.subresourcesService.updateContact(
      req.principal!,
      patientId,
      contactId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Delete('contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ANY', 'patient.contact.manage.self', 'patient.contact.manage.all')
  async deletePatientContact(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('contactId') contactId: string,
  ): Promise<void> {
    await this.subresourcesService.deleteContact(req.principal!, patientId, contactId);
  }

  // ---------------- ADDRESSES ----------------

  @Get('addresses')
  @RequirePermissions('ANY', 'patient.address.manage.self', 'patient.address.manage.all')
  async listPatientAddresses(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query() query: SubresourcePageQueryDto,
  ) {
    return this.subresourcesService.listAddresses(req.principal!, patientId, query);
  }

  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ANY', 'patient.address.manage.self', 'patient.address.manage.all')
  async createPatientAddress(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreatePatientAddressDto,
  ) {
    const data = await this.subresourcesService.createAddress(req.principal!, patientId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch('addresses/:addressId')
  @RequirePermissions('ANY', 'patient.address.manage.self', 'patient.address.manage.all')
  async updatePatientAddress(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('addressId') addressId: string,
    @Body() dto: UpdatePatientAddressDto,
  ) {
    const data = await this.subresourcesService.updateAddress(
      req.principal!,
      patientId,
      addressId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Delete('addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ANY', 'patient.address.manage.self', 'patient.address.manage.all')
  async deletePatientAddress(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('addressId') addressId: string,
  ): Promise<void> {
    await this.subresourcesService.deleteAddress(req.principal!, patientId, addressId);
  }

  // ---------------- EMERGENCY CONTACTS ----------------

  @Get('emergency-contacts')
  @RequirePermissions('ANY', 'patient.emergency.manage.self', 'patient.emergency.manage.all')
  async listEmergencyContacts(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query() query: SubresourcePageQueryDto,
  ) {
    return this.subresourcesService.listEmergencyContacts(req.principal!, patientId, query);
  }

  @Post('emergency-contacts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ANY', 'patient.emergency.manage.self', 'patient.emergency.manage.all')
  async createEmergencyContact(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: CreateEmergencyContactDto,
  ) {
    const data = await this.subresourcesService.createEmergencyContact(
      req.principal!,
      patientId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Patch('emergency-contacts/:emergencyContactId')
  @RequirePermissions('ANY', 'patient.emergency.manage.self', 'patient.emergency.manage.all')
  async updateEmergencyContact(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('emergencyContactId') emergencyContactId: string,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    const data = await this.subresourcesService.updateEmergencyContact(
      req.principal!,
      patientId,
      emergencyContactId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Delete('emergency-contacts/:emergencyContactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ANY', 'patient.emergency.manage.self', 'patient.emergency.manage.all')
  async deleteEmergencyContact(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Param('emergencyContactId') emergencyContactId: string,
  ): Promise<void> {
    await this.subresourcesService.deleteEmergencyContact(
      req.principal!,
      patientId,
      emergencyContactId,
    );
  }

  // ---------------- AUDIT LOGS ----------------

  @Get('audit-logs')
  @RequirePermissions('ALL', 'patient.audit.read')
  async listPatientProfileAudit(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Query() query: SubresourcePageQueryDto,
  ) {
    return this.subresourcesService.listAuditLogs(req.principal!, patientId, query);
  }
}
