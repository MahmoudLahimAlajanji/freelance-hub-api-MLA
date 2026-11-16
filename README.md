# FreelanceHub API
NestJS + Prisma 7 + PostgreSQL. Docs: `http://localhost:3000/api/docs`

## Setup
```bash
cp .env.example .env        # fill DATABASE_URL and the JWT secrets
npm ci
npx prisma generate
npx prisma migrate deploy
npx prisma db seed          # creates the ADMIN account + default categories
npm run build && npm run start:prod
```
Seed uses ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from `.env` (change the password).

## Design decisions
- Admin accounts are created by the seed only; registration accepts CLIENT/FREELANCER.
- Auth: Access token 15m + Refresh token 7d with rotation and reuse detection; sessions stored hashed (SHA-256).
- Escrow: accepting a bid and approving a delivery run in a single DB transaction.
- Platform fee 10% goes to the admin wallet.
- Categories are cached (cache-aside) and invalidated on every change.
- Avatars/project files are public under /uploads; delivery files are private (GET /api/projects/:id/delivery/file).
- Public project list shows OPEN projects by default.
- Admins can access delivery files (for moderation/dispute handling); other users only if they are the project owner or the winning freelancer.

## Environment variables
DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, CORS_ORIGIN (optional),
PORT (optional), TRUST_PROXY=true (only behind a reverse proxy),
ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME (seed)

## More design decisions
- Login is limited to 5 attempts/minute per IP; register/create-project/deliver are limited to 100/hour per IP; global limit is 100 requests/minute per IP.
- Delivery accepts PDF or ZIP only (max 20MB). Project attachment: image or PDF (max 5MB). Avatar: image only (max 2MB). File content is verified, not only the extension.
- A project can be edited/deleted only while OPEN; a bid can be edited/deleted only while PENDING on an OPEN project.
- GET /api/projects/:id/delivery returns delivery details (status, notes); the file itself is at /delivery/file.
- Known limitation: there is no cancel/refund flow after a bid is accepted (not required by the brief).

- Refresh tokens are stored hashed with SHA-256 (not bcrypt) on purpose: they are long, high-entropy, signed JWTs, so a slow hash adds no protection, and bcrypt would silently truncate the input at 72 bytes (the first 72 characters of a JWT are almost identical across rotations), which would break reuse detection. Passwords are hashed with bcrypt (cost 10).