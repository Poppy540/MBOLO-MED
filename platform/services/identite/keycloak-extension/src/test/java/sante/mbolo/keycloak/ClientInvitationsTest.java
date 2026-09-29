package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Données FICTIVES : faux service des invitations sur une adresse locale. */
class ClientInvitationsTest {

  private HttpServer serveur;
  private final List<String> requetes = new ArrayList<>();
  private int statut = 200;
  private String reponse = "{\"valide\":true}";

  @BeforeEach
  void demarrer() throws IOException {
    serveur = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    serveur.createContext(
        "/",
        echange -> {
          String corps = new String(echange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
          requetes.add(
              echange.getRequestURI().getPath()
                  + " "
                  + echange.getRequestHeaders().getFirst("authorization")
                  + " "
                  + corps);
          byte[] octets = reponse.getBytes(StandardCharsets.UTF_8);
          echange.sendResponseHeaders(statut, octets.length);
          echange.getResponseBody().write(octets);
          echange.close();
        });
    serveur.start();
  }

  @AfterEach
  void arreter() {
    serveur.stop(0);
  }

  private ClientInvitations client() {
    return new ClientInvitations(
        URI.create("http://127.0.0.1:" + serveur.getAddress().getPort() + "/"),
        () -> "jeton-fictif");
  }

  @Test
  void controleUnCodeValableAvecLeJetonEtLAdresse() {
    assertEquals(ClientInvitations.Controle.VALIDE, client().controler("ABCD-EFGH", "192.0.2.1"));
    String requete = requetes.get(0);
    assertTrue(requete.startsWith("/inscription/controle Bearer jeton-fictif "));
    assertTrue(requete.contains("\"adresse\":\"192.0.2.1\""));
  }

  @Test
  void codeNonReconnuOuTropDEssais() {
    reponse = "{\"valide\":false}";
    assertEquals(ClientInvitations.Controle.NON_RECONNU, client().controler("ZZZZ-ZZZZ", "x"));
    statut = 429;
    reponse = "{}";
    assertEquals(ClientInvitations.Controle.TROP_D_ESSAIS, client().controler("ZZZZ-ZZZZ", "x"));
  }

  @Test
  void refuseSiLeServiceRepondMalOuEstInjoignable() {
    statut = 500;
    assertEquals(ClientInvitations.Controle.INDISPONIBLE, client().controler("ABCD-EFGH", "x"));
    statut = 200;
    reponse = "pas du json";
    assertEquals(ClientInvitations.Controle.INDISPONIBLE, client().controler("ABCD-EFGH", "x"));
    ClientInvitations injoignable =
        new ClientInvitations(URI.create("http://127.0.0.1:1/"), () -> "jeton-fictif");
    assertEquals(ClientInvitations.Controle.INDISPONIBLE, injoignable.controler("ABCD-EFGH", "x"));
    assertTrue(injoignable.utiliser("ABCD-EFGH", "sujet-fictif").isEmpty());
  }

  @Test
  void declareLesTypesDeCodesQueLExtensionSaitTraiter() {
    client().controler("ABCD-EFGH", "192.0.2.1");
    assertTrue(requetes.get(0).contains("\"types\":[\"patient\",\"proche\"]"));
  }

  @Test
  void utiliseLeCodePourLeCompteCree() {
    reponse = "{\"cohorte\":\"ville-fictive\",\"type\":\"patient\"}";
    assertEquals(
        Optional.of(new ClientInvitations.Utilisation("patient", null)),
        client().utiliser("ABCD-EFGH", "sujet-fictif"));
    assertTrue(requetes.get(0).startsWith("/inscription/utilisation Bearer jeton-fictif "));
    assertTrue(requetes.get(0).contains("\"types\":[\"patient\",\"proche\"]"));
    statut = 409;
    assertTrue(client().utiliser("ABCD-EFGH", "sujet-fictif").isEmpty());
  }

  @Test
  void codeDeProcheRattacheASaFiche() {
    reponse = "{\"cohorte\":\"proches\",\"type\":\"proche\",\"relatedPersonId\":\"rp-fictif-9\"}";
    assertEquals(
        Optional.of(new ClientInvitations.Utilisation("proche", "rp-fictif-9")),
        client().utiliser("ABCD-EFGH", "sujet-fictif"));
  }

  @Test
  void recuperationPourLeDossierDuCompte() {
    reponse = "{\"utilise\":true}";
    assertEquals(
        ClientInvitations.Recuperation.UTILISE,
        client().recuperer("ABCD-EFGH", "sujet-fictif", "pat-fictif-001", "192.0.2.1"));
    String requete = requetes.get(0);
    assertTrue(requete.startsWith("/recuperation/utilisation Bearer jeton-fictif "));
    assertTrue(requete.contains("\"patientId\":\"pat-fictif-001\""));
    assertTrue(requete.contains("\"adresse\":\"192.0.2.1\""));
  }

  @Test
  void recuperationRefuseeOuIndisponibleNeDonneJamaisAcces() {
    statut = 409;
    reponse = "{\"motif\":\"code-non-reconnu\"}";
    assertEquals(
        ClientInvitations.Recuperation.NON_RECONNU, client().recuperer("ZZZZ-ZZZZ", "s", "p", "x"));
    statut = 429;
    assertEquals(
        ClientInvitations.Recuperation.TROP_D_ESSAIS,
        client().recuperer("ZZZZ-ZZZZ", "s", "p", "x"));
    // Réponse 200 incohérente, erreur, service injoignable : jamais utilisé.
    for (String r : List.of("{\"utilise\":false}", "{}", "pas du json")) {
      statut = 200;
      reponse = r;
      assertEquals(
          ClientInvitations.Recuperation.INDISPONIBLE,
          client().recuperer("ABCD-EFGH", "s", "p", "x"),
          r);
    }
    statut = 500;
    assertEquals(
        ClientInvitations.Recuperation.INDISPONIBLE, client().recuperer("ABCD-EFGH", "s", "p", "x"));
    assertEquals(
        ClientInvitations.Recuperation.INDISPONIBLE,
        new ClientInvitations(URI.create("http://127.0.0.1:1/"), () -> "jeton-fictif")
            .recuperer("ABCD-EFGH", "s", "p", "x"));
  }

  @Test
  void refuseUneReponseIncoherente() {
    // Type hors de la liste fermée, proche sans fiche, ou réponse sans type : jamais de compte.
    for (String r :
        List.of(
            "{\"type\":\"professionnel\"}",
            "{\"type\":\"proche\"}",
            "{\"type\":\"proche\",\"relatedPersonId\":\"../x\"}",
            "{\"cohorte\":\"ville-fictive\"}",
            "{\"valide\":true}")) {
      reponse = r;
      assertTrue(client().utiliser("ABCD-EFGH", "sujet-fictif").isEmpty(), r);
    }
  }
}
