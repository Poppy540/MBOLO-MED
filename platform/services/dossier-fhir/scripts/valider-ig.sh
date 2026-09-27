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
# Si le serveur de terminologie public (tx.fhir.org) est momentanément injoignable, on réessaie
# (3 tentatives, attente croissante). On ne désactive jamais la terminologie : un échec persistant
# reste un échec, avec un message explicite.
executer_validateur() {
  local tentative
  for tentative in 1 2 3; do
    java -jar "$JAR" "$@" -version 4.0.1 -ig "$RESSOURCES" -level errors > "$SORTIE" 2>&1 || true
    if ! grep -q "Unable to connect to terminology server" "$SORTIE"; then
      return 0
    fi
    echo "Serveur de terminologie tx.fhir.org injoignable (tentative $tentative/3)."
    if [ "$tentative" -lt 3 ]; then sleep $((30 * tentative)); fi
  done
  echo "ERREUR : tx.fhir.org reste injoignable après 3 tentatives (panne externe, voir https://tx.fhir.org)."
  exit 1
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
# produit un verdict d'échec (« FAILURE ») ET que le rapport cite le motif attendu (fichier .attendu) :
# un plantage du validateur, ou un rejet pour une autre raison, ne compte pas.
echo "== Les ressources invalides doivent être rejetées, pour le bon motif"
echec=0
for f in tests/invalides/*.json; do
  attendu_fichier="${f%.json}.attendu"
  if [ ! -f "$attendu_fichier" ]; then
    echo "ERREUR : $attendu_fichier manquant (motif de rejet attendu)."
    echec=1
    continue
  fi
  motif=$(head -n 1 "$attendu_fichier")
  executer_validateur "$f"
  if grep -q "FAILURE" "$SORTIE" && grep -q -- "$motif" "$SORTIE"; then
    echo "OK : $f rejetée (motif : $motif)."
  else
    echo "ERREUR : $f n'a pas été rejetée pour le motif attendu « $motif »."
    cat "$SORTIE"
    echec=1
  fi
done
exit $echec
