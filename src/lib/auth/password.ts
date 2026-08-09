import bcrypt from 'bcryptjs';

/**
 * bcrypt cost factor. 12 is the current sane default: ~250ms on typical
 * serverless CPU, expensive enough to make offline cracking of a leaked hash
 * impractical, cheap enough not to blow a Lambda timeout on login.
 */
const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

/**
 * Constant-time comparison via bcrypt. Callers must NOT short-circuit on a
 * missing user before calling this - see `login` route, which hashes a dummy
 * password for unknown emails to keep response timing uniform.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
