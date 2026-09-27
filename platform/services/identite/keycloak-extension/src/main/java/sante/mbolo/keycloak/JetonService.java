package sante.mbolo.keycloak;

import org.keycloak.common.util.Time;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.RealmModel;
import org.keycloak.models.utils.KeycloakModelUtils;
import org.keycloak.representations.AccessToken;
import org.keycloak.services.Urls;
import org.keycloak.util.TokenUtil;

/**
 * Jetons de service courts (60 s) signés avec la clé du royaume : aucun secret supplémentaire, et
 * seul du code exécuté dans Keycloak peut en produire un. Client {@code mbolo-keycloak-inscription}.
 */
final class JetonService {

  static final String CLIENT = "mbolo-keycloak-inscription";

  private JetonService() {}

  /**
   * @param permissions permissions SMART de la passerelle du dossier (revendication {@code
   *     mbolo_scopes}), ou {@code null}
   */
  static String emettre(
      KeycloakSession session, RealmModel realm, String audience, String permissions) {
    long maintenant = Time.currentTime();
    AccessToken jeton = new AccessToken();
    jeton.id(KeycloakModelUtils.generateId());
    jeton.issuer(Urls.realmIssuer(session.getContext().getUri().getBaseUri(), realm.getName()));
    jeton.audience(audience);
    jeton.issuedFor(CLIENT);
    jeton.type(TokenUtil.TOKEN_TYPE_BEARER);
    jeton.iat(maintenant);
    jeton.exp(maintenant + 60);
    if (permissions != null) jeton.getOtherClaims().put("mbolo_scopes", permissions);
    return session.tokens().encode(jeton);
  }
}
