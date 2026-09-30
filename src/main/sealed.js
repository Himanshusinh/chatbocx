const crypto = require('crypto');

/**
 * End-to-end sealing for messages that colleagues hold on someone's behalf.
 * X25519 + AES-256-GCM so only the recipient can read it, and an Ed25519
 * signature so the colleague holding it cannot alter or forge it.
 */

const der = (key, type) => key.export({ type, format: 'der' }).toString('base64');

function generateKeys() {
  const box = crypto.generateKeyPairSync('x25519');
  const sign = crypto.generateKeyPairSync('ed25519');
  return {
    boxPub: der(box.publicKey, 'spki'),
    boxPriv: der(box.privateKey, 'pkcs8'),
    signPub: der(sign.publicKey, 'spki'),
    signPriv: der(sign.privateKey, 'pkcs8'),
  };
}

const pubKey = (b64) => crypto.createPublicKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'spki' });
const privKey = (b64) => crypto.createPrivateKey({ key: Buffer.from(b64, 'base64'), format: 'der', type: 'pkcs8' });

function signedBytes(to, s) {
  return Buffer.from(`${to}.${s.epk}.${s.iv}.${s.ct}.${s.tag}`);
}

function seal(payload, { to, recipientBoxPub, signPriv }) {
  const eph = crypto.generateKeyPairSync('x25519');
  const shared = crypto.diffieHellman({ privateKey: eph.privateKey, publicKey: pubKey(recipientBoxPub) });
  const epk = der(eph.publicKey, 'spki');
  const key = crypto.createHash('sha256').update(shared).update(epk).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const sealed = { v: 1, epk, iv: iv.toString('base64'), ct: ct.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  sealed.sig = crypto.sign(null, signedBytes(to, sealed), privKey(signPriv)).toString('base64');
  return sealed;
}

/** Returns the payload, or null if it isn't for us, was altered, or isn't signed by `senderSignPub`. */
function open(sealed, { to, boxPriv, senderSignPub }) {
  try {
    if (!sealed || sealed.v !== 1) return null;
    if (!crypto.verify(null, signedBytes(to, sealed), pubKey(senderSignPub), Buffer.from(sealed.sig, 'base64'))) return null;
    const shared = crypto.diffieHellman({ privateKey: privKey(boxPriv), publicKey: pubKey(sealed.epk) });
    const key = crypto.createHash('sha256').update(shared).update(sealed.epk).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const text = Buffer.concat([decipher.update(Buffer.from(sealed.ct, 'base64')), decipher.final()]).toString('utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

module.exports = { generateKeys, seal, open };
