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
import java.util.regex.Pattern;
import org.keycloak.util.JsonSerialization;

/**
 * Accès au dossier FHIR par la passerelle (ADR-0010), avec des jetons de service limités à chaque
 * usage : création du {@code Patient} ({@code system/Patient.c}), numéro du patient, et lecture du
 * statut de la fiche d'un professionnel (ADR-0026). Aucune donnée de santé n'est lue.
 */
public final class ClientDossier {

  private static final Duration DELAI = Duration.ofSeconds(8);
  private static final Pattern IDENTIFIANT = Pattern.compile("^[A-Za-z0-9\\-.]{1,64}$");
  /** Parcours et date du changement du numéro (ADR-0023), profil mbolo-patient. */
  static final String EXTENSION_CHANGEMENT_TELEPHONE =
      "https://mbolo-sante.example/fhir/StructureDefinition/changement-telephone";

  private final URI base;
  private final Supplier<String> jeton;
  private final HttpClient http;

  public ClientDossier(URI base, Supplier<String> jeton) {
    this.base = base;
    this.jeton = jeton;
    this.http = HttpClient.newBuilder().connectTimeout(DELAI).build();
  }

  /** Identifiant du Patient créé, ou vide si le dossier a refusé ou est injoignable. */
  public Optional<String> creerPatient(Map<String, Object> patient) {
    try {
      HttpRequest requete =
          HttpRequest.newBuilder(base.resolve("Patient"))
              .timeout(DELAI)
              .header("content-type", "application/fhir+json")
              .header("accept", "application/fhir+json")
              .header("authorization", "Bearer " + jeton.get())
              .POST(HttpRequest.BodyPublishers.ofString(JsonSerialization.writeValueAsString(patient)))
              .build();
      HttpResponse<String> r = http.send(requete, HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() != 201) return Optional.empty();
      Object id = JsonSerialization.readValue(r.body(), Map.class).get("id");
      return id instanceof String s && IDENTIFIANT.matcher(s).matches()
          ? Optional.of(s)
          : Optional.empty();
    } catch (IOException | RuntimeException e) {
      return Optional.empty();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Optional.empty();
    }
  }

  /**
   * Fiche d'un professionnel (ADR-0026), lue sans cache (une décision récente doit être vue) avec un
   * jeton limité à la lecture de son statut, de son activation et de son inscription ; vide si la
   * fiche est inconnue, refusée par la passerelle ou si le dossier est injoignable.
   */
  public Optional<Map<String, Object>> lirePraticien(String practitionerId) {
    if (!IDENTIFIANT.matcher(practitionerId).matches()) return Optional.empty();
    try {
      HttpRequest requete =
          HttpRequest.newBuilder(base.resolve("Practitioner/" + practitionerId))
              .timeout(DELAI)
              .header("accept", "application/fhir+json")
              .header("cache-control", "no-cache")
              .header("authorization", "Bearer " + jeton.get())
              .GET()
              .build();
      HttpResponse<String> r = http.send(requete, HttpResponse.BodyHandlers.ofString());
      if (r.statusCode() != 200) return Optional.empty();
      @SuppressWarnings("unchecked")
      Map<String, Object> fiche = JsonSerialization.readValue(r.body(), Map.class);
      return "Practitioner".equals(fiche.get("resourceType")) && practitionerId.equals(fiche.get("id"))
          ? Optional.of(fiche)
          : Optional.empty();
    } catch (IOException | RuntimeException e) {
      return Optional.empty();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return Optional.empty();
    }
  }

  /**
   * Remplace le numéro du dossier (ADR-0023) : seul {@code Patient.telecom} est envoyé ; la
   * passerelle ne remplace que cet élément. Le numéro porte le parcours (« patient » : codes à
   * l'ancien et au nouveau numéro) et la date du changement. Vrai seulement si le dossier confirme.
   */
  public boolean modifierTelephone(String patientId, String telephone) {
    if (!IDENTIFIANT.matcher(patientId).matches()) return false;
    try {
      Map<String, Object> corps =
          Map.of(
              "resourceType", "Patient",
              "id", patientId,
              "telecom",
              java.util.List.of(
                  Map.of(
                      "extension",
                      java.util.List.of(
                          Map.of("url", EXTENSION_CHANGEMENT_TELEPHONE, "valueCode", "patient")),
                      "system", "phone",
                      "value", telephone,
                      "use", "mobile",
                      "period", Map.of("start", java.time.Instant.now().truncatedTo(java.time.temporal.ChronoUnit.SECONDS).toString()))));
      HttpRequest requete =
          HttpRequest.newBuilder(base.resolve("Patient/" + patientId))
              .timeout(DELAI)
              .header("content-type", "application/fhir+json")
              .header("accept", "application/fhir+json")
              .header("authorization", "Bearer " + jeton.get())
              .PUT(HttpRequest.BodyPublishers.ofString(JsonSerialization.writeValueAsString(corps)))
              .build();
      return http.send(requete, HttpResponse.BodyHandlers.discarding()).statusCode() == 200;
    } catch (IOException | RuntimeException e) {
      return false;
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return false;
    }
  }
}
