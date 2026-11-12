import 'reflect-metadata';
import { loadEnvFile } from 'node:process';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttp } from './presentation/configure-http';
import { loadZipnovaEnvironment } from './modules/shipping/providers/zipnova/local-credentials';
import { loadLocalPaymentCredentials } from './modules/payments/local-credentials';
import { loadLocalEmailCredentials } from './modules/order-emails/email-config';

async function bootstrap() {
  // Local convenience only: direct starts, tests and production keep explicit configuration.
  // https://nodejs.org/docs/latest-v24.x/api/process.html#processloadenvfilepath
  if (process.env.npm_lifecycle_event === 'dev' && (!process.env.NODE_ENV || process.env.NODE_ENV === 'development')) {
    try { loadEnvFile('.env'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  loadZipnovaEnvironment(process.env);
  loadLocalPaymentCredentials(process.env);
  loadLocalEmailCredentials(process.env);
  // Database registration reads the environment while this module is evaluated.
  const { applicationModule } = await import('./app.module');
  const env = Object.freeze({ ...process.env });
  const port = Number(env.PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  const app = await NestFactory.create<NestExpressApplication>(applicationModule(env));
  configureHttp(app);
  await app.listen(port, '127.0.0.1');
}

void bootstrap();
