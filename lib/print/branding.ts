// SET-05 white-label resolution (pure). `clinic_logo_url` holds either an
// https:// URL or a `file:<FileAssetId>` reference for uploaded logos; the
// reference is minted into a fresh 15-min signed URL at render time so an
// uploaded logo change is reflected on the next print. Unset → platform
// fallback branding.

export const PLATFORM_BRAND = { name: 'NutriClinicEG', logoUrl: null as string | null };

export interface BrandView {
  clinicName: string;
  doctorName: string;
  logoUrl: string | null;
  isFallback: boolean;
}

export function resolveLogoReference(stored: string | null | undefined, mintFileUrl: (fileId: string) => string): string | null {
  if (!stored) return null;
  if (stored.startsWith('file:')) {
    const fileId = stored.slice('file:'.length);
    if (!fileId) return null;
    return mintFileUrl(fileId);
  }
  if (stored.startsWith('https://')) return stored;
  return null;
}

export function resolveBrand(
  doctor: { name: string; clinic_name: string | null; clinic_logo_url: string | null },
  mintFileUrl: (fileId: string) => string
): BrandView {
  const logoUrl = resolveLogoReference(doctor.clinic_logo_url, mintFileUrl);
  const clinicName = doctor.clinic_name?.trim() || null;
  if (!clinicName && !logoUrl) {
    return { clinicName: PLATFORM_BRAND.name, doctorName: doctor.name, logoUrl: null, isFallback: true };
  }
  return { clinicName: clinicName ?? PLATFORM_BRAND.name, doctorName: doctor.name, logoUrl, isFallback: false };
}
