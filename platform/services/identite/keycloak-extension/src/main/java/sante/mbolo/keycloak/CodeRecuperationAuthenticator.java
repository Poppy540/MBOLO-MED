package sante.mbolo.keycloak;

import jakarta.ws.rs.core.Response;
import java.net.URI;
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
import org.keycloak.models.UserSessionModel;
import org.keycloak.provider.ProviderConfigProperty;

/**
 * Récupération du compte d'un patient sans e-mail (ADR-0021), dans le flux « identifiants oubliés » à
 * la place de l'e-mail : le patient saisit le code que l'équipe d'assistance lui a dicté après l'avoir
 * rappelé au numéro de son dossier. Le service des invitations ne l'accepte que pour le dossier du
 * compte ({@code patient_id}, lu ici, jamais saisi). Ensuite, Keycloak demande le nouveau mot de passe
 * (étape suivante du flux) : il ne sort jamais de Keycloak. Les autres sessions du compte sont fermées.
 *
 * <p>Même message pour un identifiant inconnu, un compte sans dossier (professionnel, proche) ou un
 * code refusé, et le service est toujours appelé : ni la réponse ni le nombre d'essais ne révèlent si
 * un compte existe.
 */
public final class CodeRecuperationAuthenticator implements Authenticator, AuthenticatorFactory {

  public static final String ID = "mbolo-code-recuperation";
  public static final String CHAMP = "code_recuperation";
  /** Dossier du patient, posé par l'action « Mon identité » (ADR-0014). */
  public static final String ATTRIBUT_PATIENT = "patient_id";
  /** Référence envoyée quand le compte n'a pas de dossier : le service refuse, l'essai compte. */
  static final String AUCUN_DOSSIER = "aucun-dossier";

  private static final String PAGE = "code-recuperation.ftl";
  private static final Logger JOURNAL = Logger.getLogger(CodeRecuperationAuthenticator.class);

  private URI invitations;

  @Override
  public void init(Config.Scope config) {
    String url = config.get("invitations-url");
    invitations = url == null || url.isBlank() ? null : URI.create(url);
  }

  @Override
  public void authenticate(AuthenticationFlowContext context) {
    context.challenge(context.form().createForm(PAGE));
  }

  @Override
  public void action(AuthenticationFlowContext context) {
    String code = context.getHttpRequest().getDecodedFormParameters().getFirst(CHAMP);
    UserModel utilisateur = context.getUser();
    ClientInvitations.Recuperation r =
        code == null || code.isBlank()
            ? ClientInvitations.Recuperation.NON_RECONNU
            : client(context.getSession(), context.getRealm())
                .recuperer(
                    code,
                    utilisateur == null ? AUCUN_DOSSIER : utilisateur.getId(),
                    dossier(utilisateur),
                    context.getConnection().getRemoteAddr());
    if (r == ClientInvitations.Recuperation.UTILISE && utilisateur != null) {
      fermerSessions(context.getSession(), context.getRealm(), utilisateur);
      JOURNAL.infof("compte récupéré avec un code de l'équipe : compte %s", utilisateur.getId());
      context.success();
      return;
    }
    String message =
        switch (r) {
          case TROP_D_ESSAIS -> "mboloTropDEssais";
          case INDISPONIBLE -> "mboloRecuperationIndisponible";
          default -> "mboloCodeRecuperationNonReconnu";
        };
    Response page = context.form().setError(message).createForm(PAGE);
    context.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS, page);
  }

  /** Dossier du compte, seulement pour un compte actif qui en a un ; sinon une référence refusée. */
  static String dossier(UserModel utilisateur) {
    if (utilisateur == null || !utilisateur.isEnabled()) return AUCUN_DOSSIER;
    String id = utilisateur.getFirstAttribute(ATTRIBUT_PATIENT);
    return id == null || !id.matches("[A-Za-z0-9.-]{1,64}") ? AUCUN_DOSSIER : id;
  }

  /** Quelqu'un d'autre était peut-être connecté avec l'ancien mot de passe : il est déconnecté. */
  private static void fermerSessions(KeycloakSession session, RealmModel realm, UserModel u) {
    List<UserSessionModel> ouvertes = session.sessions().getUserSessionsStream(realm, u).toList();
    for (UserSessionModel s : ouvertes) session.sessions().removeUserSession(realm, s);
  }

  private ClientInvitations client(KeycloakSession session, RealmModel realm) {
    if (invitations == null) {
      return new ClientInvitations(URI.create("http://invitations.non.configure.invalid/"), () -> "");
    }
    return new ClientInvitations(
        invitations,
        () -> JetonService.emettre(session, realm, CodeInvitationFormAction.AUDIENCE, null));
  }

  @Override
  public boolean requiresUser() {
    // L'étape précédente ne pose pas d'utilisateur si l'identifiant est inconnu : même parcours.
    return false;
  }

  @Override
  public boolean configuredFor(KeycloakSession session, RealmModel realm, UserModel user) {
    return true;
  }

  @Override
  public void setRequiredActions(KeycloakSession session, RealmModel realm, UserModel user) {}

  @Override
  public String getDisplayType() {
    return "Code de récupération Mbolo";
  }

  @Override
  public String getReferenceCategory() {
    return null;
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
    return "Code de récupération remis par l'équipe d'assistance, à la place de l'e-mail (ADR-0021).";
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
