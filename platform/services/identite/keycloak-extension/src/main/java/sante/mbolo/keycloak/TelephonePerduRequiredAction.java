package sante.mbolo.keycloak;

import jakarta.ws.rs.core.MultivaluedMap;
import java.net.URI;
import java.security.SecureRandom;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.authentication.InitiatedActionSupport;
import org.keycloak.authentication.RequiredActionContext;
import org.keycloak.authentication.RequiredActionFactory;
import org.keycloak.authentication.RequiredActionProvider;
import org.keycloak.forms.login.LoginFormsProvider;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;
import org.keycloak.sessions.AuthenticationSessionModel;

/**
 * Téléphone perdu (ADR-0023, parcours 2), action lancée par l'application
 * ({@code kc_action=mbolo-telephone-perdu}) : le patient n'a plus son ancien numéro.
 *
 * <ol>
 *   <li>nouveau numéro, puis code envoyé à ce <b>nouveau</b> numéro ;
 *   <li>demande ouverte auprès du service documents, qui garde le numéro chiffré ;
 *   <li>le patient envoie ensuite de nouvelles photos depuis l'application ; une personne habilitée
 *       décide. <b>Rien ne change dans le dossier ici.</b>
 * </ol>
 *
 * Le numéro n'est jamais journalisé.
 */
public final class TelephonePerduRequiredAction
    implements RequiredActionProvider, RequiredActionFactory {

  public static final String ID = "mbolo-telephone-perdu";
  static final String AUDIENCE_DOCUMENTS = "mbolo-documents-api";

  private static final String NOTE = "mbolo.perte.";
  private static final String ETAPE = NOTE + "etape";
  private static final String NOUVEAU = NOTE + "telephone";
  private static final SecureRandom HASARD = new SecureRandom();
  private static final Logger JOURNAL = Logger.getLogger(TelephonePerduRequiredAction.class);

  private URI documents;
  private URI notifications;

  @Override
  public void init(Config.Scope config) {
    String d = config.get("documents-url");
    documents = d == null || d.isBlank() ? null : URI.create(d.endsWith("/") ? d : d + "/");
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
    String dossierId = CodeRecuperationAuthenticator.dossier(context.getUser());
    if (CodeRecuperationAuthenticator.AUCUN_DOSSIER.equals(dossierId)) {
      context.challenge(
          page(context, "bloque").setError("mboloCodeSmsSansDossier").createForm(ChangerTelephoneRequiredAction.GABARIT_NUMERO));
      return;
    }
    context.getAuthenticationSession().setAuthNote(ETAPE, "nouveau");
    context.challenge(page(context, "nouveau").createForm(ChangerTelephoneRequiredAction.GABARIT_NUMERO));
  }

  @Override
  public void processAction(RequiredActionContext context) {
    AuthenticationSessionModel session = context.getAuthenticationSession();
    MultivaluedMap<String, String> formulaire =
        context.getHttpRequest().getDecodedFormParameters();
    String dossierId = CodeRecuperationAuthenticator.dossier(context.getUser());
    String etape = session.getAuthNote(ETAPE);
    if (etape == null || CodeRecuperationAuthenticator.AUCUN_DOSSIER.equals(dossierId)) {
      requiredActionChallenge(context);
      return;
    }
    switch (etape) {
      case "nouveau" -> envoyerNouveau(context, formulaire.getFirst("telephone"));
      case "code-nouveau" -> {
        String telephone = session.getAuthNote(NOUVEAU);
        if (formulaire.containsKey("corriger")) {
          session.setAuthNote(ETAPE, "nouveau");
          context.challenge(
              page(context, "nouveau")
                  .setAttribute("telephone", telephone)
                  .createForm(ChangerTelephoneRequiredAction.GABARIT_NUMERO));
          return;
        }
        if (formulaire.containsKey("renvoyer")) {
          envoyerNouveau(context, telephone);
          return;
        }
        CodeSms.Verification v =
            CodeSms.verifier(notes(session), formulaire.getFirst("code_sms"), System.currentTimeMillis());
        if (v != CodeSms.Verification.BON) {
          context.challenge(
              ChangerTelephoneRequiredAction.pageCodeNouveau(context, telephone)
                  .setError(ChangerTelephoneRequiredAction.messageCode(v))
                  .createForm(ChangerTelephoneRequiredAction.GABARIT_CODE_NOUVEAU));
          return;
        }
        ouvrir(context, dossierId, telephone);
      }
      default -> requiredActionChallenge(context);
    }
  }

  /** Le nouveau numéro a confirmé : la demande part au service documents, rien d'autre. */
  private void ouvrir(RequiredActionContext context, String dossierId, String telephone) {
    ClientDocuments.Ouverture ouverture =
        documents == null
            ? ClientDocuments.Ouverture.RATEE
            : new ClientDocuments(
                    documents,
                    () ->
                        JetonService.emettre(
                            context.getSession(), context.getRealm(), AUDIENCE_DOCUMENTS, null))
                .ouvrirDemandePerte(dossierId, telephone);
    if (ouverture == ClientDocuments.Ouverture.RATEE) {
      context.challenge(
          ChangerTelephoneRequiredAction.pageCodeNouveau(context, telephone)
              .setError("mboloPerteNonEnregistree")
              .createForm(ChangerTelephoneRequiredAction.GABARIT_CODE_NOUVEAU));
      return;
    }
    AuthenticationSessionModel session = context.getAuthenticationSession();
    for (String cle : new String[] {ETAPE, NOUVEAU}) session.removeAuthNote(cle);
    if (ouverture == ClientDocuments.Ouverture.DEJA_EN_COURS) {
      context.challenge(
          page(context, "bloque").setError("mboloPerteDejaEnCours").createForm(ChangerTelephoneRequiredAction.GABARIT_NUMERO));
      return;
    }
    JOURNAL.infof("demande « téléphone perdu » ouverte : compte %s", context.getUser().getId());
    context.success();
  }

  private void envoyerNouveau(RequiredActionContext context, String saisie) {
    AuthenticationSessionModel session = context.getAuthenticationSession();
    String telephone = SaisieIdentite.telephoneValide(saisie);
    if (telephone == null) {
      context.challenge(
          page(context, "nouveau").setError("mboloTelephoneInvalide").createForm(ChangerTelephoneRequiredAction.GABARIT_NUMERO));
      return;
    }
    CodeSms.Tirage tirage = CodeSms.tirer(notes(session), System.currentTimeMillis(), HASARD);
    String erreur =
        switch (tirage.envoi()) {
          case ATTENDRE -> "mboloCodeSmsAttendre";
          case TROP_DE_CODES -> "mboloCodeSmsTropDeCodes";
          case NOUVEAU ->
              ChangerTelephoneRequiredAction.erreurEnvoi(
                  client(context).verifierTelephone(telephone, tirage.code()));
        };
    boolean dejaEnvoye = "code-nouveau".equals(session.getAuthNote(ETAPE));
    if (erreur != null && !dejaEnvoye) {
      context.challenge(
          page(context, "nouveau")
              .setAttribute("telephone", telephone)
              .setError(erreur)
              .createForm(ChangerTelephoneRequiredAction.GABARIT_NUMERO));
      return;
    }
    if (erreur != null) {
      context.challenge(
          ChangerTelephoneRequiredAction.pageCodeNouveau(context, telephone)
              .setError(erreur)
              .createForm(ChangerTelephoneRequiredAction.GABARIT_CODE_NOUVEAU));
      return;
    }
    session.setAuthNote(NOUVEAU, telephone);
    session.setAuthNote(ETAPE, "code-nouveau");
    context.challenge(
        ChangerTelephoneRequiredAction.pageCodeNouveau(context, telephone)
            .setInfo("mboloTelephoneCodeEnvoye")
            .createForm(ChangerTelephoneRequiredAction.GABARIT_CODE_NOUVEAU));
  }

  /** Même page que le changement par le patient, avec les textes du parcours « perte ». */
  private static LoginFormsProvider page(RequiredActionContext context, String etape) {
    return ChangerTelephoneRequiredAction.page(context, etape).setAttribute("perte", true);
  }

  private static CodeSms.Notes notes(AuthenticationSessionModel session) {
    return ChangerTelephoneRequiredAction.notesPrefixees(session, NOTE + "code.");
  }

  private ClientNotifications client(RequiredActionContext context) {
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
  public String getDisplayText() {
    return "Téléphone perdu : demande de changement de numéro (Mbolo, ADR-0023)";
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
