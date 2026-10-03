#!/usr/bin/env bash
# Analyse statique du code (SAST) par Semgrep — skill scans-securite, remplace CodeQL depuis que le
# dépôt est privé (CodeQL n'y est disponible qu'avec GitHub Code Security, payant).
# Règles : uniquement les dossiers « security » du dépôt public semgrep/semgrep-rules (licence
# « Semgrep Rules License v1.0 », usage interne), pour TypeScript, JavaScript et Java (extension
# Keycloak). Le dépôt de règles est épinglé à un commit dans la CI : un changement de règles passe
# par une PR. Aucun envoi à semgrep.dev (métriques coupées, pas de compte, pas de registre).
# Bloquant : gravité ERROR ou WARNING. Les fichiers de test sont exclus (adresses ws:// fictives…).
# Faux positif : commentaire « nosemgrep -- <justification> » sur la ligne précédente, relu en PR.
#
# Usage : scripts/semgrep.sh <dossier des règles semgrep-rules>
set -euo pipefail

REGLES="${1:?Usage : scripts/semgrep.sh <dossier des règles semgrep-rules>}"
RACINE="$(cd "$(dirname "$0")/.." && pwd)"

configs=()
while IFS= read -r dossier; do
  configs+=(--config "$dossier")
done < <(find "$REGLES/javascript" "$REGLES/typescript" "$REGLES/java" -type d -name security | sort)

if [[ ${#configs[@]} -eq 0 ]]; then
  echo "Aucune règle de sécurité trouvée dans $REGLES." >&2
  exit 1
fi

cd "$RACINE"
semgrep scan \
  --metrics off \
  --disable-version-check \
  "${configs[@]}" \
  --exclude '**/dist/**' \
  --exclude '**/node_modules/**' \
  --exclude '*.test.ts' \
  --exclude 'platform/tests/**' \
  --severity ERROR \
  --severity WARNING \
  --error \
  platform
