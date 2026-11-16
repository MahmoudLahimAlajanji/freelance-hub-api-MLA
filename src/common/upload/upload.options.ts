import { BadRequestException } from '@nestjs/common';
import { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, openSync, readSync, closeSync, unlink } from 'fs';
import { diskStorage } from 'multer';
import { basename, extname, join ,resolve} from 'path';

export const UPLOAD_ROOT = resolve(process.cwd(),process.env.UPLOAD_DIR ?? 'uploads');

type Kind = 'jpg' | 'png' | 'webp' | 'pdf' | 'zip';

const EXT_TO_KIND: Record<string, Kind> = {
  '.jpg': 'jpg', '.jpeg': 'jpg', '.png': 'png', '.webp': 'webp', '.pdf': 'pdf', '.zip': 'zip',
};
const MIME_TO_KIND: Record<string, Kind> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf',
  'application/zip': 'zip', 'application/x-zip-compressed': 'zip',
};

/** Real file signature check (the client-sent mimetype can be forged). */
function matchesSignature(path: string, kind: Kind): boolean {
  const buf = Buffer.alloc(12);
  const fd = openSync(path, 'r');
  try { readSync(fd, buf, 0, 12, 0); } finally { closeSync(fd); }
  switch (kind) {
    case 'jpg': return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'png': return buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case 'webp': return buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    case 'pdf': return buf.subarray(0, 4).toString() === '%PDF';
    case 'zip': return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  }
}

function buildOptions(folder: string, allowed: Kind[], maxBytes: number, label: string): MulterOptions {
  const dest = join(UPLOAD_ROOT, folder);
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  return {
    storage: diskStorage({
      destination: dest,
      filename: (_req, file, cb) => cb(null, randomUUID() + extname(file.originalname).toLowerCase()),
    }),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
      const byExt = EXT_TO_KIND[extname(file.originalname).toLowerCase()];
      const byMime = MIME_TO_KIND[file.mimetype];
      if (!byExt || !byMime || byExt !== byMime || !allowed.includes(byExt)) {
        return cb(new BadRequestException(`Invalid file type. Allowed: ${label}`), false);
      }
      cb(null, true);
    },
  };
}

export const avatarUploadOptions = () => buildOptions('avatars', ['jpg', 'png', 'webp'], 2 * 1024 * 1024, 'jpg, jpeg, png, webp (max 2MB)');
export const projectUploadOptions = () => buildOptions('projects', ['jpg', 'png', 'webp', 'pdf'], 5 * 1024 * 1024, 'image or PDF (max 5MB)');
export const deliveryUploadOptions = () => buildOptions('deliveries', ['pdf', 'zip'], 20 * 1024 * 1024, 'PDF or ZIP (max 20MB)');

/** Verifies content signature after saving; deletes the file and throws if it does not match. */
export function assertSignature(file: Express.Multer.File, allowed: Kind[]) {
  const kind = EXT_TO_KIND[extname(file.originalname).toLowerCase()];
  if (!kind || !allowed.includes(kind) || !matchesSignature(file.path, kind)) {
    removeUploaded(file.path);
    throw new BadRequestException('File content does not match its extension');
  }
}

export function removeUploaded(absolutePath: string) {
  unlink(absolutePath, () => undefined);
}

/** Deletes a stored file given its public URL (e.g. /uploads/avatars/x.png). Safe against traversal. */
export function removeByUrl(url?: string | null) {
  if (!url) return;
  const parts = url.split('/').filter(Boolean); // ['uploads', folder, name]
  if (parts.length !== 3 || parts[0] !== 'uploads') return;
  removeUploaded(join(UPLOAD_ROOT, parts[1], basename(parts[2])));
}
