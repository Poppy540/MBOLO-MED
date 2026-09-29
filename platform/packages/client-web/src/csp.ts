// Politique de sécurité du contenu des applications (revue ASVS n°1, C6).
// Posée dans une balise <meta> à la construction (vite build) ; les en-têtes complets
// (frame-ancestors, HSTS, Referrer-Policy) restent à configurer sur l'hébergement, car une balise
// <meta> ne peut pas les porter.
// Fonction pure : utilisée par les vite.config.ts des applications, testée ici.
import { createHash } from 'node:crypto';

export interface OptionsCsp {
  /** Émetteur Keycloak (ex. https://auth.example/realms/mbolo) : l'application y échange le code. */
  emetteur: string;
  /** Serveur de visio (ex. wss://visio.example) ; absent : pas de visio. */
  webrtc?: string;
  /** Contenu exact des blocs <style> de la page, autorisés par leur empreinte. */
  styles: readonly string[];
}

/** Origine d'une adresse ; pour la visio, la même origine en ws(s) et en http(s). */
function origines(adresse: string, avecEquivalent: boolean): string[] {
  const u = new URL(adresse);
  const origine = `${u.protocol}//${u.host}`;
  if (!avecEquivalent) return [origine];
  const equivalent = { 'ws:': 'http:', 'wss:': 'https:', 'http:': 'ws:', 'https:': 'wss:' }[
    u.protocol
  ];
  return equivalent ? [origine, `${equivalent}//${u.host}`] : [origine];
}

export function politiqueSecurite(o: OptionsCsp): string {
  const connect = [
    "'self'",
    ...origines(o.emetteur, false),
    ...(o.webrtc ? origines(o.webrtc, true) : []),
  ];
  const styles = o.styles.map(
    (s) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`,
  );
  return [
    "default-src 'self'",
    "script-src 'self'",
    ["style-src 'self'", ...styles].join(' '),
    // Photos d'identité affichées depuis un blob (jamais une adresse externe).
    "img-src 'self' blob:",
    "media-src 'self' blob:",
    `connect-src ${[...new Set(connect)].join(' ')}`,
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

/** Blocs <style> d'une page HTML (contenu exact, pour l'empreinte). */
export function blocsStyle(html: string): string[] {
  return [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1] ?? '');
}

/** Insère la balise <meta> de la politique juste après la balise <meta charset>. */
export function avecCsp(html: string, o: Omit<OptionsCsp, 'styles'>): string {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${politiqueSecurite({
    ...o,
    styles: blocsStyle(html),
  })}" />`;
  return html.replace(/(<meta charset="utf-8" \/>)/, `$1\n    ${meta}`);
}
