import {
  Body,
  Controller,
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
import {
  CreatePatientDto,
  ListPatientsQueryDto,
  UpdatePatientDto,
} from './patients.dto';
import { PatientsService } from './patients.service';

@Controller('api/v1/patients')
@UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  // Declared before :patientId so /me is never parsed as patientId
  @Get('me')
  @RequirePermissions('ALL', 'patient.read.self')
  async getMyPatientProfile(@Req() req: AuthenticatedRequest) {
    const data = await this.patientsService.getMyProfile(req.principal!);
    return { data, requestId: req.traceId };
  }

  @Get()
  @RequirePermissions('ANY', 'patient.read.assigned', 'patient.read.all')
  async listPatients(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListPatientsQueryDto,
  ) {
    return this.patientsService.listPatients(req.principal!, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'patient.create')
  async createPatient(
    @Req() req: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreatePatientDto,
  ) {
    const data = await this.patientsService.createPatient(
      req.principal!,
      idempotencyKey,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Get(':patientId')
  @RequirePermissions('ANY', 'patient.read.self', 'patient.read.assigned', 'patient.read.all')
  async getPatient(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
  ) {
    const data = await this.patientsService.getPatient(req.principal!, patientId);
    return { data, requestId: req.traceId };
  }

  @Patch(':patientId')
  @RequirePermissions('ANY', 'patient.update.self', 'patient.update.all')
  async updatePatient(
    @Req() req: AuthenticatedRequest,
    @Param('patientId') patientId: string,
    @Body() dto: UpdatePatientDto,
  ) {
    const data = await this.patientsService.updatePatient(
      req.principal!,
      patientId,
      dto,
    );
    return { data, requestId: req.traceId };
  }
}
