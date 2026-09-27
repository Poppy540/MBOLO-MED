package sante.mbolo.keycloak;

import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.models.RoleModel;
import org.keycloak.models.UserModel;
import org.keycloak.models.utils.FormMessage;

/**
 * Action requise « Mon identité » (ADR-0014), juste après l'inscription : le patient saisit son
 * identité, l'extension crée son dossier FHIR au statut « à vérifier » et rattache le compte
 * ({@code patient_id}). Aucun service de la plateforme ne modifie de compte. Pas de consultation
 * tant qu'un humain habilité n'a pas vérifié l'identité.
 */
public final class IdentitePatientRequiredAction
    implements RequiredActionProvider, RequiredActionFactory {

  public static final String ID = "mbolo-identite-patient";
  static final String ATTRIBUT = "patient_id";
  static final String GABARIT = "identite-patient.ftl";
  /** Audience des jetons présentés à la passerelle du dossier. */
  static final String AUDIENCE_DOSSIER = "mbolo-dossier-fhir";
  /** Seule permission du jeton : créer un Patient ; ni lecture ni modification. */
  static final String PERMISSIONS = "system/Patient.c";

  private static final Logger JOURNAL = Logger.getLogger(IdentitePatientRequiredAction.class);

  private URI dossier;
  private boolean production;
  private String systemeAssurance;

  @Override
  public void init(Config.Scope config) {
    String url = config.get("dossier-url");
    dossier = url == null || url.isBlank() ? null : URI.create(url.endsWith("/") ? url : url + "/");
    production = "prod".equals(config.get("environnement"));
    // Système (URI) du numéro d'assurance maladie nationale du pays (Gabon : CNAMGS).
    systemeAssurance = config.get("identifiant-assurance-systeme");
  }

  private static boolean estPatientSansDossier(RequiredActionContext context) {
    UserModel u = context.getUser();
    RoleModel patient = context.getRealm().getRole(CodeInvitationFormAction.ROLE);
    String id = u.getFirstAttribute(ATTRIBUT);
    return patient != null && u.hasRole(patient) && (id == null || id.isBlank());
  }

  @Override
  public void evaluateTriggers(RequiredActionContext context) {
    if (estPatientSansDossier(context)) context.getUser().addRequiredAction(ID);
  }

  @Override
  public void requiredActionChallenge(RequiredActionContext context) {
    context.challenge(context.form().createForm(GABARIT));
  }

  @Override
  public void processAction(RequiredActionContext context) {
    if (!estPatientSansDossier(context)) {
      context.success();
      return;
    }
    MultivaluedMap<String, String> formulaire =
        context.getHttpRequest().getDecodedFormParameters();
    SaisieIdentite saisie = SaisieIdentite.depuis(formulaire::getFirst);
    List<SaisieIdentite.Erreur> erreurs = saisie.erreurs(LocalDate.now());
    if (!erreurs.isEmpty()) {
      reafficher(
          context,
          formulaire,
          erreurs.stream().map(e -> new FormMessage(e.champ(), e.message())).toList());
      return;
    }
    Optional<String> id =
        dossier == null
            ? Optional.empty()
            : new ClientDossier(
                    dossier,
                    () ->
                        JetonService.emettre(
                            context.getSession(), context.getRealm(), AUDIENCE_DOSSIER, PERMISSIONS))
                .creerPatient(saisie.versPatient(!production, systemeAssurance));
    if (id.isEmpty()) {
      reafficher(context, formulaire, List.of(new FormMessage(null, "mboloDossierIndisponible")));
      return;
    }
    context.getUser().setSingleAttribute(ATTRIBUT, id.get());
    context.getUser().removeRequiredAction(ID);
    // Jamais l'identité dans le journal : le compte et la référence du dossier suffisent.
    JOURNAL.infof("dossier créé à l'inscription : compte %s", context.getUser().getId());
    context.success();
  }

  private static void reafficher(
      RequiredActionContext context,
      MultivaluedMap<String, String> formulaire,
      List<FormMessage> erreurs) {
    MultivaluedMap<String, String> saisi = new MultivaluedHashMap<>();
    for (String champ : SaisieIdentite.CHAMPS) {
      String v = formulaire.getFirst(champ);
      if (v != null) saisi.putSingle(champ, v);
    }
    Response page = context.form().setErrors(erreurs).setFormData(saisi).createForm(GABARIT);
    context.challenge(page);
  }

  @Override
  public String getDisplayText() {
    return "Identité du patient (Mbolo)";
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
}
