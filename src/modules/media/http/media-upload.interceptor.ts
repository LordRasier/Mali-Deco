import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from '@nestjs/common';
import type { EventEmitter } from 'node:events';
import { FileInterceptor } from '@nestjs/platform-express';
import { Observable, defer, finalize, from, fromEvent, merge, switchMap, takeUntil } from 'rxjs';

const Multipart = FileInterceptor('file', {
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, parts: 2, fieldSize: 1200 },
});

interface Lease { claimed: boolean; release(): void }
const leaseKey = Symbol('media upload lease');
let active = false;
type LeasedFile = { [leaseKey]?: Lease };

/** Transfer the slot to processing before its first await; release it in finally. */
export function claimMediaUpload(file: unknown): () => void {
  if (file === null || typeof file !== 'object') return () => undefined;
  const lease = (file as LeasedFile)[leaseKey];
  if (!lease) return () => undefined; // Direct service calls need no HTTP admission.
  if (lease.claimed) throw new Error('Upload lease already claimed');
  lease.claimed = true;
  return () => lease.release();
}

// Guards execute before interceptors, so unauthorized bodies never reach Multer.
@Injectable()
export class MediaUploadInterceptor implements NestInterceptor {
  private readonly multipart = new Multipart();

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return defer(() => {
      if (active) throw new HttpException('Too many uploads', 429);
      active = true;
      let released = false;
      const lease: Lease = { claimed: false, release: () => { if (!released) { released = true; active = false; } } };
      return defer(() => {
        const http = context.switchToHttp();
        const request = http.getRequest<EventEmitter & { file?: LeasedFile }>();
        const disconnected = merge(fromEvent(request, 'aborted'), fromEvent(http.getResponse(), 'close'));
        return defer(() => from(this.multipart.intercept(context, next))).pipe(
          switchMap(stream => {
            if (request.file) Object.defineProperty(request.file, leaseKey, { value: lease, configurable: true });
            return stream;
          }),
          takeUntil(disconnected),
        );
      }).pipe(finalize(() => { if (!lease.claimed) lease.release(); }));
    });
  }
}
