# Backups Firestore EduPanel

Este proyecto usa Firebase Firestore. El backup completo queda como JSON restaurable y tambien como `.json.gz` con checksum SHA-256.
El modo recomendado ahora es ejecutar el runner en Ubuntu y usar `/admin/mantenimiento` como panel de estado/disparo manual.

## Backup local inmediato

```powershell
npm run backup:firestore
```

Salida esperada: `backups/firestore/edupanel-firestore-<fecha>.json`, `*.json.gz` y `*.sha256`.

## Backup local + servidor Ubuntu

1. Copia `.env.backup.example` como `.env.backup.local`.
2. Completa `BACKUP_REMOTE_USER`, `BACKUP_REMOTE_HOST`, `BACKUP_REMOTE_PORT` y `BACKUP_REMOTE_DIR`.
3. Opcional pero recomendado para respaldo horario:
   - `BACKUP_RETENTION_DAYS=7`
   - `BACKUP_KEEP_PLAIN_JSON=false`
3. Verifica que Windows pueda entrar al Ubuntu por SSH:

```powershell
ssh tu_usuario@192.168.1.50
```

4. Ejecuta:

```powershell
npm run backup:firestore:remote
```

El script crea la carpeta remota si no existe y copia el `.json.gz` mas el `.sha256`.

## Runner en Ubuntu

Despliegue/redeploy del runner:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/deploy-ubuntu-firestore-backup-runner.ps1 -DisableWindowsTask
```

Ese script:

- Copia el runner minimo al Ubuntu
- Escribe `.env.local` y `.env.backup.local` remotos
- Instala `firebase-admin`
- Registra cron cada 1 hora en Ubuntu
- Opcionalmente desactiva la tarea de Windows

Ruta remota por defecto:

- Runner: `/home/udefret/edupanel-backup-runner`
- Backups: `/home/udefret/edupanel-backups/firestore`

## Programar backup diario desde Windows

Solo mantener este modo si quieres un respaldo dependiente del PC local.

Backup diario local:

```powershell
npm run backup:firestore:schedule
```

Backup diario local + Ubuntu:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/register-firestore-backup-schedule.ps1 -Remote -At 03:00
```

Para cambiar la hora, reemplaza `03:00`.

## Programar backup cada 1 hora

Solo local:

```powershell
npm run backup:firestore:schedule:hourly
```

Local + Ubuntu:

```powershell
npm run backup:firestore:schedule:hourly:remote
```

La tarea registrada en Windows queda como `EduPanel Firestore Backup`.

## Panel admin

La pagina `/admin/mantenimiento` muestra:

- Estado del scheduler horario
- Ultimo respaldo exitoso o ultimo fallo
- Lista de respaldos recientes
- Boton para lanzar un respaldo manual

Si `BACKUP_EXECUTION_TARGET=ssh`, el panel dispara y consulta el runner de Ubuntu.

## Probar restauracion sin escribir

```powershell
node scripts/firestore-restore.mjs backups/firestore/archivo.json.gz
```

## Restaurar de verdad

```powershell
node scripts/firestore-restore.mjs backups/firestore/archivo.json.gz --apply
```

Importante: `--apply` sobrescribe los documentos incluidos en el backup. No elimina documentos nuevos que no existan en el respaldo.
