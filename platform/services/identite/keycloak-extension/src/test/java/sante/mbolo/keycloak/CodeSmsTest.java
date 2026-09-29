package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Règles du code SMS (ADR-0022), sans Keycloak. */
class CodeSmsTest {

  private final Map<String, String> stock = new HashMap<>();
  private final CodeSms.Notes notes =
      new CodeSms.Notes() {
        @Override
        public String lire(String cle) {
          return stock.get(cle);
        }

        @Override
        public void ecrire(String cle, String valeur) {
          stock.put(cle, valeur);
        }

        @Override
        public void retirer(String cle) {
          stock.remove(cle);
        }
      };
  private final SecureRandom hasard = new SecureRandom();

  private String tirer(long t) {
    CodeSms.Tirage r = CodeSms.tirer(notes, t, hasard);
    assertEquals(CodeSms.Envoi.NOUVEAU, r.envoi());
    return r.code();
  }

  private static String autre(String code) {
    return code.equals("000000") ? "000001" : "000000";
  }

  @Test
  void codeDeSixChiffresGardeSeulementEnEmpreinte() {
    String code = tirer(0);
    assertTrue(code.matches("[0-9]{6}"));
    assertFalse(stock.containsValue(code));
    assertEquals(CodeSms.Verification.BON, CodeSms.verifier(notes, code, 1_000));
    // Un code bon ne sert qu'une fois.
    assertEquals(CodeSms.Verification.AUCUN, CodeSms.verifier(notes, code, 2_000));
  }

  @Test
  void expireApresCinqMinutes() {
    String code = tirer(0);
    assertEquals(
        CodeSms.Verification.EXPIRE, CodeSms.verifier(notes, code, CodeSms.VALIDITE_MS + 1));
  }

  @Test
  void troisEssaisAuPlusPuisIlFautUnNouveauCode() {
    String code = tirer(0);
    assertEquals(CodeSms.Verification.FAUX, CodeSms.verifier(notes, autre(code), 1));
    assertEquals(CodeSms.Verification.FAUX, CodeSms.verifier(notes, "abc", 2));
    assertEquals(CodeSms.Verification.TROP_D_ESSAIS, CodeSms.verifier(notes, autre(code), 3));
    // Même le bon code ne sert plus.
    assertEquals(CodeSms.Verification.AUCUN, CodeSms.verifier(notes, code, 4));
  }

  @Test
  void unEnvoiParMinuteEtCinqParHeure() {
    tirer(0);
    CodeSms.Tirage trop = CodeSms.tirer(notes, 30_000, hasard);
    assertEquals(CodeSms.Envoi.ATTENDRE, trop.envoi());
    assertNull(trop.code());
    for (int i = 1; i < CodeSms.ENVOIS_PAR_HEURE; i++) tirer(i * 60_000L);
    assertEquals(CodeSms.Envoi.TROP_DE_CODES, CodeSms.tirer(notes, 10 * 60_000L, hasard).envoi());
    // Une heure après le premier envoi, un nouveau code est possible.
    tirer(3_600_001L);
  }

  @Test
  void unNouveauCodeRemplaceLAncien() {
    String premier = tirer(0);
    String second = tirer(60_000);
    if (!premier.equals(second)) {
      assertEquals(CodeSms.Verification.FAUX, CodeSms.verifier(notes, premier, 61_000));
    }
    assertEquals(CodeSms.Verification.BON, CodeSms.verifier(notes, second, 62_000));
  }
}
