package sante.mbolo.keycloak;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Règle d'activation d'un professionnel (ADR-0026) : la même que {@code praticienVerifie} du paquet
 * {@code @mbolo/dossier-fhir}. Fiche active, statut « verifie » posé par une personne habilitée, et
 * une inscription complète (numéro, Ordre, fin de validité) encore valable aujourd'hui. Toute autre
 * fiche, ou une fiche illisible, est refusée (refus par défaut).
 */
final class ActivationProfessionnel {

  static final String EXTENSION_STATUT =
      "https://mbolo-sante.example/fhir/StructureDefinition/statut-verification";

  private ActivationProfessionnel() {}

  /** Ce que la connexion change aux rôles d'un compte de professionnel. */
  enum Changement {
    /** Candidat dont la fiche est vérifiée : rôle {@code professionnel} à la place du rôle d'attente. */
    ACTIVER,
    /**
     * Professionnel dont la fiche n'est plus vérifiée (suspendu, à revérifier, inscription échue) :
     * retour au rôle d'attente (ADR-0026, étape 5, décision du porteur de projet du 2026-10-29).
     */
    RETIRER,
    AUCUN
  }

  /**
   * Fiche illisible ou dossier injoignable ({@code fiche} vide) → aucun changement : la connexion
   * n'est jamais bloquée, et les services refusent de toute façon l'accès clinique (fiche relue sans
   * cache à chaque accès).
   */
  static Changement changement(
      boolean candidat, boolean professionnel, Optional<Map<String, Object>> fiche, LocalDate aujourdhui) {
    if (fiche.isEmpty()) return Changement.AUCUN;
    boolean verifiee = ficheVerifiee(fiche.get(), aujourdhui);
    if (candidat && !professionnel && verifiee) return Changement.ACTIVER;
    if (professionnel && !verifiee) return Changement.RETIRER;
    return Changement.AUCUN;
  }

  static boolean ficheVerifiee(Map<String, Object> fiche, LocalDate aujourdhui) {
    if (!Boolean.TRUE.equals(fiche.get("active"))) return false;
    boolean verifie =
        liste(fiche.get("extension")).stream()
            .anyMatch(
                e ->
                    EXTENSION_STATUT.equals(e.get("url")) && "verifie".equals(e.get("valueCode")));
    if (!verifie) return false;
    String jour = aujourdhui.toString();
    return liste(fiche.get("qualification")).stream()
        .anyMatch(
            q -> {
              boolean numero =
                  liste(q.get("identifier")).stream()
                      .anyMatch(i -> i.get("value") instanceof String v && !v.isBlank());
              Object periode = q.get("period");
              Object fin = periode instanceof Map<?, ?> p ? p.get("end") : null;
              return numero
                  && q.get("issuer") instanceof Map<?, ?>
                  && fin instanceof String f
                  && f.length() >= 10
                  && f.substring(0, 10).compareTo(jour) >= 0;
            });
  }

  @SuppressWarnings("unchecked")
  private static List<Map<String, Object>> liste(Object valeur) {
    if (!(valeur instanceof List<?> l)) return List.of();
    return l.stream().filter(Map.class::isInstance).map(x -> (Map<String, Object>) x).toList();
  }
}
