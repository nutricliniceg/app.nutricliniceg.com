import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '@/lib/env';

const SECRET = new TextEncoder().encode(env.JWT_SECRET);

export interface TokenPayload extends JWTPayload {
  sub: string;
  role: 'doctor' | 'admin' | 'super_admin';
  email: string;
  jti: string;
}

export async function signToken(payload: Omit<TokenPayload, 'jti' | 'exp' | 'iat'>): Promise<string> {
  const jti = crypto.randomUUID();
  return await new SignJWT({ ...payload, jti })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .setJti(jti)
    .sign(SECRET);
}

export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as TokenPayload;
  } catch {
    return null;
  }
}

export async function verifyTokenWithPayload(token: string): Promise<{ payload: TokenPayload; valid: true } | { valid: false }> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return { payload: payload as unknown as TokenPayload, valid: true };
  } catch {
    return { valid: false };
  }
}