#!/usr/bin/env bash
# Clés des comptes de service pour les tests (private_key_jwt, ADR-0016) — DONNÉES DE TEST UNIQUEMENT.
# Pour chaque service : une paire RSA 2048 et un certificat autosigné valable 2 jours, tirés au hasard
# à chaque exécution. Keycloak reçoit le certificat (public) ; le service reçoit la clé privée.
# - En CI (GITHUB_ENV défini) : valeurs masquées puis écrites dans l'environnement du job.
# - En local : `bash scripts/cles-services-test.sh <dossier hors du dépôt>` écrit
#   <PREFIXE>.certificat et <PREFIXE>.cle (droits 600) dans ce dossier.
# Jamais dans le dépôt, jamais journalisées.
set -euo pipefail

SERVICES=(IDENTITE TELECONSULTATION NOTIFICATIONS CONSULTATION DOCUMENTS INVITATIONS)
DOSSIER="${1:-}"
if [[ -z "${GITHUB_ENV:-}" ]]; then
  if [[ -z "$DOSSIER" ]]; then
    echo "Usage local : $0 <dossier hors du dépôt>" >&2
    exit 1
  fi
  RACINE="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  CIBLE="$(realpath -m "$DOSSIER")"
  if [[ -n "$RACINE" && "$CIBLE/" == "$RACINE/"* ]]; then
    echo "Refusé : le dossier doit être hors du dépôt." >&2
    exit 1
  fi
  mkdir -p "$CIBLE"
fi

TRAVAIL="$(mktemp -d)"
trap 'rm -f "$TRAVAIL"/* && rmdir "$TRAVAIL"' EXIT
umask 077
for P in "${SERVICES[@]}"; do
  NOM="mbolo-$(echo "$P" | tr '[:upper:]' '[:lower:]')-service"
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=$NOM [FICTIF]" \
    -keyout "$TRAVAIL/cle" -out "$TRAVAIL/certificat" 2> /dev/null
  CERTIFICAT="$(openssl x509 -in "$TRAVAIL/certificat" -outform DER | base64 -w0)"
  CLE="$(base64 -w0 < "$TRAVAIL/cle")"
  if [[ -n "${GITHUB_ENV:-}" ]]; then
    echo "::add-mask::$CLE"
    {
      echo "${P}_SERVICE_CERTIFICAT=$CERTIFICAT"
      echo "${P}_SERVICE_CLE_PRIVEE=$CLE"
    } >> "$GITHUB_ENV"
  else
    printf '%s' "$CERTIFICAT" > "$CIBLE/$P.certificat"
    printf '%s' "$CLE" > "$CIBLE/$P.cle"
  fi
done
echo "Clés de test des ${#SERVICES[@]} comptes de service prêtes."
