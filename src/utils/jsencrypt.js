import JSEncrypt from 'jsencrypt/bin/jsencrypt.min'

// Generic compatibility helpers: callers must supply their own key explicitly.
// Never bundle a private key or use this helper to persist login passwords.
export function encrypt(text, publicKey) {
  if (!publicKey) throw new Error('A public key is required')
  const encryptor = new JSEncrypt()
  encryptor.setPublicKey(publicKey)
  return encryptor.encrypt(text)
}

export function decrypt(text, privateKey) {
  if (!privateKey) throw new Error('A private key is required')
  const encryptor = new JSEncrypt()
  encryptor.setPrivateKey(privateKey)
  return encryptor.decrypt(text)
}
