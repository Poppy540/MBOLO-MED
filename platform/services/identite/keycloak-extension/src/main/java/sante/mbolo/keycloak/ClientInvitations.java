package sante.mbolo.keycloak;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;
import org.keycloak.util.JsonSerialization;

/**
 * Appels au service des invitations (ADR-0013, ADR-0014, ADR-0019), avec un jeton de service. En cas de doute
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

  /** Code utilisé : type (patient ou proche) et, pour un proche, sa fiche dans le dossier. */
  public record Utilisation(String type, String relatedPersonId) {}

  /**
   * Le code peut-il encore servir ? L'adresse du navigateur sert à limiter les essais. Les types de
   * codes que l'extension sait traiter sont déclarés (ADR-0019).
   */
  public Controle controler(String code, String adresse) {
    try {
      HttpResponse<String> r =
          poster(
              "/inscription/controle",
              Map.of(
                  "code",
                  valeur(code),
                  "adresse",
                  valeur(adresse),
                  "types",
                  RolesInscription.TYPES));
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

  /**
   * Utilise le code pour le compte {@code sujet} ; présent seulement si le service l'a accepté et que
   * la réponse est cohérente (type de la liste fermée, fiche valide pour un proche).
   */
  public Optional<Utilisation> utiliser(String code, String sujet) {
    try {
      HttpResponse<String> r =
          poster(
              "/inscription/utilisation",
              Map.of("code", valeur(code), "sujet", sujet, "types", RolesInscription.TYPES));
      if (r.statusCode() != 200) return Optional.empty();
      Map<?, ?> corps = JsonSerialization.readValue(r.body(), Map.class);
      Object type = corps.get("type");
      Object fiche = corps.get("relatedPersonId");
      String t = type instanceof String s ? s : null;
      String f = fiche instanceof String s ? s : null;
      return RolesInscription.coherente(t, f)
          ? Optional.of(new Utilisation(t, f))
          : Optional.empty();
    } catch (IOException | RuntimeException e) {
      return Optional.empty();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Optional.empty();
    }
  }

  /** Résultat de l'utilisation d'un code de récupération du compte (ADR-0021). */
  public enum Recuperation {
    UTILISE,
    NON_RECONNU,
    TROP_D_ESSAIS,
    INDISPONIBLE
  }

  /**
   * Utilise un code de récupération (ADR-0021) pour le compte {@code sujet}, rattaché au dossier
   * {@code patientId} lu dans Keycloak : le service ne l'accepte que pour ce dossier. L'adresse du
   * navigateur limite les essais. En cas de doute, jamais {@link Recuperation#UTILISE}.
   */
  public Recuperation recuperer(String code, String sujet, String patientId, String adresse) {
    try {
      HttpResponse<String> r =
          poster(
              "/recuperation/utilisation",
              Map.of(
                  "code",
                  valeur(code),
                  "sujet",
                  valeur(sujet),
                  "patientId",
                  valeur(patientId),
                  "adresse",
                  valeur(adresse)));
      if (r.statusCode() == 429) return Recuperation.TROP_D_ESSAIS;
      if (r.statusCode() == 409) return Recuperation.NON_RECONNU;
      if (r.statusCode() != 200) return Recuperation.INDISPONIBLE;
      Object utilise = JsonSerialization.readValue(r.body(), Map.class).get("utilise");
      return Boolean.TRUE.equals(utilise) ? Recuperation.UTILISE : Recuperation.INDISPONIBLE;
    } catch (IOException | RuntimeException e) {
      return Recuperation.INDISPONIBLE;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Recuperation.INDISPONIBLE;
    }
  }

  private HttpResponse<String> poster(String chemin, Map<String, ?> corps)
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
