package sante.mbolo.keycloak;

import static org.junit.jupiter.api.Assertions.assertFalse;
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

/** Données FICTIVES : faux service des notifications sur une adresse locale. */
class ClientNotificationsTest {

  private HttpServer serveur;
  private final List<String> requetes = new ArrayList<>();
  private int statut = 202;
  private String reponse = "{\"resultat\":\"envoyee\"}";

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

  private ClientNotifications client() {
    return new ClientNotifications(
        URI.create("http://127.0.0.1:" + serveur.getAddress().getPort() + "/"),
        () -> "jeton-fictif");
  }

  @Test
  void envoieLeCodePourLeDossierAvecLeJeton() {
    assertTrue(client().envoyerCode("pat-fictif-005", "482913"));
    String requete = requetes.get(0);
    assertTrue(requete.startsWith("/codes-connexion Bearer jeton-fictif "));
    assertTrue(requete.contains("\"patientId\":\"pat-fictif-005\""));
  }

  @Test
  void envoiRateSiLeServiceNeConfirmePas() {
    for (String r : List.of("{\"resultat\":\"ignoree-sans-numero\"}", "{}", "pas du json")) {
      reponse = r;
      assertFalse(client().envoyerCode("pat-fictif-005", "482913"), r);
    }
    statut = 403;
    reponse = "{\"resultat\":\"envoyee\"}";
    assertFalse(client().envoyerCode("pat-fictif-005", "482913"));
    assertFalse(
        new ClientNotifications(URI.create("http://127.0.0.1:1/"), () -> "jeton-fictif")
            .envoyerCode("pat-fictif-005", "482913"));
  }
}
