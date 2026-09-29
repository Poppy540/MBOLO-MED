package sante.mbolo.keycloak;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.function.Supplier;
import org.keycloak.util.JsonSerialization;

/**
 * Envoi du code de double authentification (ADR-0022) par le service des notifications, avec un
 * jeton de service. Le service lit le numéro dans le dossier et utilise un gabarit fermé. En cas de
 * doute (service injoignable, réponse inattendue), l'envoi est considéré comme raté.
 */
public final class ClientNotifications {

  private static final Duration DELAI = Duration.ofSeconds(5);

  private final URI base;
  private final Supplier<String> jeton;
  private final HttpClient http;

  public ClientNotifications(URI base, Supplier<String> jeton) {
    this.base = base;
    this.jeton = jeton;
    this.http = HttpClient.newBuilder().connectTimeout(DELAI).build();
  }

  /** Résultat d'une demande d'envoi, tel que le patient doit le comprendre. */
  public enum Envoi {
    /** Le service confirme l'envoi au numéro du dossier. */
    ENVOYE,
    /** Trop de codes pour ce dossier dans l'heure, toutes sessions confondues (limite du service). */
    TROP_DE_CODES,
    /** Tout autre cas : service injoignable, pas de numéro, réponse inattendue. */
    RATE
  }

  /** ENVOYE seulement si le service confirme l'envoi du SMS au numéro du dossier. */
  public Envoi envoyerCode(String patientId, String code) {
    return poster("/codes-connexion", Map.of("patientId", patientId, "code", code));
  }

  /**
   * Validation du numéro saisi à « Mon identité » (revue ASVS n°2, C8), avant que le dossier
   * existe : ENVOYE seulement si le service confirme l'envoi au numéro donné.
   */
  public Envoi verifierTelephone(String telephone, String code) {
    return poster("/codes-verification", Map.of("telephone", telephone, "code", code));
  }

  private Envoi poster(String chemin, Map<String, String> corps) {
    try {
      HttpRequest requete =
          HttpRequest.newBuilder(base.resolve(chemin))
              .timeout(DELAI)
              .header("content-type", "application/json")
              .header("authorization", "Bearer " + jeton.get())
              .POST(HttpRequest.BodyPublishers.ofString(JsonSerialization.writeValueAsString(corps)))
              .build();
      HttpResponse<String> r = http.send(requete, HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() != 202) return Envoi.RATE;
      Object resultat = JsonSerialization.readValue(r.body(), Map.class).get("resultat");
      if ("envoyee".equals(resultat)) return Envoi.ENVOYE;
      return "trop-de-codes".equals(resultat) ? Envoi.TROP_DE_CODES : Envoi.RATE;
    } catch (IOException | RuntimeException e) {
      return Envoi.RATE;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Envoi.RATE;
    }
  }
}
