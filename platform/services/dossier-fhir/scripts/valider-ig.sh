#!/usr/bin/env bash
# Compile le guide d'implémentation (FSH → ressources FHIR) et le valide avec le validateur officiel HL7.
# - les exemples FICTIFS de ig/ doivent être VALIDES ;
# - les ressources de tests/invalides/ doivent être REJETÉES.
# Nécessite : Node (npx), Java 17+, et l'accès à packages.fhir.org et github.com.
set -euo pipefail
cd "$(dirname "$0")/.."

SUSHI_VERSION="3.20.1"
CACHE="${MBOLO_CACHE:-.cache}"
JAR="$CACHE/validator_cli.jar"
mkdir -p "$CACHE"

echo "== Compilation FSH (SUSHI $SUSHI_VERSION)"
npx -y "fsh-sushi@$SUSHI_VERSION" build ig

if [ ! -f "$JAR" ]; then
  echo "== Téléchargement du validateur officiel HL7"
  curl -sSL -o "$JAR" https://github.com/hapifhir/org.hl7.fhir.core/releases/latest/download/validator_cli.jar
fi

RESSOURCES="ig/fsh-generated/resources"
SORTIE="$CACHE/sortie.txt"

# Lance le validateur officiel ; le rapport complet est écrit dans $SORTIE.
executer_validateur() {
  java -jar "$JAR" "$@" -version 4.0.1 -ig "$RESSOURCES" -level errors > "$SORTIE" 2>&1 || true
}

echo "== Les exemples fictifs doivent être valides"
executer_validateur "$RESSOURCES"/{Patient,Consent,Condition,Provenance}-*.json
if grep -q "FAILURE" "$SORTIE" || ! grep -qi "success" "$SORTIE"; then
  echo "ERREUR : au moins un exemple fictif est invalide (ou le validateur n'a pas pu s'exécuter)."
  cat "$SORTIE"
  exit 1
fi
echo "OK : exemples valides."

# Une ressource invalide n'est considérée comme rejetée que si le validateur a réellement
# produit un verdict d'échec (« FAILURE ») : un plantage du validateur ne compte pas comme un rejet.
echo "== Les ressources invalides doivent être rejetées"
echec=0
for f in tests/invalides/*.json; do
  executer_validateur "$f"
  if grep -q "FAILURE" "$SORTIE"; then
    echo "OK : $f rejetée."
  else
    echo "ERREUR : $f n'a pas été rejetée (ou le validateur n'a pas pu s'exécuter)."
    cat "$SORTIE"
    echec=1
  fi
done
exit $echec
