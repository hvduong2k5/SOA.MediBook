import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RateLimitGuard } from './common/rate-limit.guard';
import { TraceIdMiddleware } from './common/trace-id.middleware';
import { DiagnosticsModule } from './diagnostics/diagnostics.module';
import { EncountersModule } from './encounters/encounters.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';

@Module({
  imports: [EncountersModule, DiagnosticsModule, PrescriptionsModule],
  providers: [RateLimitGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
