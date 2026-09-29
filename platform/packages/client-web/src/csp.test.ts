// Politique de sécurité du contenu (revue ASVS n°1, C6). Adresses FICTIVES uniquement.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { avecCsp, blocsStyle, politiqueSecurite } from './csp.js';

const directive = (csp: string, nom: string) =>
  csp.split('; ').find((d) => d.startsWith(`${nom} `));

describe('politiqueSecurite', () => {
  it('scripts de la même origine seulement, rien de tiers, pas d’objet embarqué', () => {
    const csp = politiqueSecurite({ emetteur: 'https://auth.example/realms/mbolo', styles: [] });
    expect(directive(csp, 'script-src')).toBe("script-src 'self'");
    expect(directive(csp, 'object-src')).toBe("object-src 'none'");
    expect(directive(csp, 'base-uri')).toBe("base-uri 'self'");
    expect(csp).not.toContain('unsafe-inline');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('connexions : même origine, Keycloak, visio en ws(s) et http(s)', () => {
    const csp = politiqueSecurite({
      emetteur: 'https://auth.example/realms/mbolo',
      webrtc: 'wss://visio.example:7443',
      styles: [],
    });
    expect(directive(csp, 'connect-src')).toBe(
      "connect-src 'self' https://auth.example wss://visio.example:7443 https://visio.example:7443",
    );
  });

  it('styles en ligne autorisés par leur empreinte exacte, pas en bloc', () => {
    const style = '\n      body { margin: 0; }\n    ';
    const csp = politiqueSecurite({
      emetteur: 'http://127.0.0.1:8081/realms/mbolo',
      styles: [style],
    });
    const empreinte = createHash('sha256').update(style, 'utf8').digest('base64');
    expect(directive(csp, 'style-src')).toBe(`style-src 'self' 'sha256-${empreinte}'`);
  });
});

describe('avecCsp', () => {
  it('insère la balise après charset, avec l’empreinte du style de la page', () => {
    const html =
      '<html><head>\n    <meta charset="utf-8" />\n    <style>a{}</style></head><body></body></html>';
    expect(blocsStyle(html)).toEqual(['a{}']);
    const resultat = avecCsp(html, { emetteur: 'http://127.0.0.1:8081/realms/mbolo' });
    expect(resultat).toMatch(
      /<meta charset="utf-8" \/>\n {4}<meta http-equiv="Content-Security-Policy" content="default-src 'self'; /,
    );
    expect(resultat).toContain(
      `'sha256-${createHash('sha256').update('a{}', 'utf8').digest('base64')}'`,
    );
  });
});
