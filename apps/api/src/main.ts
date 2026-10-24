process.env.TZ ??= process.env.APP_TIMEZONE ?? 'Africa/Cairo';
import 'dotenv/config';
import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

export async function createApp() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: false }));
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder()
    .setTitle('CateringPro API').setDescription('Catering company portal - REST API (Business Requirements v4.0)').setVersion('1.0').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  return app;
}

if (require.main === module) {
  createApp().then(async (app) => {
    const port = Number(process.env.PORT ?? 3000);
    await app.listen(port);
    Logger.log(`API on http://localhost:${port}/api  -  docs: http://localhost:${port}/api/docs`, 'Bootstrap');
  });
}
