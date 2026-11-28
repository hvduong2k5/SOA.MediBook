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
  ChangeTestCatalogStatusDto,
  ChangeTestOrderItemStatusDto,
  CreateDiagnosticFileDto,
  CreateTestCatalogDto,
  CreateTestOrderDto,
  CreateTestOrderItemDto,
  CreateTestResultDto,
  ListTestCatalogQueryDto,
  UpdateTestCatalogDto,
  UpdateTestOrderDto,
  UpdateTestResultDto,
} from './diagnostics.dto';
import { DiagnosticsService } from './diagnostics.service';

@Controller('api/v1/clinical')
@UseGuards(JwtAuthGuard, PermissionsGuard, RateLimitGuard)
export class DiagnosticsController {
  constructor(private readonly diagnosticsService: DiagnosticsService) {}

  // ---------------- TEST CATALOG (5 ops) ----------------

  @Get('test-catalog')
  @RequirePermissions('ALL', 'diagnostic.manage')
  async listTestCatalog(@Query() query: ListTestCatalogQueryDto) {
    return this.diagnosticsService.listCatalog(query);
  }

  @Post('test-catalog')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'test_catalog.manage')
  async createTestCatalogItem(@Req() req: AuthenticatedRequest, @Body() dto: CreateTestCatalogDto) {
    const data = await this.diagnosticsService.createCatalogItem(dto);
    return { data, requestId: req.traceId };
  }

  @Get('test-catalog/:testCatalogItemId')
  @RequirePermissions('ALL', 'diagnostic.manage')
  async getTestCatalogItem(
    @Req() req: AuthenticatedRequest,
    @Param('testCatalogItemId') testCatalogItemId: string,
  ) {
    const data = await this.diagnosticsService.getCatalogItem(testCatalogItemId);
    return { data, requestId: req.traceId };
  }

  @Patch('test-catalog/:testCatalogItemId')
  @RequirePermissions('ALL', 'test_catalog.manage')
  async updateTestCatalogItem(
    @Req() req: AuthenticatedRequest,
    @Param('testCatalogItemId') testCatalogItemId: string,
    @Body() dto: UpdateTestCatalogDto,
  ) {
    const data = await this.diagnosticsService.updateCatalogItem(testCatalogItemId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch('test-catalog/:testCatalogItemId/status')
  @RequirePermissions('ALL', 'test_catalog.manage')
  async changeTestCatalogItemStatus(
    @Req() req: AuthenticatedRequest,
    @Param('testCatalogItemId') testCatalogItemId: string,
    @Body() dto: ChangeTestCatalogStatusDto,
  ) {
    const data = await this.diagnosticsService.changeCatalogItemStatus(testCatalogItemId, dto);
    return { data, requestId: req.traceId };
  }

  // ---------------- ENCOUNTER TEST ORDERS (3 ops) ----------------

  @Get('encounters/:encounterId/test-orders')
  @RequirePermissions('ANY', 'encounter.read.self', 'encounter.read.assigned')
  async listEncounterTestOrders(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.diagnosticsService.listEncounterTestOrders(req.principal!, encounterId, query);
  }

  @Post('encounters/:encounterId/test-orders')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'diagnostic.manage')
  async createEncounterTestOrder(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateTestOrderDto,
  ) {
    const data = await this.diagnosticsService.createEncounterTestOrder(
      req.principal!,
      encounterId,
      idempotencyKey,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Patch('encounters/:encounterId/test-orders/:testOrderId')
  @RequirePermissions('ALL', 'diagnostic.manage')
  async updateEncounterTestOrder(
    @Req() req: AuthenticatedRequest,
    @Param('encounterId') encounterId: string,
    @Param('testOrderId') testOrderId: string,
    @Body() dto: UpdateTestOrderDto,
  ) {
    const data = await this.diagnosticsService.updateEncounterTestOrder(
      req.principal!,
      encounterId,
      testOrderId,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  // ---------------- TEST ORDER ITEMS (3 ops) ----------------

  @Get('test-orders/:testOrderId/items')
  @RequirePermissions('ANY', 'diagnostic.manage', 'encounter.read.self', 'encounter.read.assigned')
  async listTestOrderItems(
    @Req() req: AuthenticatedRequest,
    @Param('testOrderId') testOrderId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.diagnosticsService.listTestOrderItems(req.principal!, testOrderId, query);
  }

  @Post('test-orders/:testOrderId/items')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'diagnostic.manage')
  async createTestOrderItem(
    @Req() req: AuthenticatedRequest,
    @Param('testOrderId') testOrderId: string,
    @Body() dto: CreateTestOrderItemDto,
  ) {
    const data = await this.diagnosticsService.createTestOrderItem(req.principal!, testOrderId, dto);
    return { data, requestId: req.traceId };
  }

  @Patch('test-order-items/:itemId/status')
  @RequirePermissions('ALL', 'diagnostic.manage')
  async changeTestOrderItemStatus(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Body() dto: ChangeTestOrderItemStatusDto,
  ) {
    const data = await this.diagnosticsService.changeTestOrderItemStatus(req.principal!, itemId, dto);
    return { data, requestId: req.traceId };
  }

  // ---------------- TEST RESULTS (4 ops) ----------------

  @Get('test-order-items/:itemId/results')
  @RequirePermissions('ANY', 'diagnostic.manage', 'encounter.read.self', 'encounter.read.assigned')
  async listTestResults(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.diagnosticsService.listTestResults(req.principal!, itemId, query);
  }

  @Post('test-order-items/:itemId/results')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'diagnostic.manage')
  async createTestResult(
    @Req() req: AuthenticatedRequest,
    @Param('itemId') itemId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateTestResultDto,
  ) {
    const data = await this.diagnosticsService.createTestResult(
      req.principal!,
      itemId,
      idempotencyKey,
      dto,
    );
    return { data, requestId: req.traceId };
  }

  @Patch('test-results/:resultId')
  @RequirePermissions('ALL', 'diagnostic.manage')
  async updateTestResult(
    @Req() req: AuthenticatedRequest,
    @Param('resultId') resultId: string,
    @Body() dto: UpdateTestResultDto,
  ) {
    const data = await this.diagnosticsService.updateTestResult(req.principal!, resultId, dto);
    return { data, requestId: req.traceId };
  }

  @Post('test-results/:resultId/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('ALL', 'diagnostic.manage')
  async verifyTestResult(
    @Req() req: AuthenticatedRequest,
    @Param('resultId') resultId: string,
  ) {
    const data = await this.diagnosticsService.verifyTestResult(req.principal!, resultId);
    return { data, requestId: req.traceId };
  }

  // ---------------- DIAGNOSTIC FILES (3 ops) ----------------

  @Get('test-results/:resultId/files')
  @RequirePermissions('ANY', 'diagnostic.manage', 'encounter.read.self', 'encounter.read.assigned')
  async listDiagnosticFiles(
    @Req() req: AuthenticatedRequest,
    @Param('resultId') resultId: string,
    @Query() query: ClinicalPageQueryDto,
  ) {
    return this.diagnosticsService.listDiagnosticFiles(req.principal!, resultId, query);
  }

  @Post('test-results/:resultId/files')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('ALL', 'diagnostic.manage')
  async createDiagnosticFile(
    @Req() req: AuthenticatedRequest,
    @Param('resultId') resultId: string,
    @Body() dto: CreateDiagnosticFileDto,
  ) {
    const data = await this.diagnosticsService.createDiagnosticFile(req.principal!, resultId, dto);
    return { data, requestId: req.traceId };
  }

  @Delete('diagnostic-files/:fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('ALL', 'diagnostic.manage')
  async deleteDiagnosticFile(
    @Req() req: AuthenticatedRequest,
    @Param('fileId') fileId: string,
  ): Promise<void> {
    await this.diagnosticsService.deleteDiagnosticFile(req.principal!, fileId);
  }
}
