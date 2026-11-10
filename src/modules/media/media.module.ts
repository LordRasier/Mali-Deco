import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IdentityModule } from '../identity/identity.module';
import { AdminMediaController, PublicMediaController } from './http/media.controller';
import { MediaUploadInterceptor } from './http/media-upload.interceptor';
import { MediaRepository } from './persistence/media-repository';
import { MediaService } from './services/media-service';
import { mediaQuota } from './config/media-config';

@Module({
  imports: [IdentityModule],
  controllers: [AdminMediaController, PublicMediaController],
  providers: [
    { provide: MediaRepository, useFactory: (db?: DataSource) => new MediaRepository(db, mediaQuota(process.env)), inject: [{ token: DataSource, optional: true }] },
    { provide: MediaService, useFactory: (repository: MediaRepository) => new MediaService(repository), inject: [MediaRepository] },
    MediaUploadInterceptor,
  ],
})
export class MediaModule {}
