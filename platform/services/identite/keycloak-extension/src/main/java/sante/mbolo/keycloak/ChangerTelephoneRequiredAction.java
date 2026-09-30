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
 * Changement du numéro du dossier par le patient (ADR-0023), action lancée par l'application
 * ({@code kc_action=mbolo-changer-telephone}) :
 *
 * <ol>
 *   <li>code envoyé à l'<b>ancien</b> numéro (celui du dossier) : un voleur de mot de passe ne peut
 *       pas aller plus loin ;
 *   <li>nouveau numéro, puis code envoyé au <b>nouveau</b> numéro ;
 *   <li>SMS d'alerte à l'ancien numéro, puis mise à jour de {@code Patient.telecom} seul par la
 *       passerelle.
 * </ol>
 *
 * Au plus un changement par 24 heures. Les étapes vivent dans la session d'authentification ; le
 * numéro n'est jamais journalisé.
 */
public final class ChangerTelephoneRequiredAction
    implements RequiredActionProvider, RequiredActionFactory {

  public static final String ID = "mbolo-changer-telephone";
  static final String GABARIT_CODE_ANCIEN = "code-sms.ftl";
  static final String GABARIT_NUMERO = "changer-telephone.ftl";
  static final String GABARIT_CODE_NOUVEAU = "verification-telephone.ftl";
  /** Date du dernier changement (millisecondes), attribut du compte posé par l'extension. */
  static final String ATTRIBUT_DERNIER = "mbolo_telephone_change_le";
  static final long DELAI_ENTRE_CHANGEMENTS_MS = 24 * 3_600_000L;
  /** Seules permissions du jeton : modifier le Patient, et seulement son numéro. */
  static final String PERMISSIONS = "system/Patient.u";
  static final String ELEMENTS = "Patient.telecom";

  private static final String NOTE = "mbolo.changement.";
  private static final String ETAPE = NOTE + "etape";
  private static final String NOUVEAU = NOTE + "telephone";
  private static final SecureRandom HASARD = new SecureRandom();
  private static final Logger JOURNAL = Logger.getLogger(ChangerTelephoneRequiredAction.class);

  private URI dossier;
  private URI notifications;

  @Override
  public void init(Config.Scope config) {
    String d = config.get("dossier-url");
    dossier = d == null || d.isBlank() ? null : URI.create(d.endsWith("/") ? d : d + "/");
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
      context.challenge(page(context, "bloque").setError("mboloCodeSmsSansDossier").createForm(GABARIT_NUMERO));
      return;
    }
    String dernier = context.getUser().getFirstAttribute(ATTRIBUT_DERNIER);
    if (dernier != null
        && System.currentTimeMillis() - Long.parseLong(dernier) < DELAI_ENTRE_CHANGEMENTS_MS) {
      context.challenge(page(context, "bloque").setError("mboloTelephoneDejaChange").createForm(GABARIT_NUMERO));
      return;
    }
    AuthenticationSessionModel session = context.getAuthenticationSession();
    session.setAuthNote(ETAPE, "ancien");
    envoyerAncien(context, dossierId);
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
      case "ancien" -> {
        if (formulaire.containsKey("renvoyer")) {
          envoyerAncien(context, dossierId);
          return;
        }
        CodeSms.Verification v =
            CodeSms.verifier(
                notes(session, "ancien."), formulaire.getFirst("code_sms"), System.currentTimeMillis());
        if (v != CodeSms.Verification.BON) {
          context.challenge(
              context.form().setError(messageCode(v)).createForm(GABARIT_CODE_ANCIEN));
          return;
        }
        // L'ancien numéro a confirmé : le patient peut indiquer le nouveau.
        session.setAuthNote(ETAPE, "nouveau");
        context.challenge(page(context, "nouveau").createForm(GABARIT_NUMERO));
      }
      case "nouveau" -> envoyerNouveau(context, formulaire.getFirst("telephone"));
      case "code-nouveau" -> {
        String telephone = session.getAuthNote(NOUVEAU);
        if (formulaire.containsKey("corriger")) {
          session.setAuthNote(ETAPE, "nouveau");
          context.challenge(
              page(context, "nouveau").setAttribute("telephone", telephone).createForm(GABARIT_NUMERO));
          return;
        }
        if (formulaire.containsKey("renvoyer")) {
          envoyerNouveau(context, telephone);
          return;
        }
        CodeSms.Verification v =
            CodeSms.verifier(
                notes(session, "nouveau."), formulaire.getFirst("code_sms"), System.currentTimeMillis());
        if (v != CodeSms.Verification.BON) {
          context.challenge(
              pageCodeNouveau(context, telephone).setError(messageCode(v)).createForm(GABARIT_CODE_NOUVEAU));
          return;
        }
        terminer(context, dossierId, telephone);
      }
      default -> requiredActionChallenge(context);
    }
  }

  /** Alerte à l'ancien numéro (encore dans le dossier), puis mise à jour du seul numéro. */
  private void terminer(RequiredActionContext context, String dossierId, String telephone) {
    ClientNotifications.Envoi alerte = client(context).alerterNumeroChange(dossierId);
    if (alerte != ClientNotifications.Envoi.ENVOYE) {
      // Le changement reste possible (le patient a prouvé les deux numéros) ; la supervision le voit.
      JOURNAL.warnf("alerte « numéro changé » non envoyée : compte %s", context.getUser().getId());
    }
    boolean fait =
        dossier != null
            && new ClientDossier(
                    dossier,
                    () ->
                        JetonService.emettre(
                            context.getSession(),
                            context.getRealm(),
                            IdentitePatientRequiredAction.AUDIENCE_DOSSIER,
                            PERMISSIONS,
                            ELEMENTS))
                .modifierTelephone(dossierId, telephone);
    if (!fait) {
      context.challenge(
          pageCodeNouveau(context, telephone)
              .setError("mboloTelephoneNonChange")
              .createForm(GABARIT_CODE_NOUVEAU));
      return;
    }
    AuthenticationSessionModel session = context.getAuthenticationSession();
    for (String cle : new String[] {ETAPE, NOUVEAU}) session.removeAuthNote(cle);
    context
        .getUser()
        .setSingleAttribute(ATTRIBUT_DERNIER, Long.toString(System.currentTimeMillis()));
    JOURNAL.infof("numéro du dossier changé par le patient : compte %s", context.getUser().getId());
    context.success();
  }

  private void envoyerAncien(RequiredActionContext context, String dossierId) {
    CodeSms.Tirage tirage =
        CodeSms.tirer(notes(context.getAuthenticationSession(), "ancien."), System.currentTimeMillis(), HASARD);
    String erreur =
        switch (tirage.envoi()) {
          case ATTENDRE -> "mboloCodeSmsAttendre";
          case TROP_DE_CODES -> "mboloCodeSmsTropDeCodes";
          case NOUVEAU -> erreurEnvoi(client(context).envoyerCode(dossierId, tirage.code()));
        };
    LoginFormsProvider page = context.form();
    context.challenge(
        (erreur == null ? page.setInfo("mboloCodeSmsEnvoye") : page.setError(erreur))
            .createForm(GABARIT_CODE_ANCIEN));
  }

  private void envoyerNouveau(RequiredActionContext context, String saisie) {
    AuthenticationSessionModel session = context.getAuthenticationSession();
    String telephone = SaisieIdentite.telephoneValide(saisie);
    if (telephone == null) {
      context.challenge(
          page(context, "nouveau").setError("mboloTelephoneInvalide").createForm(GABARIT_NUMERO));
      return;
    }
    CodeSms.Tirage tirage =
        CodeSms.tirer(notes(session, "nouveau."), System.currentTimeMillis(), HASARD);
    String erreur =
        switch (tirage.envoi()) {
          case ATTENDRE -> "mboloCodeSmsAttendre";
          case TROP_DE_CODES -> "mboloCodeSmsTropDeCodes";
          case NOUVEAU -> erreurEnvoi(client(context).verifierTelephone(telephone, tirage.code()));
        };
    boolean dejaEnvoye = "code-nouveau".equals(session.getAuthNote(ETAPE));
    if (erreur != null && !dejaEnvoye) {
      context.challenge(
          page(context, "nouveau")
              .setAttribute("telephone", telephone)
              .setError(erreur)
              .createForm(GABARIT_NUMERO));
      return;
    }
    if (erreur != null) {
      // « Recevoir un nouveau code » trop tôt : on reste sur la page du code.
      context.challenge(pageCodeNouveau(context, telephone).setError(erreur).createForm(GABARIT_CODE_NOUVEAU));
      return;
    }
    session.setAuthNote(NOUVEAU, telephone);
    session.setAuthNote(ETAPE, "code-nouveau");
    context.challenge(
        pageCodeNouveau(context, telephone)
            .setInfo("mboloTelephoneCodeEnvoye")
            .createForm(GABARIT_CODE_NOUVEAU));
  }

  static String erreurEnvoi(ClientNotifications.Envoi envoi) {
    return switch (envoi) {
      case ENVOYE -> null;
      case TROP_DE_CODES -> "mboloCodeSmsTropDeCodes";
      case ATTENTE_APRES_PERTE -> "mboloCodeSmsAttentePerte";
      case RATE -> "mboloCodeSmsNonEnvoye";
    };
  }

  static String messageCode(CodeSms.Verification v) {
    return switch (v) {
      case EXPIRE -> "mboloCodeSmsExpire";
      case TROP_D_ESSAIS -> "mboloCodeSmsTropDEssais";
      case AUCUN -> "mboloCodeSmsAucun";
      default -> "mboloCodeSmsFaux";
    };
  }

  static LoginFormsProvider page(RequiredActionContext context, String etape) {
    return context.form().setAttribute("etape", etape);
  }

  static LoginFormsProvider pageCodeNouveau(RequiredActionContext context, String telephone) {
    return context.form().setAttribute("telephoneSaisi", telephone);
  }

  /** Notes de la session, séparées pour chacun des deux codes (limites d'envoi indépendantes). */
  private static CodeSms.Notes notes(AuthenticationSessionModel session, String prefixe) {
    return notesPrefixees(session, NOTE + prefixe);
  }

  /** Notes de la session sous un préfixe donné (un code par préfixe, limites indépendantes). */
  static CodeSms.Notes notesPrefixees(AuthenticationSessionModel session, String prefixe) {
    return new CodeSms.Notes() {
      @Override
      public String lire(String cle) {
        return session.getAuthNote(prefixe + cle);
      }

      @Override
      public void ecrire(String cle, String valeur) {
        session.setAuthNote(prefixe + cle, valeur);
      }

      @Override
      public void retirer(String cle) {
        session.removeAuthNote(prefixe + cle);
      }
    };
  }

  private ClientNotifications client(RequiredActionContext context) {
    if (notifications == null) {
      // Sans service des notifications, aucun code ne part : le numéro ne change pas.
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
    return "Changer de numéro de téléphone (Mbolo, ADR-0023)";
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
