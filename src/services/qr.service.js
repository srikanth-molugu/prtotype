const QRCode = require('qrcode');

async function generateQrDataUrl(verifyUrl) {
  return QRCode.toDataURL(verifyUrl, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 180
  });
}

module.exports = { generateQrDataUrl };
