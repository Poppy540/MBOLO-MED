package sante.mbolo.keycloak;

import jakarta.ws.rs.core.MultivaluedHashMap;
import jakarta.ws.rs.core.MultivaluedMap;
import jakarta.ws.rs.core.Response;
import java.net.URI;
import java.security.SecureRandom;
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
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Action requise « Mon identité » (ADR-0014), juste après l'inscription : le patient saisit son
 * identité, reçoit un code au numéro saisi et le recopie (revue ASVS n°2, C8 : les codes de
 * connexion et les rappels de l'équipe iront à ce numéro) ; l'extension crée alors son dossier FHIR
 * au statut « à vérifier » et rattache le compte ({@code patient_id}). Entre les deux étapes, la
 * saisie reste dans la session d'authentification, jamais dans le compte ni dans le dossier. Aucun
 * service de la plateforme ne modifie de compte. Pas de consultation tant qu'un humain habilité n'a
 * pas vérifié l'identité.
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
  static final String GABARIT_CODE = "verification-telephone.ftl";
  /** Saisie en attente de la validation du numéro, dans les notes de la session. */
  private static final String NOTE = "mbolo.identite.";

  private static final SecureRandom HASARD = new SecureRandom();
  private static final Logger JOURNAL = Logger.getLogger(IdentitePatientRequiredAction.class);

  private URI dossier;
  private boolean production;
  private String systemeAssurance;
  private URI notifications;

  @Override
  public void init(Config.Scope config) {
    String url = config.get("dossier-url");
    dossier = url == null || url.isBlank() ? null : URI.create(url.endsWith("/") ? url : url + "/");
    production = "prod".equals(config.get("environnement"));
    // Système (URI) du numéro d'assurance maladie nationale du pays (Gabon : CNAMGS).
    systemeAssurance = config.get("identifiant-assurance-systeme");
    // Service des notifications, qui envoie le code au numéro saisi (C8).
    String n = config.get("notifications-url");
    notifications = n == null || n.isBlank() ? null : URI.create(n);
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
    AuthenticationSessionModel session = context.getAuthenticationSession();
    SaisieIdentite enAttente =
        session.getAuthNote(NOTE + "telephone") == null
            ? null
            : SaisieIdentite.depuis(champ -> session.getAuthNote(NOTE + champ));
    if (enAttente != null && formulaire.containsKey("corriger")) {
      // Retour au formulaire, prérempli : le patient corrige son numéro.
      reafficher(context, notesVersFormulaire(session), List.of());
      return;
    }
    if (enAttente != null && formulaire.containsKey("renvoyer")) {
      envoyerCode(context, enAttente, null);
      return;
    }
    if (enAttente != null && formulaire.containsKey("code_sms")) {
      verifierCode(context, enAttente, formulaire.getFirst("code_sms"));
      return;
    }
    SaisieIdentite saisie = SaisieIdentite.depuis(formulaire::getFirst);
    List<SaisieIdentite.Erreur> erreurs = saisie.erreurs(LocalDate.now());
    if (!erreurs.isEmpty()) {
      reafficher(
          context,
          formulaire,
          erreurs.stream().map(e -> new FormMessage(e.champ(), e.message())).toList());
      return;
    }
    envoyerCode(context, saisie, formulaire);
  }

  /** Tire un code, l'envoie au numéro saisi ; la saisie n'est gardée que si le SMS est parti. */
  private void envoyerCode(
      RequiredActionContext context,
      SaisieIdentite saisie,
      MultivaluedMap<String, String> formulaire) {
    AuthenticationSessionModel session = context.getAuthenticationSession();
    CodeSms.Tirage tirage =
        CodeSms.tirer(CodeSmsAuthenticator.notes(session), System.currentTimeMillis(), HASARD);
    String erreur =
        switch (tirage.envoi()) {
          case ATTENDRE -> "mboloCodeSmsAttendre";
          case TROP_DE_CODES -> "mboloCodeSmsTropDeCodes";
          case NOUVEAU ->
              switch (client(context).verifierTelephone(saisie.telephone, tirage.code())) {
                case ENVOYE -> null;
                case TROP_DE_CODES -> "mboloCodeSmsTropDeCodes";
                case RATE -> "mboloCodeSmsNonEnvoye";
              };
        };
    if (erreur != null && formulaire == null) {
      // « Recevoir un nouveau code » trop tôt : on reste sur la page du code (l'ancien vaut encore).
      context.challenge(pageCode(context, saisie).setError(erreur).createForm(GABARIT_CODE));
      return;
    }
    if (erreur != null) {
      // Pas de code parti vers ce numéro : retour au formulaire, saisie conservée.
      reafficher(context, formulaire, List.of(new FormMessage(null, erreur)));
      return;
    }
    for (String champ : SaisieIdentite.CHAMPS) {
      String v = formulaireDe(saisie).getFirst(champ);
      if (v == null) session.removeAuthNote(NOTE + champ);
      else session.setAuthNote(NOTE + champ, v);
    }
    JOURNAL.infof("code de vérification du numéro envoyé : compte %s", context.getUser().getId());
    context.challenge(pageCode(context, saisie).setInfo("mboloTelephoneCodeEnvoye").createForm(GABARIT_CODE));
  }

  private void verifierCode(RequiredActionContext context, SaisieIdentite saisie, String code) {
    AuthenticationSessionModel session = context.getAuthenticationSession();
    CodeSms.Verification v =
        CodeSms.verifier(CodeSmsAuthenticator.notes(session), code, System.currentTimeMillis());
    if (v != CodeSms.Verification.BON) {
      String message =
          switch (v) {
            case EXPIRE -> "mboloCodeSmsExpire";
            case TROP_D_ESSAIS -> "mboloCodeSmsTropDEssais";
            case AUCUN -> "mboloCodeSmsAucun";
            default -> "mboloCodeSmsFaux";
          };
      context.challenge(pageCode(context, saisie).setError(message).createForm(GABARIT_CODE));
      return;
    }
    // Numéro validé : le dossier est créé avec ce numéro, puis la saisie quitte la session.
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
      reafficher(
          context,
          notesVersFormulaire(session),
          List.of(new FormMessage(null, "mboloDossierIndisponible")));
      return;
    }
    for (String champ : SaisieIdentite.CHAMPS) session.removeAuthNote(NOTE + champ);
    context.getUser().setSingleAttribute(ATTRIBUT, id.get());
    context.getUser().removeRequiredAction(ID);
    // Jamais l'identité dans le journal : le compte et la référence du dossier suffisent.
    JOURNAL.infof("dossier créé à l'inscription, numéro validé : compte %s", context.getUser().getId());
    context.success();
  }

  /** Page du code : le numéro saisi est rappelé, pour repérer une faute de frappe. */
  private static org.keycloak.forms.login.LoginFormsProvider pageCode(
      RequiredActionContext context, SaisieIdentite saisie) {
    return context.form().setAttribute("telephoneSaisi", saisie.telephone);
  }

  private static MultivaluedMap<String, String> formulaireDe(SaisieIdentite saisie) {
    MultivaluedMap<String, String> f = new MultivaluedHashMap<>();
    f.putSingle("nom", saisie.nom);
    f.putSingle("prenom", saisie.prenom);
    f.putSingle("naissance", saisie.naissance);
    f.putSingle("sexe", saisie.sexe);
    f.putSingle("telephone", saisie.telephone);
    f.putSingle("numero_assurance", saisie.numeroAssurance);
    return f;
  }

  private static MultivaluedMap<String, String> notesVersFormulaire(
      AuthenticationSessionModel session) {
    MultivaluedMap<String, String> f = new MultivaluedHashMap<>();
    for (String champ : SaisieIdentite.CHAMPS) {
      String v = session.getAuthNote(NOTE + champ);
      if (v != null) f.putSingle(champ, v);
    }
    return f;
  }

  private ClientNotifications client(RequiredActionContext context) {
    if (notifications == null) {
      // Sans service des notifications, aucun code ne part : l'inscription ne se termine pas.
      return new ClientNotifications(
          URI.create("http://notifications.non.configure.invalid/"), () -> "");
    }
    return new ClientNotifications(
        notifications,
        () ->
            JetonService.emettre(
                context.getSession(), context.getRealm(), CodeSmsAuthenticator.AUDIENCE, null));
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
    // Sans erreur (« Corriger mon numéro »), pas de message : une liste vide casse le gabarit.
    // Valeurs déjà saisies, en texte simple (`saisie.nom`…) : le gabarit les remet dans les champs.
    java.util.Map<String, String> valeurs = new java.util.HashMap<>();
    for (String champ : SaisieIdentite.CHAMPS) {
      String v = saisi.getFirst(champ);
      if (v != null) valeurs.put(champ, v);
    }
    var formulaireKeycloak = context.form().setAttribute("saisie", valeurs);
    if (!erreurs.isEmpty()) formulaireKeycloak.setErrors(erreurs);
    Response page = formulaireKeycloak.createForm(GABARIT);
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
