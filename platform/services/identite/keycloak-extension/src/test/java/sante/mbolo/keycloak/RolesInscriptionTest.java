package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** Liste fermée des rôles donnés par inscription (ADR-0014, ADR-0019, ADR-0026). Données FICTIVES. */
class RolesInscriptionTest {

  @Test
  void codePatientDonneLeRolePatientEtCodeProcheLeRoleProche() {
    assertEquals(Optional.of("patient"), RolesInscription.role("patient"));
    assertEquals(Optional.of("proche"), RolesInscription.role("proche"));
    assertEquals(List.of("patient", "proche", "professionnel"), RolesInscription.TYPES);
  }

  @Test
  void codeProfessionnelNeDonneQueLeRoleDAttente() {
    // Jamais le rôle professionnel : seule la vérification par une personne habilitée le donnera.
    assertEquals(Optional.of("professionnel-candidat"), RolesInscription.role("professionnel"));
  }

  @Test
  void aucunAutreRoleNePeutEtreObtenuParInscription() {
    for (String type :
        List.of(
            "professionnel-candidat",
            "recrutement",
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
    assertTrue(RolesInscription.coherente("proche", "rp-fictif-001", null));
    assertFalse(RolesInscription.coherente("proche", null, null));
    assertFalse(RolesInscription.coherente("proche", "../Patient/x", null));
    assertFalse(RolesInscription.coherente("proche", "a".repeat(65), null));
    assertFalse(RolesInscription.coherente("proche", "rp-fictif-001", "prac-fictif-001"));
    assertTrue(RolesInscription.coherente("patient", null, null));
    assertFalse(RolesInscription.coherente("patient", "rp-fictif-001", null));
    assertFalse(RolesInscription.coherente("patient", null, "prac-fictif-001"));
    assertFalse(RolesInscription.coherente("administrateur", null, null));
  }

  @Test
  void unProfessionnelEstToujoursRattacheASaFicheEtASeulementElle() {
    assertTrue(RolesInscription.coherente("professionnel", null, "prac-candidat-001"));
    assertFalse(RolesInscription.coherente("professionnel", null, null));
    assertFalse(RolesInscription.coherente("professionnel", null, "../Patient/x"));
    assertFalse(RolesInscription.coherente("professionnel", "rp-fictif-001", "prac-candidat-001"));
  }
}
