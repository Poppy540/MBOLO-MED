package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Liste fermée des rôles donnés par inscription (ADR-0014, ADR-0019). Données FICTIVES. */
class RolesInscriptionTest {

  @Test
  void codePatientDonneLeRolePatientEtCodeProcheLeRoleProche() {
    assertEquals(Optional.of("patient"), RolesInscription.role("patient"));
    assertEquals(Optional.of("proche"), RolesInscription.role("proche"));
    assertEquals(List.of("patient", "proche"), RolesInscription.TYPES);
  }

  @Test
  void aucunAutreRoleNePeutEtreObtenuParInscription() {
    for (String type :
        List.of(
            "professionnel",
            "infirmier",
            "pharmacien",
            "administrateur",
            "agent-ia",
            "gestion-invitations",
            "verification-identite",
            "revue-acces",
            "mfa-requise",
            "",
            "PATIENT")) {
      assertEquals(Optional.empty(), RolesInscription.role(type), type);
    }
    assertEquals(Optional.empty(), RolesInscription.role(null));
  }

  @Test
  void unProcheEstToujoursRattacheAUneFicheValide() {
    assertTrue(RolesInscription.coherente("proche", "rp-fictif-001"));
    assertFalse(RolesInscription.coherente("proche", null));
    assertFalse(RolesInscription.coherente("proche", "../Patient/x"));
    assertFalse(RolesInscription.coherente("proche", "a".repeat(65)));
    assertTrue(RolesInscription.coherente("patient", null));
    assertFalse(RolesInscription.coherente("patient", "rp-fictif-001"));
    assertFalse(RolesInscription.coherente("administrateur", null));
  }
}
