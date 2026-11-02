import { createHmac } from 'node:crypto'

function pairingSecret() {
  const secret = process.env.PAIRING_SECRET || process.env.JWT_SECRET
  if (!secret || secret === 'schoolscreen-dev-secret-change-in-prod') {
    throw new Error('Configure PAIRING_SECRET or a strong JWT_SECRET')
  }
  return secret
}
export function hashPairingCode(code: string) {
  return createHmac('sha256', pairingSecret()).update('pairing-code:' + code).digest('hex')
}
export function hashPairingClient(ip: string) {
  return createHmac('sha256', pairingSecret()).update('pairing-ip:' + ip).digest('hex')
}
