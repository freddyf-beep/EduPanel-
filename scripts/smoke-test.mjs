import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

console.log("=== INICIANDO CHECKLIST AUTOMÁTICO DE QA ===");

const keyFiles = [
  'app/api/generar-clase/route.ts',
  'app/api/generar-evaluacion/route.ts',
  'lib/auth/ai-quota.ts',
  'hooks/use-active-subject.ts',
  'hooks/use-curriculo.ts',
  'hooks/use-mobile.ts',
  'hooks/use-online-status.ts',
  'AUDITORIA_Y_FODA.md'
];

let failed = false;

console.log("\n[1/3] Verificando presencia de archivos clave...");
for (const file of keyFiles) {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    console.log(`  ✓ ${file} existe`);
  } else {
    console.error(`  ✗ ${file} NO EXISTE`);
    failed = true;
  }
}

console.log("\n[2/3] Ejecutando TypeScript Compiler (tsc --noEmit)...");
try {
  execSync('npx tsc --noEmit', { shell: true, stdio: 'inherit' });
  console.log("  ✓ Compilación TypeScript sin errores");
} catch (e) {
  console.error("  ✗ Error en la compilación de TypeScript");
  failed = true;
}

console.log("\n[3/3] Ejecutando Next.js Build de prueba...");
try {
  execSync('npm run build', { shell: true, stdio: 'inherit' });
  console.log("  ✓ Build de Next.js exitoso");
} catch (e) {
  console.error("  ✗ Error al construir el proyecto Next.js");
  failed = true;
}

console.log("\n=============================================");
if (failed) {
  console.error("❌ SMOKE TEST FALLIDO. Por favor revisa los errores arriba.");
  process.exit(1);
} else {
  console.log("✨ TODOS LOS CONTROLES PASARON EXITOSAMENTE! PROYECTO LISTO PARA PRODUCCIÓN.");
  process.exit(0);
}
