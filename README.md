# NutriClinicEG

B2B SaaS platform for nutrition clinics in Egypt.

## Local Development Setup

1. **Prerequisites**:
   - Node.js v24+
   - MySQL 8

2. **Setup**:
   - Clone the repository.
   - Install dependencies: `npm install`.
   - Copy `.env.example` to `.env` and configure your local settings.
   - Run database migrations: `npm run db:migrate`.
   - Seed the database (development only): `npm run db:seed`.

3. **Running**:
   - Development server: `npm run dev`.
   - Build for production: `npm run build`.
   - Start production server: `npm run start`.

4. **Testing & Quality**:
   - Run tests: `npm test`.
   - Linting: `npm run lint`.
   - Type checking: `npm run typecheck`.

## File Storage (P10, §6.5)

- Uploads live **outside the webroot**. Configure `STORAGE_DIR` (e.g.
  `/home/user/storage/uploads`); default is `./.data/uploads` for local dev.
- On shared hosting create it once with no execute permission:
  `mkdir -p /home/user/storage/uploads && chmod 700 /home/user/storage/uploads`.
- Only `image/jpeg`, `image/png`, `image/webp` (≤10MB) and `application/pdf`
  (≤20MB) are accepted; the real type is sniffed from magic bytes and images
  are re-encoded with `sharp` to strip embedded payloads.
- Downloads work only through HMAC-signed 15-minute URLs minted with
  `FILE_URL_SECRET` (min 16 chars).
