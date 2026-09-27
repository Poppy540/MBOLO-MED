package sante.mbolo.keycloak;

import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import java.net.URI;
import java.util.List;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.FormAction;
import org.keycloak.authentication.FormActionFactory;
import org.keycloak.authentication.FormContext;
import org.keycloak.authentication.ValidationContext;
import org.keycloak.events.Errors;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;
import org.keycloak.provider.ProviderConfigProperty;

/**
 * Étape du formulaire d'inscription (ADR-0014) : exige un code d'invitation, l'utilise une seule fois
 * pour le compte créé et n'attribue que le rôle {@code patient}. Le mot de passe reste dans Keycloak ;
 * l'identité du patient n'est pas demandée ici (elle va dans le dossier FHIR, étape suivante).
 */
public final class CodeInvitationFormAction implements FormAction, FormActionFactory {

  public static final String ID = "mbolo-code-invitation";
  public static final String CHAMP = "code_invitation";
  /** Seul rôle que l'inscription peut donner (liste fermée). */
  public static final String ROLE = "patient";
  /** Audience des jetons de service présentés au service des invitations. */
  public static final String AUDIENCE = "mbolo-invitations-api";

  private static final Logger JOURNAL = Logger.getLogger(CodeInvitationFormAction.class);

  private URI invitations;

  @Override
  public void init(Config.Scope config) {
    String url = config.get("invitations-url");
    invitations = url == null || url.isBlank() ? null : URI.create(url);
  }

  @Override
  public void buildPage(FormContext context, LoginFormsProvider form) {
    // Le champ est dans le thème « mbolo » (register.ftl).
  }

  @Override
  public void validate(ValidationContext context) {
    MultivaluedMap<String, String> formulaire =
        context.getHttpRequest().getDecodedFormParameters();
    String code = formulaire.getFirst(CHAMP);
    ClientInvitations.Controle r =
        code == null || code.isBlank()
            ? ClientInvitations.Controle.NON_RECONNU
            : client(context.getSession(), context.getRealm())
                .controler(code, context.getConnection().getRemoteAddr());
    if (r == ClientInvitations.Controle.VALIDE) {
      context.success();
      return;
    }
    String message =
        switch (r) {
          case TROP_D_ESSAIS -> "mboloTropDEssais";
          case INDISPONIBLE -> "mboloInvitationsIndisponible";
          default -> "mboloCodeNonReconnu";
        };
    // Le code saisi n'est pas renvoyé dans le formulaire (copie : l'original peut être immuable).
    MultivaluedMap<String, String> renvoye = new MultivaluedHashMap<>(formulaire);
    renvoye.remove(CHAMP);
    context.error(Errors.INVALID_REGISTRATION);
    context.validationError(renvoye, List.of(new FormMessage(CHAMP, message)));
  }

  @Override
  public void success(FormContext context) {
    UserModel utilisateur = context.getUser();
    String code = context.getHttpRequest().getDecodedFormParameters().getFirst(CHAMP);
    // Utilisation atomique côté service : si un autre compte l'a pris entre-temps, l'exception annule
    // la transaction, donc la création du compte.
    if (!client(context.getSession(), context.getRealm()).utiliser(code, utilisateur.getId())) {
      throw new IllegalStateException("Code d'invitation non utilisable : inscription annulée.");
    }
    RoleModel patient = context.getRealm().getRole(ROLE);
    if (patient == null) throw new IllegalStateException("Rôle patient absent du royaume.");
    utilisateur.grantRole(patient);
    JOURNAL.infof("inscription avec code d'invitation : compte %s", utilisateur.getId());
  }

  private ClientInvitations client(KeycloakSession session, RealmModel realm) {
    if (invitations == null) {
      return new ClientInvitations(URI.create("http://invitations.non.configure.invalid/"), () -> "");
    }
    return new ClientInvitations(
        invitations, () -> JetonService.emettre(session, realm, AUDIENCE, null));
  }

  @Override
  public boolean requiresUser() {
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
    return "Code d'invitation Mbolo";
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
    return "Exige un code d'invitation valable, l'utilise une fois et attribue le rôle patient.";
  }

  @Override
  public List<ProviderConfigProperty> getConfigProperties() {
    return List.of();
  }

  @Override
  public FormAction create(KeycloakSession session) {
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
