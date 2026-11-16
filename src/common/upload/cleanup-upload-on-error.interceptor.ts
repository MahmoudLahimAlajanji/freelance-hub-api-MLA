import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { catchError, throwError } from 'rxjs';
import { removeUploaded } from './upload.options';

/** If the request fails after multer saved the file (e.g. validation error), delete the file. */
@Injectable()
export class CleanupUploadOnError implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest();
    return next.handle().pipe(
      catchError((e) => {
        if (req.file?.path) removeUploaded(req.file.path);
        return throwError(() => e);
      }),
    );
  }
}