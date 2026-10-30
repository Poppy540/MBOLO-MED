// Passage quotidien des échéances des professionnels vérifiés (ADR-0026, étape 5) : alertes au rôle
// verification-professionnels (identifiants opaques des fiches, jamais un nom), sans rien décider
// sur le fond. Une erreur est journalisée ; le passage suivant reprend.
import { signalerAlerte, type Journal } from '@mbolo/journal-securise';
import type { ServiceVerificationPro } from './verification-pro.js';

export async function passerEcheances(
  service: Pick<ServiceVerificationPro, 'echeances'>,
  journal: Journal,
): Promise<void> {
  try {
    const { rappels, echues } = await service.echeances();
    for (const r of rappels) {
      signalerAlerte(
        journal,
        'professionnel-echeance',
        `inscription d’un professionnel vérifié à échéance dans ${r.jours} jour(s)`,
        { practitionerId: r.practitionerId, jours: r.jours },
      );
    }
    for (const practitionerId of echues) {
      signalerAlerte(
        journal,
        'professionnel-echu',
        'professionnel arrivé à échéance : fiche remise à vérifier',
        { practitionerId },
      );
    }
  } catch (e) {
    journal.erreur('passage des échéances des professionnels impossible', { err: e });
  }
}
