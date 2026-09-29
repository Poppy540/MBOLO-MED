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

  /** Vrai seulement si le service confirme l'envoi du SMS au numéro du dossier. */
  public boolean envoyerCode(String patientId, String code) {
    try {
      HttpRequest requete =
          HttpRequest.newBuilder(base.resolve("/codes-connexion"))
              .timeout(DELAI)
              .header("content-type", "application/json")
              .header("authorization", "Bearer " + jeton.get())
              .POST(
                  HttpRequest.BodyPublishers.ofString(
                      JsonSerialization.writeValueAsString(
                          Map.of("patientId", patientId, "code", code))))
              .build();
      HttpResponse<String> r = http.send(requete, HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() != 202) return false;
      return "envoyee".equals(JsonSerialization.readValue(r.body(), Map.class).get("resultat"));
    } catch (IOException | RuntimeException e) {
      return false;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    }
  }
}
