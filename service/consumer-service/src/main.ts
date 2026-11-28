import 'reflect-metadata';
import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PiiSafeLogger } from './common/pii-safe-logger';
import { ProblemDetailsFilter, ProblemException } from './common/problem-details';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: new PiiSafeLogger(),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (validationErrors) => {
        const errors = validationErrors.map((e) => ({
          field: e.property,
          reason: Object.values(e.constraints ?? { invalid: 'Invalid value' }).join('; '),
        }));
        return new ProblemException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'VALIDATION_ERROR',
          'Dữ liệu đầu vào vi phạm quy tắc kiểm tra.',
          errors,
        );
      },
    }),
  );

  app.useGlobalFilters(new ProblemDetailsFilter());

  const port = Number(process.env.PORT || 8082);
  await app.listen(port);
}

void bootstrap();
