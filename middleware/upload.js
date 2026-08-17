const multer = require('multer');

// Файлҳо дар хотира (memory) нигоҳ дошта мешаванд — мо онҳоро ба DB менависем
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024, files: 1 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|gif|svg\+xml)$/i.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Танҳо акс (JPG, PNG, WEBP, GIF, SVG) иҷозат аст'));
    }
  },
});

module.exports = upload;
