/**
 * Collision-resistant ids that work without `crypto.randomUUID` (older Safari,
 * and any non-secure origin).
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const cryptoObj = globalThis.crypto
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes)
    return bytes
  }
  for (let i = 0; i < length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  return bytes
}

/**
 * Time-prefixed id: sorts roughly by creation order, which keeps debugging and
 * stable list ordering easy, with 10 random chars of entropy after it.
 */
export function createId(prefix: string): string {
  const time = Date.now().toString(36).padStart(9, '0')
  const bytes = randomBytes(10)
  let suffix = ''
  for (const byte of bytes) suffix += ALPHABET[byte % ALPHABET.length]
  return `${prefix}_${time}${suffix}`
}
