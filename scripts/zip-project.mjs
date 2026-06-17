import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

const zip = new JSZip();

const excludeDirs = ['.git', '.next', 'node_modules', '.kiro', '.claude', '.codex', 'tmp', 'backups', 'backup_ia_antigua'];
const excludeFiles = ['.env.local', '.env.vercel', 'edupanel_maqueta.zip', 'tsconfig.tsbuildinfo', 'edupanel_update.zip'];

function addFilesToZip(dirPath, currentPath, rootPath = '') {
  const items = fs.readdirSync(currentPath);
  for (const item of items) {
    const fullPath = path.join(currentPath, item);
    const relPath = path.relative(dirPath, fullPath).replace(/\\/g, '/'); // Normalizar barras para el zip
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (excludeDirs.includes(item)) continue;
      addFilesToZip(dirPath, fullPath, relPath);
    } else {
      if (excludeFiles.includes(item)) continue;
      const fileData = fs.readFileSync(fullPath);
      zip.file(relPath, fileData);
    }
  }
}

console.log("Iniciando compresión de la maqueta EduPanel Public...");
const srcDir = 'C:/Users/fredd/Desktop/edupanel_maqueta';
addFilesToZip(srcDir, srcDir);

console.log("Generando archivo ZIP comprimido en el Escritorio...");
zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  .then((content) => {
    const dest = 'C:/Users/fredd/Desktop/edupanel_maqueta.zip';
    fs.writeFileSync(dest, content);
    console.log(`\n¡Compresión completada con éxito! 🎉`);
    console.log(`Archivo maqueta creado en: ${dest}`);
    const sizeMb = (fs.statSync(dest).size / (1024 * 1024)).toFixed(2);
    console.log(`Tamaño del archivo: ${sizeMb} MB`);
  })
  .catch((err) => {
    console.error("Error al generar el archivo ZIP:", err);
  });
