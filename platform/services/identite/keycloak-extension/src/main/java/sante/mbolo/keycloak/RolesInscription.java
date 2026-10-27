package sante.mbolo.keycloak;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Rôles qu'une inscription peut donner (ADR-0014, ADR-0019, ADR-0026) : liste fermée. Le type du code
 * vient du service des invitations, jamais du formulaire ; aucun autre rôle (professionnel,
 * administrateur…) ne peut être obtenu par inscription. Un professionnel invité ne reçoit que le rôle
 * d'attente {@code professionnel-candidat} : seule sa vérification par une personne habilitée lui
 * donnera le rôle {@code professionnel}.
 */
public final class RolesInscription {

  /** Types de codes que cette extension sait traiter, déclarés au service des invitations. */
  public static final List<String> TYPES = List.of("patient", "proche", "professionnel");

  /** Type de code → rôle du royaume. */
  private static final Map<String, String> ROLES =
      Map.of("patient", "patient", "proche", "proche", "professionnel", "professionnel-candidat");

  /** Attribut du compte d'un proche : sa fiche dans le dossier (RelatedPerson). */
  public static final String ATTRIBUT_PROCHE = "related_person_id";

  /** Attribut du compte d'un professionnel : sa fiche dans le dossier (Practitioner inactif). */
  public static final String ATTRIBUT_PRATICIEN = "practitioner_id";

  private static final Pattern IDENTIFIANT_FHIR = Pattern.compile("^[A-Za-z0-9.-]{1,64}$");

  private RolesInscription() {}

  /** Rôle à donner pour ce type de code, ou vide si le type n'est pas dans la liste fermée. */
  public static Optional<String> role(String type) {
    return Optional.ofNullable(type == null ? null : ROLES.get(type));
  }

  /**
   * Utilisation cohérente : type connu ; un proche a sa fiche (RelatedPerson), un professionnel la
   * sienne (Practitioner), chacune au format d'un identifiant FHIR, et rien d'autre ; un patient
   * n'a aucune fiche à ce stade.
   */
  public static boolean coherente(String type, String relatedPersonId, String practitionerId) {
    if (role(type).isEmpty()) return false;
    return switch (type) {
      case "proche" -> fiche(relatedPersonId) && practitionerId == null;
      case "professionnel" -> fiche(practitionerId) && relatedPersonId == null;
      default -> relatedPersonId == null && practitionerId == null;
    };
  }

  private static boolean fiche(String id) {
    return id != null && IDENTIFIANT_FHIR.matcher(id).matches();
  }
}
