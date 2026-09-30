package sante.mbolo.keycloak;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.function.Supplier;
import java.util.regex.Pattern;
import org.keycloak.util.JsonSerialization;

/**
 * Ouverture d'une demande de changement de numéro après une perte (ADR-0023), auprès du service
 * documents, avec un jeton de service. Le nouveau numéro, déjà confirmé par un code, y est gardé
 * chiffré jusqu'à la décision d'une personne habilitée.
 */
public final class ClientDocuments {

  private static final Duration DELAI = Duration.ofSeconds(8);
  private static final Pattern IDENTIFIANT = Pattern.compile("^[A-Za-z0-9\\-.]{1,64}$");

  /** Résultat de l'ouverture, tel que le patient doit le comprendre. */
  public enum Ouverture {
    OUVERTE,
    /** Une demande est déjà en cours pour ce dossier. */
    DEJA_EN_COURS,
    /** Tout autre cas : service injoignable, réponse inattendue. */
    RATEE
  }

  private final URI base;
  private final Supplier<String> jeton;
  private final HttpClient http;

  public ClientDocuments(URI base, Supplier<String> jeton) {
    this.base = base;
    this.jeton = jeton;
    this.http = HttpClient.newBuilder().connectTimeout(DELAI).build();
  }

  public Ouverture ouvrirDemandePerte(String patientId, String telephone) {
    if (!IDENTIFIANT.matcher(patientId).matches()) return Ouverture.RATEE;
    try {
      HttpRequest requete =
          HttpRequest.newBuilder(base.resolve("demandes-perte"))
              .timeout(DELAI)
              .header("content-type", "application/json")
              .header("authorization", "Bearer " + jeton.get())
              .POST(
                  HttpRequest.BodyPublishers.ofString(
                      JsonSerialization.writeValueAsString(
                          Map.of("patientId", patientId, "telephone", telephone))))
              .build();
      int statut = http.send(requete, HttpResponse.BodyHandlers.discarding()).statusCode();
      if (statut == 201) return Ouverture.OUVERTE;
      return statut == 409 ? Ouverture.DEJA_EN_COURS : Ouverture.RATEE;
    } catch (IOException | RuntimeException e) {
      return Ouverture.RATEE;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Ouverture.RATEE;
    }
  }
}
