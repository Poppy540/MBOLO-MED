package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Identités FICTIVES uniquement. */
class SaisieIdentiteTest {

  private static final LocalDate AUJOURDHUI = LocalDate.of(2026, 9, 27);

  private static Map<String, String> valide() {
    Map<String, String> m = new HashMap<>();
    m.put("nom", "  Test ");
    m.put("prenom", "Marie-Ange");
    m.put("naissance", "1990-05-12");
    m.put("sexe", "female");
    m.put("telephone", "+241 00 00 00 03");
    m.put("numero_assurance", "fictif-0003");
    return m;
  }

  private static List<String> champsEnErreur(Map<String, String> m) {
    return SaisieIdentite.depuis(m::get).erreurs(AUJOURDHUI).stream()
        .map(SaisieIdentite.Erreur::champ)
        .toList();
  }

  @Test
  void accepteUneIdentiteComplete() {
    assertTrue(champsEnErreur(valide()).isEmpty());
  }

  @Test
  void refuseLesChampsManquantsOuMalFormes() {
    Map<String, String> m = valide();
    m.remove("nom");
    m.put("prenom", "M4rie");
    m.put("naissance", "12/05/1990");
    m.put("sexe", "inconnu-du-profil");
    m.put("telephone", "appelez-moi");
    m.put("numero_assurance", "123 456; drop");
    assertEquals(
        List.of("nom", "prenom", "naissance", "sexe", "telephone", "numero_assurance"),
        champsEnErreur(m));
  }

  @Test
  void refuseUneNaissanceDansLeFuturOuInvraisemblable() {
    Map<String, String> m = valide();
    m.put("naissance", "2026-09-28");
    assertEquals(List.of("naissance"), champsEnErreur(m));
    m.put("naissance", "1899-12-31");
    assertEquals(List.of("naissance"), champsEnErreur(m));
  }

  @Test
  void sexeEtNumeroSontFacultatifs() {
    Map<String, String> m = valide();
    m.put("sexe", "");
    m.remove("numero_assurance");
    assertTrue(champsEnErreur(m).isEmpty());
  }

  @Test
  @SuppressWarnings("unchecked")
  void produitUnPatientAVerifierMarqueFictifHorsProduction() {
    Map<String, Object> p =
        SaisieIdentite.depuis(valide()::get)
            .versPatient(true, "https://mbolo-sante.example/fhir/identifiant/ga/assurance-maladie");
    assertEquals("Patient", p.get("resourceType"));
    Map<String, Object> meta = (Map<String, Object>) p.get("meta");
    assertEquals(List.of(SaisieIdentite.PROFIL), meta.get("profile"));
    assertTrue(meta.toString().contains("fictif"));
    assertTrue(p.get("extension").toString().contains("a-verifier"));
    assertTrue(p.get("identifier").toString().contains("FICTIF-0003"));
    assertEquals("Test", ((List<Map<String, Object>>) p.get("name")).get(0).get("family"));
    assertEquals("1990-05-12", p.get("birthDate"));
  }

  @Test
  void sansSystemeDuPaysLeNumeroNestPasRetenuEtLaProductionNestPasMarqueeFictive() {
    Map<String, Object> p = SaisieIdentite.depuis(valide()::get).versPatient(false, null);
    assertFalse(p.containsKey("identifier"));
    assertFalse(p.get("meta").toString().contains("fictif"));
  }
}
