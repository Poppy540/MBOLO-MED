package sante.mbolo.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;
import java.net.URI;
import java.security.SecureRandom;
import java.util.List;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.AuthenticationFlowError;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RealmModel;
import org.keycloak.models.UserModel;
import org.keycloak.provider.ProviderConfigProperty;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Double authentification du patient pour les actions sensibles (ADR-0022) : niveau 2 du flux de
 * connexion, demandé par l'application. Un code de 6 chiffres part par SMS au numéro du dossier du
 * patient ({@code patient_id}, lu dans Keycloak ; le service des notifications lit le numéro dans le
 * dossier). Règles : {@link CodeSms}. Le code n'est jamais journalisé.
 */
public final class CodeSmsAuthenticator implements Authenticator, AuthenticatorFactory {

  public static final String ID = "mbolo-code-sms";
  public static final String CHAMP = "code_sms";
  public static final String RENVOYER = "renvoyer";
  /** Audience des jetons de service présentés au service des notifications. */
  public static final String AUDIENCE = "mbolo-notifications";

  private static final String PAGE = "code-sms.ftl";
  private static final Logger JOURNAL = Logger.getLogger(CodeSmsAuthenticator.class);
  private static final SecureRandom HASARD = new SecureRandom();

  private URI notifications;

  @Override
  public void init(Config.Scope config) {
    String url = config.get("notifications-url");
    notifications = url == null || url.isBlank() ? null : URI.create(url);
  }

  @Override
  public void authenticate(AuthenticationFlowContext context) {
    String dossier = CodeRecuperationAuthenticator.dossier(context.getUser());
    if (CodeRecuperationAuthenticator.AUCUN_DOSSIER.equals(dossier)) {
      // Réservé aux patients : un compte sans dossier n'a pas de numéro où recevoir le code.
      context.failureChallenge(
          AuthenticationFlowError.INVALID_USER,
          context.form().setError("mboloCodeSmsSansDossier").createForm(PAGE));
      return;
    }
    envoyer(context, dossier);
  }

  @Override
  public void action(AuthenticationFlowContext context) {
    String dossier = CodeRecuperationAuthenticator.dossier(context.getUser());
    MultivaluedMap<String, String> formulaire =
        context.getHttpRequest().getDecodedFormParameters();
    if (CodeRecuperationAuthenticator.AUCUN_DOSSIER.equals(dossier)) {
      context.failure(AuthenticationFlowError.INVALID_USER);
      return;
    }
    if (formulaire.containsKey(RENVOYER)) {
      envoyer(context, dossier);
      return;
    }
    CodeSms.Verification v =
        CodeSms.verifier(
            notes(context.getAuthenticationSession()),
            formulaire.getFirst(CHAMP),
            System.currentTimeMillis());
    if (v == CodeSms.Verification.BON) {
      context.success();
      return;
    }
    String message =
        switch (v) {
          case EXPIRE -> "mboloCodeSmsExpire";
          case TROP_D_ESSAIS -> "mboloCodeSmsTropDEssais";
          case AUCUN -> "mboloCodeSmsAucun";
          default -> "mboloCodeSmsFaux";
        };
    // Simple nouvelle demande, pas un échec de connexion : les 3 essais sont comptés par CodeSms, et
    // la protection contre la force brute de Keycloak ne doit pas bloquer le mot de passe du patient.
    context.challenge(context.form().setError(message).createForm(PAGE));
  }

  private void envoyer(AuthenticationFlowContext context, String dossier) {
    CodeSms.Tirage tirage =
        CodeSms.tirer(
            notes(context.getAuthenticationSession()), System.currentTimeMillis(), HASARD);
    String erreur =
        switch (tirage.envoi()) {
          case ATTENDRE -> "mboloCodeSmsAttendre";
          case TROP_DE_CODES -> "mboloCodeSmsTropDeCodes";
          case NOUVEAU ->
              client(context.getSession(), context.getRealm()).envoyerCode(dossier, tirage.code())
                  ? null
                  : "mboloCodeSmsNonEnvoye";
        };
    if (erreur == null) {
      JOURNAL.infof("code SMS envoyé : compte %s", context.getUser().getId());
      context.challenge(context.form().setInfo("mboloCodeSmsEnvoye").createForm(PAGE));
    } else {
      context.challenge(context.form().setError(erreur).createForm(PAGE));
    }
  }

  private static CodeSms.Notes notes(AuthenticationSessionModel session) {
    return new CodeSms.Notes() {
      @Override
      public String lire(String cle) {
        return session.getAuthNote(cle);
      }

      @Override
      public void ecrire(String cle, String valeur) {
        session.setAuthNote(cle, valeur);
      }

      @Override
      public void retirer(String cle) {
        session.removeAuthNote(cle);
      }
    };
  }

  private ClientNotifications client(KeycloakSession session, RealmModel realm) {
    if (notifications == null) {
      return new ClientNotifications(
          URI.create("http://notifications.non.configure.invalid/"), () -> "");
    }
    return new ClientNotifications(
        notifications, () -> JetonService.emettre(session, realm, AUDIENCE, null));
  }

  @Override
  public boolean requiresUser() {
    return true;
  }

  @Override
  public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
    return true;
  }

  @Override
  public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {}

  @Override
  public String getDisplayType() {
    return "Code SMS Mbolo (actions sensibles)";
  }

  @Override
  public String getReferenceCategory() {
    return "otp";
  }

  @Override
  public boolean isConfigurable() {
    return false;
  }

  private static final Requirement[] EXIGENCES = {Requirement.REQUIRED};

  @Override
  public Requirement[] getRequirementChoices() {
    return EXIGENCES;
  }

  @Override
  public boolean isUserSetupAllowed() {
    return false;
  }

  @Override
  public String getHelpText() {
    return "Code de 6 chiffres envoyé par SMS au numéro du dossier du patient (ADR-0022).";
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return List.of();
  }

  @Override
  public Authenticator create(KeycloakSession session) {
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
}
