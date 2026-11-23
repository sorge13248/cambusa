import './load-env.js';
import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { resolveDatabasePath } from './load-env.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    cors: {
      origin: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:4200')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      credentials: true,
    },
  });

  app.setGlobalPrefix('api', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Cambusa API server listening on http://localhost:${port}`);
  console.log(`Using database at: ${resolveDatabasePath()}`);
}

void bootstrap();
