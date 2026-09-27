#!/usr/bin/env bash
# Stockage S3 éphémère pour la CI (documents, ADR-0015) — DONNÉES DE TEST UNIQUEMENT.
# SeaweedFS (Apache 2.0), version épinglée. Chaque compartiment crée une collection de 7 volumes :
# petits volumes non préalloués, et assez de places pour plusieurs exécutions.
# Clés tirées au hasard, masquées, jamais conservées.
set -euo pipefail

if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "Réservé à la CI GitHub (GITHUB_ENV absent). En local, voir platform/services/documents/README.md." >&2
  exit 1
fi

CLE="$(openssl rand -hex 10)"
SECRET="$(openssl rand -hex 20)"
for v in "$CLE" "$SECRET"; do
  echo "::add-mask::$v"
done

CONFIG="$(mktemp)"
chmod 600 "$CONFIG"
printf '{"identities":[{"name":"mbolo-test","credentials":[{"accessKey":"%s","secretKey":"%s"}],"actions":["Read","Write","List","Tagging","Admin"]}]}\n' \
  "$CLE" "$SECRET" > "$CONFIG"

docker run -d --name mbolo-s3-test -p 127.0.0.1:8333:8333 \
  -v "$CONFIG:/etc/seaweedfs/s3.json:ro" \
  chrislusf/seaweedfs:4.47 server -dir=/data \
  -volume.max=100 -master.volumeSizeLimitMB=64 -master.volumePreallocate=false \
  -s3 -s3.port=8333 -s3.config=/etc/seaweedfs/s3.json > /dev/null
# Sans authentification, le service répond 403 : il est prêt.
timeout 90 bash -c 'until [ "$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8333)" = "403" ]; do sleep 2; done'

{
  echo "MBOLO_TEST_S3_URL=http://127.0.0.1:8333"
  echo "MBOLO_TEST_S3_CLE=$CLE"
  echo "MBOLO_TEST_S3_SECRET=$SECRET"
} >> "$GITHUB_ENV"
echo "Stockage S3 de test prêt."
