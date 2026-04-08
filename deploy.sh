#!/bin/bash

# Leer version actual
VERSION_FILE="version.txt"
if [ ! -f "$VERSION_FILE" ]; then
  echo "1.0.0" > $VERSION_FILE
fi

CURRENT=$(cat $VERSION_FILE)
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"
PATCH=$((PATCH + 1))
NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# Guardar nueva version
echo $NEW_VERSION > $VERSION_FILE

# Actualizar la versión en la app (Next.js)
echo "export const CURRENT_VERSION = 'v$NEW_VERSION';" > components/edu-panel/version.ts

# Generar changelog con archivos modificados
echo "## v$NEW_VERSION - $(date '+%d/%m/%Y %H:%M')" >> CHANGELOG.md
git diff --name-only HEAD >> CHANGELOG.md
echo "" >> CHANGELOG.md

# Commit y push
git add .
git commit -m "v$NEW_VERSION"
git push

echo "✅ Desplegado v$NEW_VERSION"
