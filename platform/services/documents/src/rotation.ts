// Rotation de la clé maître (ADR-0016) : les clés des documents sont ré-enveloppées avec la clé
// maître actuelle du trousseau, sans jamais déchiffrer les documents eux-mêmes. Reprise possible :
// une clé déjà sur la clé actuelle est laissée telle quelle ; une clé changée entre-temps (document
// supprimé à échéance) est ignorée.
import { TrousseauCles } from './chiffrement.js';
import type { DepotDocuments } from './depot.js';

export interface BilanRotation {
  examinees: number;
  reenveloppees: number;
  dejaAJour: number;
  ignorees: number;
}

export async function reenvelopper(
  depot: DepotDocuments,
  trousseau: TrousseauCles,
  taillePaquet = 100,
): Promise<BilanRotation> {
  const bilan: BilanRotation = { examinees: 0, reenveloppees: 0, dejaAJour: 0, ignorees: 0 };
  let apres: string | undefined;
  for (;;) {
    const paquet = await depot.clesPresentes(apres, taillePaquet);
    if (paquet.length === 0) return bilan;
    for (const { id, cle } of paquet) {
      bilan.examinees++;
      if (TrousseauCles.identifiantDe(cle) === trousseau.actuelle.identifiant) {
        bilan.dejaAJour++;
        continue;
      }
      const clair = await trousseau.desenvelopper(cle);
      try {
        const nouvelle = await trousseau.envelopper(clair);
        if (await depot.remplacerCle(id, cle, nouvelle)) bilan.reenveloppees++;
        else bilan.ignorees++;
      } finally {
        clair.fill(0);
      }
    }
    apres = paquet[paquet.length - 1]?.id;
  }
}
