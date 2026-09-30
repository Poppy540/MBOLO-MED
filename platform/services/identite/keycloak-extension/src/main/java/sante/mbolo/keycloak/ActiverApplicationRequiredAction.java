package sante.mbolo.keycloak;

import java.net.URI;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.InitiatedActionSupport;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.authentication.authenticators.util.AcrStore;
import org.keycloak.credential.CredentialModel;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.UserModel;
import org.keycloak.models.credential.OTPCredentialModel;
import org.keycloak.models.utils.HmacOTP;
import org.keycloak.sessions.AuthenticationSessionModel;
import org.keycloak.utils.CredentialHelper;
import org.keycloak.utils.TotpUtils;

/**
 * Le patient active une application d'authentification (ADR-0024), action lancée par l'application
 * patient ({@code kc_action=mbolo-activer-application} avec {@code acr_values=2}) :
 *
 * <ol>
 *   <li>le niveau 2 (code SMS) doit être atteint dans cette connexion : un voleur de mot de passe
 *       ne peut pas installer sa propre application ;
 *   <li>QR code et clé, puis un premier code de l'application ;
 *   <li>justificatif TOTP créé et désigné par l'attribut {@link ApplicationAuthentification#ATTRIBUT},
 *       puis SMS d'alerte au numéro du dossier.
 * </ol>
 *
 * Ensuite, le code SMS n'est plus accepté au niveau 2 pour ce compte. La clé ne quitte la session
 * d'authentification que pour être affichée au patient ; elle n'est jamais journalisée.
 */
public final class ActiverApplicationRequiredAction
    implements RequiredActionProvider, RequiredActionFactory {

  public static final String ID = "mbolo-activer-application";
  static final String GABARIT = "application.ftl";
  private static final String NOTE_CLE = "mbolo.application.cle";
  private static final String NOTE_ESSAIS = "mbolo.application.essais";
  private static final Logger JOURNAL = Logger.getLogger(ActiverApplicationRequiredAction.class);

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
    String refus = refus(context);
    if (refus != null) {
      context.challenge(bloque(context, refus));
      return;
    }
    AuthenticationSessionModel session = context.getAuthenticationSession();
    // Une nouvelle clé à chaque affichage de départ : rien n'est réutilisé d'une tentative à l'autre.
    session.setAuthNote(NOTE_CLE, HmacOTP.generateSecret(20));
    session.removeAuthNote(NOTE_ESSAIS);
    context.challenge(pageActiver(context).createForm(GABARIT));
  }

  @Override
  public void processAction(RequiredActionContext context) {
    String refus = refus(context);
    AuthenticationSessionModel session = context.getAuthenticationSession();
    String cle = session.getAuthNote(NOTE_CLE);
    if (refus != null || cle == null) {
      requiredActionChallenge(context);
      return;
    }
    String note = session.getAuthNote(NOTE_ESSAIS);
    int essais = (note == null ? 0 : Integer.parseInt(note)) + 1;
    session.setAuthNote(NOTE_ESSAIS, Integer.toString(essais));
    if (essais > ApplicationAuthentification.ESSAIS_MAX) {
      session.removeAuthNote(NOTE_CLE);
      context.challenge(bloque(context, "mboloApplicationTropDEssais"));
      return;
    }
    String code = context.getHttpRequest().getDecodedFormParameters().getFirst(CodeSmsAuthenticator.CHAMP_APPLICATION);
    UserModel user = context.getUser();
    OTPCredentialModel modele =
        OTPCredentialModel.createFromPolicy(context.getRealm(), cle, ApplicationAuthentification.LIBELLE);
    boolean cree =
        code != null
            && code.trim().matches("[0-9]{6}")
            && CredentialHelper.createOTPCredential(
                context.getSession(), context.getRealm(), user, code.trim(), modele);
    if (!cree) {
      context.challenge(pageActiver(context).setError("mboloApplicationCodeFaux").createForm(GABARIT));
      return;
    }
    CredentialModel justificatif =
        user.credentialManager()
            .getStoredCredentialsByTypeStream(OTPCredentialModel.TYPE)
            .filter(c -> cle.equals(OTPCredentialModel.createFromCredentialModel(c).getOTPSecretData().getValue()))
            .findFirst()
            .orElse(null);
    if (justificatif == null) {
      context.challenge(bloque(context, "mboloApplicationNonActivee"));
      return;
    }
    user.setSingleAttribute(ApplicationAuthentification.ATTRIBUT, justificatif.getId());
    session.removeAuthNote(NOTE_CLE);
    session.removeAuthNote(NOTE_ESSAIS);
    String dossier = CodeRecuperationAuthenticator.dossier(user);
    if (client(context).alerterCompte(dossier, "application-activee") != ClientNotifications.Envoi.ENVOYE) {
      // L'application est active (le patient a prouvé le SMS puis l'application) ; la supervision le voit.
      JOURNAL.warnf("alerte « application activée » non envoyée : compte %s", user.getId());
    }
    JOURNAL.infof("application d'authentification activée : compte %s", user.getId());
    context.success();
  }

  /** Motif de refus, ou null si le patient peut activer une application maintenant. */
  private static String refus(RequiredActionContext context) {
    UserModel user = context.getUser();
    if (CodeRecuperationAuthenticator.AUCUN_DOSSIER.equals(CodeRecuperationAuthenticator.dossier(user))) {
      return "mboloCodeSmsSansDossier";
    }
    if (ApplicationAuthentification.etat(user) != ApplicationAuthentification.Etat.AUCUNE) {
      return "mboloApplicationDejaActive";
    }
    int niveau =
        new AcrStore(context.getSession(), context.getAuthenticationSession())
            .getLevelOfAuthenticationFromCurrentAuthentication();
    return niveau >= 2 ? null : "mboloApplicationNiveauRequis";
  }

  private LoginFormsProvider pageActiver(RequiredActionContext context) {
    String cle = context.getAuthenticationSession().getAuthNote(NOTE_CLE);
    return context
        .form()
        .setAttribute("mode", "activer")
        .setAttribute("totpSecret", cle)
        .setAttribute("cleLisible", TotpUtils.encode(cle))
        .setAttribute(
            "qrCode", TotpUtils.qrCode(context.getSession(), cle, context.getRealm(), context.getUser()));
  }

  static jakarta.ws.rs.core.Response bloque(RequiredActionContext context, String message) {
    return context.form().setAttribute("mode", "bloque").setError(message).createForm(GABARIT);
  }

  private ClientNotifications client(RequiredActionContext context) {
    return client(context, notifications);
  }

  static ClientNotifications client(RequiredActionContext context, URI notifications) {
    if (notifications == null) {
      return new ClientNotifications(
          URI.create("http://notifications.non.configure.invalid/"), () -> "");
    }
    return new ClientNotifications(
        notifications,
        () ->
            JetonService.emettre(
                context.getSession(), context.getRealm(), CodeSmsAuthenticator.AUDIENCE, null));
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
    return "Activer une application d'authentification (patient, ADR-0024)";
  }
}
