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
 * Appels au service des invitations (ADR-0013, ADR-0014), avec un jeton de service. En cas de doute
 * (service injoignable, réponse inattendue), la réponse est toujours un refus : jamais d'inscription
 * sans code utilisé.
 */
public final class ClientInvitations {

  /** Résultat du contrôle d'un code, avant la création du compte. */
  public enum Controle {
    VALIDE,
    NON_RECONNU,
    TROP_D_ESSAIS,
    INDISPONIBLE
  }

  private static final Duration DELAI = Duration.ofSeconds(5);

  private final URI base;
  private final Supplier<String> jeton;
  private final HttpClient http;

  public ClientInvitations(URI base, Supplier<String> jeton) {
    this.base = base;
    this.jeton = jeton;
    this.http = HttpClient.newBuilder().connectTimeout(DELAI).build();
  }

  /** Le code peut-il encore servir ? L'adresse du navigateur sert à limiter les essais. */
  public Controle controler(String code, String adresse) {
    try {
      HttpResponse<String> r =
          poster("/inscription/controle", Map.of("code", valeur(code), "adresse", valeur(adresse)));
      if (r.statusCode() == 429) return Controle.TROP_D_ESSAIS;
      if (r.statusCode() != 200) return Controle.INDISPONIBLE;
      Object valide = JsonSerialization.readValue(r.body(), Map.class).get("valide");
      return Boolean.TRUE.equals(valide) ? Controle.VALIDE : Controle.NON_RECONNU;
    } catch (IOException | RuntimeException e) {
      return Controle.INDISPONIBLE;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Controle.INDISPONIBLE;
    }
  }

  /** Utilise le code pour le compte {@code sujet} ; vrai seulement si le service l'a accepté. */
  public boolean utiliser(String code, String sujet) {
    try {
      return poster("/inscription/utilisation", Map.of("code", valeur(code), "sujet", sujet))
              .statusCode()
          == 200;
    } catch (IOException | RuntimeException e) {
      return false;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    }
  }

  private HttpResponse<String> poster(String chemin, Map<String, String> corps)
      throws IOException, InterruptedException {
    HttpRequest requete =
        HttpRequest.newBuilder(base.resolve(chemin))
            .timeout(DELAI)
            .header("content-type", "application/json")
            .header("authorization", "Bearer " + jeton.get())
            .POST(HttpRequest.BodyPublishers.ofString(JsonSerialization.writeValueAsString(corps)))
            .build();
    return http.send(requete, HttpResponse.BodyHandlers.ofString());
  }

  private static String valeur(String s) {
    return s == null ? "" : s;
  }
}
