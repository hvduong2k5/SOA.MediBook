import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RateLimitGuard } from './common/rate-limit.guard';
import { TraceIdMiddleware } from './common/trace-id.middleware';
import { PatientsModule } from './patients/patients.module';

@Module({
  imports: [PatientsModule],
  providers: [RateLimitGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
