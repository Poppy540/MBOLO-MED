package sante.mbolo.keycloak;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Rôles qu'une inscription peut donner (ADR-0014, ADR-0019) : liste fermée. Le type du code vient du
 * service des invitations, jamais du formulaire ; aucun autre rôle (professionnel, administrateur…)
 * ne peut être obtenu par inscription.
 */
public final class RolesInscription {

  /** Types de codes que cette extension sait traiter, déclarés au service des invitations. */
  public static final List<String> TYPES = List.of("patient", "proche");

  /** Type de code → rôle du royaume. */
  private static final Map<String, String> ROLES = Map.of("patient", "patient", "proche", "proche");

  /** Attribut du compte d'un proche : sa fiche dans le dossier (RelatedPerson). */
  public static final String ATTRIBUT_PROCHE = "related_person_id";

  private static final Pattern IDENTIFIANT_FHIR = Pattern.compile("^[A-Za-z0-9.-]{1,64}$");

  private RolesInscription() {}

  /** Rôle à donner pour ce type de code, ou vide si le type n'est pas dans la liste fermée. */
  public static Optional<String> role(String type) {
    return Optional.ofNullable(type == null ? null : ROLES.get(type));
  }

  /**
   * Utilisation cohérente : type connu, et pour un proche une fiche au format d'un identifiant FHIR
   * (pour un patient, aucune fiche).
   */
  public static boolean coherente(String type, String relatedPersonId) {
    if (role(type).isEmpty()) return false;
    if ("proche".equals(type)) {
      return relatedPersonId != null && IDENTIFIANT_FHIR.matcher(relatedPersonId).matches();
    }
    return relatedPersonId == null;
  }
}
