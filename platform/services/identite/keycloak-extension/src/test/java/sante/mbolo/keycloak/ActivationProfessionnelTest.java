package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import sante.mbolo.keycloak.ActivationProfessionnel.Changement;

/** Règle d'activation d'un professionnel (ADR-0026). Données FICTIVES. */
class ActivationProfessionnelTest {

  private static final LocalDate AUJOURDHUI = LocalDate.of(2026, 10, 28);

  private static Map<String, Object> fiche(String statut, boolean active, String fin) {
    Map<String, Object> qualification = new HashMap<>();
    qualification.put("identifier", List.of(Map.of("value", "FICTIF-ORDRE-0005")));
    qualification.put("issuer", Map.of("display", "Ordre (GA)"));
    if (fin != null) qualification.put("period", Map.of("start", "2026-10-01", "end", fin));
    Map<String, Object> f = new HashMap<>();
    f.put("resourceType", "Practitioner");
    f.put("active", active);
    f.put(
        "extension",
        List.of(Map.of("url", ActivationProfessionnel.EXTENSION_STATUT, "valueCode", statut)));
    f.put("qualification", List.of(qualification));
    return f;
  }

  @Test
  void ficheActiveVerifieeEtInscriptionValable() {
    assertTrue(ActivationProfessionnel.ficheVerifiee(fiche("verifie", true, "2027-10-01"), AUJOURDHUI));
    // Dernier jour de validité encore accepté.
    assertTrue(ActivationProfessionnel.ficheVerifiee(fiche("verifie", true, "2026-10-28"), AUJOURDHUI));
  }

  @Test
  void refuseToutAutreCas() {
    assertFalse(ActivationProfessionnel.ficheVerifiee(fiche("a-verifier", false, null), AUJOURDHUI));
    assertFalse(ActivationProfessionnel.ficheVerifiee(fiche("verifie", false, "2027-10-01"), AUJOURDHUI));
    assertFalse(ActivationProfessionnel.ficheVerifiee(fiche("suspendu", true, "2027-10-01"), AUJOURDHUI));
    assertFalse(ActivationProfessionnel.ficheVerifiee(fiche("refuse", true, "2027-10-01"), AUJOURDHUI));
    // Inscription échue, ou déclarée sans période (jamais vérifiée).
    assertFalse(ActivationProfessionnel.ficheVerifiee(fiche("verifie", true, "2026-10-27"), AUJOURDHUI));
    assertFalse(ActivationProfessionnel.ficheVerifiee(fiche("verifie", true, null), AUJOURDHUI));
    // Fiche illisible : refus par défaut.
    assertFalse(ActivationProfessionnel.ficheVerifiee(Map.of("active", true), AUJOURDHUI));
    assertFalse(
        ActivationProfessionnel.ficheVerifiee(
            Map.of("active", true, "extension", "pas une liste", "qualification", List.of(1)),
            AUJOURDHUI));
  }

  @Test
  void changementALaConnexion() {
    var verifiee = Optional.of(fiche("verifie", true, "2027-10-01"));
    var suspendue = Optional.of(fiche("suspendu", false, "2027-10-01"));
    var echue = Optional.of(fiche("verifie", true, "2026-10-27"));
    Optional<Map<String, Object>> illisible = Optional.empty();
    assertEquals(Changement.ACTIVER, ActivationProfessionnel.changement(true, false, verifiee, AUJOURDHUI));
    assertEquals(Changement.AUCUN, ActivationProfessionnel.changement(true, false, suspendue, AUJOURDHUI));
    assertEquals(Changement.AUCUN, ActivationProfessionnel.changement(false, true, verifiee, AUJOURDHUI));
    // Suspendu ou inscription échue : retour au rôle d'attente (étape 5).
    assertEquals(Changement.RETIRER, ActivationProfessionnel.changement(false, true, suspendue, AUJOURDHUI));
    assertEquals(Changement.RETIRER, ActivationProfessionnel.changement(false, true, echue, AUJOURDHUI));
    // Dossier injoignable : rien ne change, la connexion n'est jamais bloquée.
    assertEquals(Changement.AUCUN, ActivationProfessionnel.changement(false, true, illisible, AUJOURDHUI));
    assertEquals(Changement.AUCUN, ActivationProfessionnel.changement(true, false, illisible, AUJOURDHUI));
  }
}
