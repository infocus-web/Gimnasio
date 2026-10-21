// Prueba mínima de la firma de Mercado Pago:
//   node --experimental-strip-types src/features/payments/signature.test.ts
import assert from 'node:assert/strict'
// @ts-ignore -- extensión .ts para correr directo con node --experimental-strip-types
import { mpManifest, signMpManifest, verifyMpSignature } from './signature.ts'

const secret = 'clave-de-prueba'
const ts = '1742505638683'
const manifest = mpManifest('123456789', 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e', ts)
assert.equal(manifest, 'id:123456789;request-id:bb56a2f1-6aae-46ac-982e-9dcd3581d08e;ts:1742505638683;')
const v1 = signMpManifest(manifest, secret)
const header = `ts=${ts},v1=${v1}`
const base = { xSignature: header, xRequestId: 'bb56a2f1-6aae-46ac-982e-9dcd3581d08e', dataId: '123456789', secret }

assert.equal(verifyMpSignature(base), true, 'firma válida')
assert.equal(verifyMpSignature({ ...base, dataId: '999' }), false, 'otro pago')
assert.equal(verifyMpSignature({ ...base, secret: 'otra' }), false, 'otra clave')
assert.equal(verifyMpSignature({ ...base, xSignature: `ts=${ts}` }), false, 'sin v1')
assert.equal(verifyMpSignature({ ...base, xSignature: null }), false, 'sin header')
assert.equal(verifyMpSignature({ ...base, secret: '' }), false, 'sin clave configurada')
// data.id alfanumérico: se firma en minúsculas
assert.equal(mpManifest('ABC123', null, '1'), 'id:abc123;ts:1;')
// antigüedad
assert.equal(verifyMpSignature({ ...base, maxAgeSeconds: 300, now: Number(ts) + 1000 }), true, 'reciente')
assert.equal(verifyMpSignature({ ...base, maxAgeSeconds: 300, now: Number(ts) + 3_600_000 }), false, 'vieja')
console.log('OK  firma de Mercado Pago')
