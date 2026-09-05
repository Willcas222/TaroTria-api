import { randomBytes } from 'crypto';

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}
