package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** Attente de 24 heures après le retrait de l'application par un code de récupération (ADR-0024). */
class ApplicationAuthentificationTest {

  private static final long HEURE = 3_600_000L;
  private static final long MAINTENANT = 1_790_000_000_000L;

  @Test
  void aucunRetraitAucuneAttente() {
    assertFalse(ApplicationAuthentification.enAttente((String) null, MAINTENANT));
  }

  @Test
  void attenteDe24HeuresApresLeRetrait() {
    assertTrue(ApplicationAuthentification.enAttente(Long.toString(MAINTENANT - HEURE), MAINTENANT));
    assertTrue(
        ApplicationAuthentification.enAttente(Long.toString(MAINTENANT - 24 * HEURE + 1), MAINTENANT));
    assertFalse(
        ApplicationAuthentification.enAttente(Long.toString(MAINTENANT - 24 * HEURE), MAINTENANT));
  }

  @Test
  void horlogeEnRetardComptePourUneAttente() {
    assertTrue(ApplicationAuthentification.enAttente(Long.toString(MAINTENANT + HEURE), MAINTENANT));
  }

  @Test
  void valeurIllisibleIgnoree() {
    assertFalse(ApplicationAuthentification.enAttente("hier", MAINTENANT));
    assertFalse(ApplicationAuthentification.enAttente("-5", MAINTENANT));
  }
}
