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
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** Faux serveur local ; données FICTIVES. */
class ClientDossierTest {

  private HttpServer serveur;
  private final List<String> requetes = new ArrayList<>();
  private int statut = 201;
  private String reponse = "{\"resourceType\":\"Patient\",\"id\":\"pat-fictif-123\"}";

  @BeforeEach
  void demarrer() throws IOException {
    serveur = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    serveur.createContext(
        "/",
        e -> {
          requetes.add(
              e.getRequestMethod()
                  + " "
                  + e.getRequestURI().getPath()
                  + " "
                  + e.getRequestHeaders().getFirst("authorization")
                  + " "
                  + new String(e.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
          byte[] o = reponse.getBytes(StandardCharsets.UTF_8);
          e.sendResponseHeaders(statut, o.length);
          e.getResponseBody().write(o);
          e.close();
        });
    serveur.start();
  }

  @AfterEach
  void arreter() {
    serveur.stop(0);
  }

  private ClientDossier client() {
    return new ClientDossier(
        URI.create("http://127.0.0.1:" + serveur.getAddress().getPort() + "/fhir/"),
        () -> "jeton-fictif");
  }

  @Test
  void creeLePatientParLaPasserelleEtRenvoieSonIdentifiant() {
    assertEquals(
        Optional.of("pat-fictif-123"), client().creerPatient(Map.of("resourceType", "Patient")));
    assertTrue(requetes.get(0).startsWith("POST /fhir/Patient Bearer jeton-fictif "));
  }

  @Test
  void refusOuReponseInattendueDonnentUnEchec() {
    statut = 422;
    assertEquals(Optional.empty(), client().creerPatient(Map.of()));
    statut = 201;
    reponse = "{\"id\":\"../../autre\"}";
    assertEquals(Optional.empty(), client().creerPatient(Map.of()));
    ClientDossier injoignable =
        new ClientDossier(URI.create("http://127.0.0.1:1/fhir/"), () -> "jeton-fictif");
    assertEquals(Optional.empty(), injoignable.creerPatient(Map.of()));
  }
}
