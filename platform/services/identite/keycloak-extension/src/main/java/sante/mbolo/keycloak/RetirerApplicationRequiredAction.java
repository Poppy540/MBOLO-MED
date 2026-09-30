package sante.mbolo.keycloak;

import java.net.URI;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.InitiatedActionSupport;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.UserModel;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Le patient retire son application d'authentification (ADR-0024), action lancée par l'application
 * patient ({@code kc_action=mbolo-retirer-application}). Il faut un code de l'application : un
 * voleur de mot de passe et de carte SIM ne peut pas revenir au SMS. SMS d'alerte au numéro du
 * dossier, puis le justificatif et l'attribut sont retirés : les codes reviennent par SMS.
 *
 * <p>Application perdue : le patient passe par l'équipe d'assistance (code de récupération,
 * ADR-0021), jamais par cette action.
 */
public final class RetirerApplicationRequiredAction
    implements RequiredActionProvider, RequiredActionFactory {

  public static final String ID = "mbolo-retirer-application";
  private static final String NOTE_ESSAIS = "mbolo.application.retrait.essais";
  private static final Logger JOURNAL = Logger.getLogger(RetirerApplicationRequiredAction.class);

  private URI notifications;

  @Override
  public void init(Config.Scope config) {
    String n = config.get("notifications-url");
    notifications = n == null || n.isBlank() ? null : URI.create(n);
  }

  @Override
  public InitiatedActionSupport initiatedActionSupport() {
    return InitiatedActionSupport.SUPPORTED;
  }

  @Override
  public void evaluateTriggers(RequiredActionContext context) {
    // Jamais déclenchée par Keycloak : seulement à la demande du patient, depuis l'application.
  }

  @Override
  public void requiredActionChallenge(RequiredActionContext context) {
    String refus = refus(context.getUser());
    if (refus != null) {
      context.challenge(ActiverApplicationRequiredAction.bloque(context, refus));
      return;
    }
    context.getAuthenticationSession().removeAuthNote(NOTE_ESSAIS);
    context.challenge(
        context
            .form()
            .setAttribute("mode", "retirer")
            .createForm(ActiverApplicationRequiredAction.GABARIT));
  }

  @Override
  public void processAction(RequiredActionContext context) {
    UserModel user = context.getUser();
    String refus = refus(user);
    if (refus != null) {
      context.challenge(ActiverApplicationRequiredAction.bloque(context, refus));
      return;
    }
    AuthenticationSessionModel session = context.getAuthenticationSession();
    String note = session.getAuthNote(NOTE_ESSAIS);
    int essais = (note == null ? 0 : Integer.parseInt(note)) + 1;
    session.setAuthNote(NOTE_ESSAIS, Integer.toString(essais));
    if (essais > ApplicationAuthentification.ESSAIS_MAX) {
      context.challenge(
          ActiverApplicationRequiredAction.bloque(context, "mboloApplicationTropDEssais"));
      return;
    }
    String code =
        context
            .getHttpRequest()
            .getDecodedFormParameters()
            .getFirst(CodeSmsAuthenticator.CHAMP_APPLICATION);
    if (!ApplicationAuthentification.codeValide(user, code)) {
      context.challenge(
          context
              .form()
              .setAttribute("mode", "retirer")
              .setError("mboloApplicationCodeFaux")
              .createForm(ActiverApplicationRequiredAction.GABARIT));
      return;
    }
    String dossier = CodeRecuperationAuthenticator.dossier(user);
    if (ActiverApplicationRequiredAction.client(context, notifications)
            .alerterCompte(dossier, "application-retiree")
        != ClientNotifications.Envoi.ENVOYE) {
      JOURNAL.warnf("alerte « application retirée » non envoyée : compte %s", user.getId());
    }
    user.credentialManager()
        .removeStoredCredentialById(user.getFirstAttribute(ApplicationAuthentification.ATTRIBUT));
    user.removeAttribute(ApplicationAuthentification.ATTRIBUT);
    session.removeAuthNote(NOTE_ESSAIS);
    JOURNAL.infof("application d'authentification retirée : compte %s", user.getId());
    context.success();
  }

  private static String refus(UserModel user) {
    if (CodeRecuperationAuthenticator.AUCUN_DOSSIER.equals(
        CodeRecuperationAuthenticator.dossier(user))) {
      return "mboloCodeSmsSansDossier";
    }
    return switch (ApplicationAuthentification.etat(user)) {
      case ACTIVE -> null;
      case AUCUNE -> "mboloApplicationAucune";
      case INTROUVABLE -> "mboloApplicationIntrouvable";
    };
  }

  @Override
  public RequiredActionProvider create(KeycloakSession session) {
    return this;
  }

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {}

  @Override
  public String getId() {
    return ID;
  }

  @Override
  public String getDisplayText() {
    return "Retirer l'application d'authentification (patient, ADR-0024)";
  }
}
