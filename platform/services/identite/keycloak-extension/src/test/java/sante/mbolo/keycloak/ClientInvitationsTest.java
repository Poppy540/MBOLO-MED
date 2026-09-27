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
    assertFalse(injoignable.utiliser("ABCD-EFGH", "sujet-fictif"));
  }

  @Test
  void utiliseLeCodePourLeCompteCree() {
    assertTrue(client().utiliser("ABCD-EFGH", "sujet-fictif"));
    assertTrue(requetes.get(0).startsWith("/inscription/utilisation Bearer jeton-fictif "));
    statut = 409;
    assertFalse(client().utiliser("ABCD-EFGH", "sujet-fictif"));
  }
}
