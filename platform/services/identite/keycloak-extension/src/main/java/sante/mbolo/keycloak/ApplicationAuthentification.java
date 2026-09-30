package sante.mbolo.keycloak;

import org.keycloak.credential.CredentialModel;
import org.keycloak.models.UserCredentialModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.credential.OTPCredentialModel;

/**
 * Application d'authentification choisie par le patient (ADR-0024). L'attribut {@link #ATTRIBUT}
 * du compte (posé par l'extension seule, jamais modifiable par le patient) désigne le justificatif
 * TOTP à utiliser au niveau 2, à la place du code SMS.
 *
 * <p>Seul ce justificatif compte : un autre code TOTP ajouté au compte (par exemple par l'action
 * standard de Keycloak) ne donne jamais le niveau 2. Si le justificatif désigné a disparu, le niveau
 * 2 est refusé, sans retour au SMS : seule l'équipe d'assistance peut remettre le compte au SMS.
 */
final class ApplicationAuthentification {

  /** Identifiant du justificatif TOTP retenu, attribut non géré du compte. */
  static final String ATTRIBUT = "mbolo_application";
  /** Nom du justificatif, visible dans l'administration de Keycloak. */
  static final String LIBELLE = "Application Mbolo Santé";
  /** Essais de code dans une même action (activer ou retirer). */
  static final int ESSAIS_MAX = 5;
  /**
   * Date (millisecondes) du retrait de l'application par un code de récupération de l'équipe
   * (application perdue) : pendant {@link #ATTENTE_APRES_RETRAIT_MS}, aucun code SMS ne donne le
   * niveau 2, pour que le vrai patient, prévenu par SMS, ait le temps de réagir.
   */
  static final String ATTRIBUT_RETRAIT = "mbolo_application_retiree_le";
  static final long ATTENTE_APRES_RETRAIT_MS = 24 * 3_600_000L;

  enum Etat {
    /** Pas d'application : le code arrive par SMS. */
    AUCUNE,
    /** Application active : son code seul donne le niveau 2. */
    ACTIVE,
    /** Attribut posé mais justificatif introuvable : niveau 2 refusé. */
    INTROUVABLE
  }

  private ApplicationAuthentification() {}

  static Etat etat(UserModel user) {
    String id = user.getFirstAttribute(ATTRIBUT);
    if (id == null || id.isBlank()) return Etat.AUCUNE;
    CredentialModel c = user.credentialManager().getStoredCredentialById(id);
    return c != null && OTPCredentialModel.TYPE.equals(c.getType()) ? Etat.ACTIVE : Etat.INTROUVABLE;
  }

  /**
   * Application perdue (ADR-0024) : le code de récupération de l'équipe vient d'être utilisé. Le
   * justificatif désigné (s'il existe encore) et l'attribut sont retirés, la date est notée.
   * Renvoie vrai si le compte avait une application.
   */
  static boolean retirerApresRecuperation(UserModel user, long maintenant) {
    String id = user.getFirstAttribute(ATTRIBUT);
    if (id == null || id.isBlank()) return false;
    user.credentialManager().removeStoredCredentialById(id);
    user.removeAttribute(ATTRIBUT);
    user.setSingleAttribute(ATTRIBUT_RETRAIT, Long.toString(maintenant));
    return true;
  }

  /** Vrai pendant les 24 heures qui suivent un retrait par code de récupération. */
  static boolean enAttente(UserModel user, long maintenant) {
    return enAttente(user.getFirstAttribute(ATTRIBUT_RETRAIT), maintenant);
  }

  static boolean enAttente(String retraitLe, long maintenant) {
    if (retraitLe == null || !retraitLe.matches("[0-9]{1,15}")) return false;
    // Un écart négatif (horloge d'un autre nœud en retard) compte comme une attente en cours.
    return maintenant - Long.parseLong(retraitLe) < ATTENTE_APRES_RETRAIT_MS;
  }

  /** Vrai si le code est celui du justificatif désigné (et seulement de celui-là). */
  static boolean codeValide(UserModel user, String code) {
    String id = user.getFirstAttribute(ATTRIBUT);
    if (id == null || code == null || !code.trim().matches("[0-9]{6}")) return false;
    return user.credentialManager()
        .isValid(new UserCredentialModel(id, OTPCredentialModel.TYPE, code.trim()));
  }
}
