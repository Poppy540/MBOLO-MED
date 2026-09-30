package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Données FICTIVES : faux service documents sur une adresse locale (ADR-0023, téléphone perdu). */
class ClientDocumentsTest {

  private HttpServer serveur;
  private final List<String> requetes = new ArrayList<>();
  private int statut = 201;

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
          echange.sendResponseHeaders(statut, -1);
          echange.close();
        });
    serveur.start();
  }

  @AfterEach
  void arreter() {
    serveur.stop(0);
  }

  private ClientDocuments client() {
    return new ClientDocuments(
        URI.create("http://127.0.0.1:" + serveur.getAddress().getPort() + "/"),
        () -> "jeton-fictif");
  }

  @Test
  void ouvreLaDemandeAvecLeJetonDeService() {
    assertEquals(
        ClientDocuments.Ouverture.OUVERTE,
        client().ouvrirDemandePerte("pat-fictif-005", "+241 00 00 00 08"));
    String requete = requetes.get(0);
    assertTrue(requete.startsWith("/demandes-perte Bearer jeton-fictif "));
    assertTrue(requete.contains("\"patientId\":\"pat-fictif-005\""));
    assertTrue(requete.contains("\"telephone\":\"+241 00 00 00 08\""));
  }

  @Test
  void demandeDejaEnCoursOuServiceEnPanne() {
    statut = 409;
    assertEquals(
        ClientDocuments.Ouverture.DEJA_EN_COURS,
        client().ouvrirDemandePerte("pat-fictif-005", "+241 00 00 00 08"));
    statut = 503;
    assertEquals(
        ClientDocuments.Ouverture.RATEE,
        client().ouvrirDemandePerte("pat-fictif-005", "+241 00 00 00 08"));
    serveur.stop(0);
    assertEquals(
        ClientDocuments.Ouverture.RATEE,
        client().ouvrirDemandePerte("pat-fictif-005", "+241 00 00 00 08"));
  }

  @Test
  void refuseUnIdentifiantDeDossierInattendu() {
    assertEquals(
        ClientDocuments.Ouverture.RATEE,
        client().ouvrirDemandePerte("../Practitioner/x", "+241 00 00 00 08"));
    assertEquals(0, requetes.size());
  }
}
