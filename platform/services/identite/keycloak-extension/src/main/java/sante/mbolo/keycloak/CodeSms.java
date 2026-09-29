package sante.mbolo.keycloak;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

/**
 * Règles du code de double authentification (ADR-0022, décision du porteur de projet) : 6 chiffres,
 * valable 5 minutes, 3 essais ; au plus un envoi par minute et 5 par heure. Seule une empreinte
 * salée du code est gardée, dans les notes de la session d'authentification. Sans dépendance à
 * Keycloak pour être testée seule.
 */
final class CodeSms {

  static final long VALIDITE_MS = 5 * 60_000L;
  static final int ESSAIS_MAX = 3;
  static final long ENTRE_DEUX_ENVOIS_MS = 60_000L;
  static final int ENVOIS_PAR_HEURE = 5;

  /** Notes de la session d'authentification (lecture, écriture, retrait). */
  interface Notes {
    String lire(String cle);

    void ecrire(String cle, String valeur);

    void retirer(String cle);
  }

  enum Envoi {
    NOUVEAU,
    ATTENDRE,
    TROP_DE_CODES
  }

  enum Verification {
    BON,
    FAUX,
    EXPIRE,
    TROP_D_ESSAIS,
    AUCUN
  }

  /** Code tiré, ou refus (envoi trop rapproché, trop d'envois dans l'heure). */
  record Tirage(Envoi envoi, String code) {}

  private static final String SEL = "mbolo.sms.sel";
  private static final String EMPREINTE = "mbolo.sms.empreinte";
  private static final String EXPIRE = "mbolo.sms.expire";
  private static final String ESSAIS = "mbolo.sms.essais";
  private static final String ENVOIS = "mbolo.sms.envois";

  private CodeSms() {}

  static Tirage tirer(Notes notes, long maintenant, SecureRandom hasard) {
    List<Long> recents = new ArrayList<>();
    String envois = notes.lire(ENVOIS);
    if (envois != null && !envois.isBlank()) {
      for (String t : envois.split(",")) {
        long quand = Long.parseLong(t);
        if (maintenant - quand < 3_600_000L) recents.add(quand);
      }
    }
    if (!recents.isEmpty() && maintenant - recents.get(recents.size() - 1) < ENTRE_DEUX_ENVOIS_MS) {
      return new Tirage(Envoi.ATTENDRE, null);
    }
    if (recents.size() >= ENVOIS_PAR_HEURE) return new Tirage(Envoi.TROP_DE_CODES, null);
    String code = String.format("%06d", hasard.nextInt(1_000_000));
    byte[] sel = new byte[16];
    hasard.nextBytes(sel);
    String selTexte = Base64.getEncoder().encodeToString(sel);
    recents.add(maintenant);
    notes.ecrire(SEL, selTexte);
    notes.ecrire(EMPREINTE, empreinte(selTexte, code));
    notes.ecrire(EXPIRE, Long.toString(maintenant + VALIDITE_MS));
    notes.ecrire(ESSAIS, "0");
    notes.ecrire(ENVOIS, String.join(",", recents.stream().map(String::valueOf).toList()));
    return new Tirage(Envoi.NOUVEAU, code);
  }

  /** Un code bon ou épuisé ne sert plus : il faut en demander un nouveau. */
  static Verification verifier(Notes notes, String saisie, long maintenant) {
    String attendue = notes.lire(EMPREINTE);
    String sel = notes.lire(SEL);
    String expire = notes.lire(EXPIRE);
    if (attendue == null || sel == null || expire == null) return Verification.AUCUN;
    if (maintenant > Long.parseLong(expire)) {
      oublier(notes);
      return Verification.EXPIRE;
    }
    String propre = saisie == null ? "" : saisie.replaceAll("\\s", "");
    boolean bon =
        propre.matches("[0-9]{6}")
            && MessageDigest.isEqual(
                empreinte(sel, propre).getBytes(StandardCharsets.UTF_8),
                attendue.getBytes(StandardCharsets.UTF_8));
    if (bon) {
      oublier(notes);
      return Verification.BON;
    }
    int essais = Integer.parseInt(notes.lire(ESSAIS) == null ? "0" : notes.lire(ESSAIS)) + 1;
    if (essais >= ESSAIS_MAX) {
      oublier(notes);
      return Verification.TROP_D_ESSAIS;
    }
    notes.ecrire(ESSAIS, Integer.toString(essais));
    return Verification.FAUX;
  }

  private static void oublier(Notes notes) {
    notes.retirer(SEL);
    notes.retirer(EMPREINTE);
    notes.retirer(EXPIRE);
    notes.retirer(ESSAIS);
  }

  private static String empreinte(String sel, String code) {
    try {
      MessageDigest sha = MessageDigest.getInstance("SHA-256");
      sha.update(sel.getBytes(StandardCharsets.UTF_8));
      return Base64.getEncoder()
          .encodeToString(sha.digest(code.getBytes(StandardCharsets.UTF_8)));
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
  }
}
