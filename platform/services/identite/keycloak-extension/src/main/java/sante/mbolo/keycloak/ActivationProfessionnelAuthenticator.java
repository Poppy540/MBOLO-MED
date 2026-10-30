package sante.mbolo.keycloak;

import java.net.URI;
import java.time.LocalDate;
import java.time.ZoneOffset;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.AuthenticationFlowContext;
import org.keycloak.authentication.Authenticator;
import org.keycloak.authentication.AuthenticatorFactory;
import org.keycloak.models.AuthenticationExecutionModel.Requirement;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RealmModel;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;
import org.keycloak.provider.ProviderConfigProperty;

/**
 * Activation d'un professionnel à la connexion (ADR-0026, décision du porteur de projet du
 * 2026-10-28) : pour un compte d'attente {@code professionnel-candidat}, l'extension lit sa fiche
 * dans le dossier ; si une personne habilitée l'a vérifiée (fiche active, « verifie », inscription
 * valable), le rôle {@code professionnel} remplace le rôle d'attente. Personne n'attribue ce rôle à
 * la main, et aucun service ne détient de droit d'administration sur les comptes.
 *
 * <p>Étape 5 (décision du 2026-10-29) : pour un compte {@code professionnel} dont la fiche lue n'est
 * plus vérifiée (suspendu, à revérifier, inscription échue), le rôle d'attente remplace le rôle
 * {@code professionnel} ; une nouvelle vérification complète le rendra à la connexion suivante.
 *
 * <p>N'empêche jamais la connexion : dossier injoignable ou compte d'un autre type → rien ne
 * change (les services relisent de toute façon la fiche avant tout accès clinique). Placé après le
 * mot de passe et la double authentification ; une session déjà ouverte n'est pas modifiée.
 */
public final class ActivationProfessionnelAuthenticator implements Authenticator, AuthenticatorFactory {

  public static final String ID = "mbolo-activation-professionnel";
  static final String ROLE_CANDIDAT = "professionnel-candidat";
  static final String ROLE_PROFESSIONNEL = "professionnel";
  /** Lecture seule du statut et de l'inscription de la fiche ; rien d'autre n'est lisible. */
  static final String PERMISSIONS = "system/Practitioner.r";
  static final String ELEMENTS = "Practitioner.active Practitioner.extension Practitioner.qualification";

  private static final Logger JOURNAL = Logger.getLogger(ActivationProfessionnelAuthenticator.class);

  private URI dossier;

  @Override
  public void init(Config.Scope config) {
    String url = config.get("dossier-url");
    dossier = url == null || url.isBlank() ? null : URI.create(url);
  }

  @Override
  public void authenticate(AuthenticationFlowContext context) {
    UserModel u = context.getUser();
    RealmModel realm = context.getRealm();
    RoleModel candidat = realm.getRole(ROLE_CANDIDAT);
    RoleModel professionnel = realm.getRole(ROLE_PROFESSIONNEL);
    String fiche = u == null ? null : u.getFirstAttribute(RolesInscription.ATTRIBUT_PRATICIEN);
    boolean estCandidat = u != null && candidat != null && u.hasDirectRole(candidat);
    boolean estProfessionnel = u != null && professionnel != null && u.hasDirectRole(professionnel);
    if (dossier == null
        || candidat == null
        || professionnel == null
        || fiche == null
        || (!estCandidat && !estProfessionnel)) {
      context.success();
      return;
    }
    KeycloakSession session = context.getSession();
    var lue =
        new ClientDossier(
                dossier,
                () ->
                    JetonService.emettre(
                        session,
                        realm,
                        IdentitePatientRequiredAction.AUDIENCE_DOSSIER,
                        PERMISSIONS,
                        ELEMENTS))
            .lirePraticien(fiche);
    switch (ActivationProfessionnel.changement(
        estCandidat, estProfessionnel, lue, LocalDate.now(ZoneOffset.UTC))) {
      case ACTIVER -> {
        u.grantRole(professionnel);
        u.deleteRoleMapping(candidat);
        JOURNAL.infof("professionnel activé après vérification : compte %s, fiche %s", u.getId(), fiche);
      }
      case RETIRER -> {
        u.deleteRoleMapping(professionnel);
        u.grantRole(candidat);
        JOURNAL.infof(
            "rôle professionnel retiré (fiche suspendue ou à revérifier) : compte %s, fiche %s",
            u.getId(), fiche);
      }
      case AUCUN -> {}
    }
    context.success();
  }

  @Override
  public void action(AuthenticationFlowContext context) {
    context.success();
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
    return "Activation d'un professionnel vérifié (Mbolo)";
  }

  @Override
  public String getReferenceCategory() {
    return null;
  }

  @Override
  public boolean isConfigurable() {
    return false;
  }

  @Override
  public Requirement[] getRequirementChoices() {
    return new Requirement[] {Requirement.REQUIRED, Requirement.DISABLED};
  }

  @Override
  public boolean isUserSetupAllowed() {
    return false;
  }

  @Override
  public String getHelpText() {
    return "Rôle professionnel quand la fiche est vérifiée, rôle d'attente quand elle ne l'est plus.";
  }

  @Override
  public java.util.List<ProviderConfigProperty> getConfigProperties() {
    return java.util.List.of();
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
