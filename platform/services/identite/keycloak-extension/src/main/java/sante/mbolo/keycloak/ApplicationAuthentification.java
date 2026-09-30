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

  /** Vrai si le code est celui du justificatif désigné (et seulement de celui-là). */
  static boolean codeValide(UserModel user, String code) {
    String id = user.getFirstAttribute(ATTRIBUT);
    if (id == null || code == null || !code.trim().matches("[0-9]{6}")) return false;
    return user.credentialManager()
        .isValid(new UserCredentialModel(id, OTPCredentialModel.TYPE, code.trim()));
  }
}
