package sante.mbolo.keycloak;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Identité saisie par le patient juste après son inscription (ADR-0014) : validation, puis ressource
 * FHIR {@code Patient} conforme au profil mbolo-patient, au statut « à vérifier ». Aucune donnée
 * n'est conservée dans Keycloak : elle va dans le dossier.
 */
final class SaisieIdentite {

  static final String CANONIQUE = "https://mbolo-sante.example/fhir";
  static final String PROFIL = CANONIQUE + "/StructureDefinition/mbolo-patient";
  static final String EXTENSION_STATUT = CANONIQUE + "/StructureDefinition/statut-identite";
  static final String SYSTEME_TYPE_IDENTIFIANT = CANONIQUE + "/CodeSystem/mbolo-type-identifiant-patient";
  static final String SYSTEME_MARQUEUR = CANONIQUE + "/CodeSystem/mbolo-marqueur";

  static final List<String> CHAMPS =
      List.of("nom", "prenom", "naissance", "sexe", "telephone", "numero_assurance");

  private static final Pattern NOM = Pattern.compile("^\\p{L}[\\p{L} '\\-]{0,79}$");
  private static final Pattern TELEPHONE = Pattern.compile("^\\+?[0-9 ]{6,20}$");
  private static final Pattern NUMERO = Pattern.compile("^[A-Za-z0-9\\-]{1,32}$");
  private static final Set<String> SEXES = Set.of("", "female", "male", "other", "unknown");

  record Erreur(String champ, String message) {}

  final String nom;
  final String prenom;
  final String naissance;
  final String sexe;
  final String telephone;
  final String numeroAssurance;

  private SaisieIdentite(Function<String, String> champ) {
    nom = propre(champ.apply("nom"));
    prenom = propre(champ.apply("prenom"));
    naissance = propre(champ.apply("naissance"));
    sexe = propre(champ.apply("sexe"));
    telephone = propre(champ.apply("telephone"));
    numeroAssurance = propre(champ.apply("numero_assurance")).toUpperCase();
  }

  static SaisieIdentite depuis(Function<String, String> champ) {
    return new SaisieIdentite(champ);
  }

  private static String propre(String s) {
    return s == null ? "" : s.strip().replaceAll("\\s+", " ");
  }

  List<Erreur> erreurs(LocalDate aujourdhui) {
    List<Erreur> e = new ArrayList<>();
    if (!NOM.matcher(nom).matches()) e.add(new Erreur("nom", "mboloNomInvalide"));
    if (!NOM.matcher(prenom).matches()) e.add(new Erreur("prenom", "mboloPrenomInvalide"));
    try {
      LocalDate d = LocalDate.parse(naissance);
      if (d.isAfter(aujourdhui) || d.isBefore(LocalDate.of(1900, 1, 1))) {
        e.add(new Erreur("naissance", "mboloNaissanceInvalide"));
      }
    } catch (DateTimeParseException x) {
      e.add(new Erreur("naissance", "mboloNaissanceInvalide"));
    }
    if (!SEXES.contains(sexe)) e.add(new Erreur("sexe", "mboloSexeInvalide"));
    if (!TELEPHONE.matcher(telephone).matches()) {
      e.add(new Erreur("telephone", "mboloTelephoneInvalide"));
    }
    if (!numeroAssurance.isEmpty() && !NUMERO.matcher(numeroAssurance).matches()) {
      e.add(new Erreur("numero_assurance", "mboloNumeroInvalide"));
    }
    return e;
  }

  /**
   * Ressource Patient (profil mbolo-patient). Le numéro d'assurance maladie n'est retenu que si le
   * système du pays est configuré ; sinon un professionnel attribuera un numéro provisoire.
   *
   * @param fictif hors production, la ressource porte le marqueur « fictif » (principe n°4)
   */
  Map<String, Object> versPatient(boolean fictif, String systemeAssurance) {
    Map<String, Object> meta = new LinkedHashMap<>();
    meta.put("profile", List.of(PROFIL));
    if (fictif) meta.put("tag", List.of(Map.of("system", SYSTEME_MARQUEUR, "code", "fictif")));
    Map<String, Object> p = new LinkedHashMap<>();
    p.put("resourceType", "Patient");
    p.put("meta", meta);
    p.put("extension", List.of(Map.of("url", EXTENSION_STATUT, "valueCode", "a-verifier")));
    if (!numeroAssurance.isEmpty() && systemeAssurance != null && !systemeAssurance.isBlank()) {
      p.put(
          "identifier",
          List.of(
              Map.of(
                  "system",
                  systemeAssurance,
                  "type",
                  Map.of(
                      "coding",
                      List.of(Map.of("system", SYSTEME_TYPE_IDENTIFIANT, "code", "assurance-maladie"))),
                  "value",
                  numeroAssurance)));
    }
    p.put("name", List.of(Map.of("family", nom, "given", List.of(prenom))));
    if (!sexe.isEmpty()) p.put("gender", sexe);
    p.put("birthDate", naissance);
    p.put("telecom", List.of(Map.of("system", "phone", "value", telephone, "use", "mobile")));
    return p;
  }
}
