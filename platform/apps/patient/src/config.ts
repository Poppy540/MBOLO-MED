// Configuration publique (aucun secret : l'application est un client public, PKCE obligatoire).
// Le Gabon est le premier pays : tout ce qui dépend du pays (fuseau, langue) est paramétrable au
// déploiement, sans modifier le code (VITE_FUSEAU, VITE_LANGUE, VITE_NOM_ASSURANCE, VITE_OPERATEURS,
// VITE_INDICATIF).
const env = import.meta.env;
const lire = (cle: string, defaut: string): string => (env[cle] as string | undefined) ?? defaut;

export const CONFIG = {
  emetteur: lire('VITE_KEYCLOAK_ISSUER', 'http://127.0.0.1:8081/realms/mbolo'),
  client: lire('VITE_KEYCLOAK_CLIENT', 'mbolo-app-patient'),
  api: '/api/teleconsultation',
  /** Charte d'identité (consentement C-IDENTITE) et dépôt des photos (ADR-0015). */
  apiIdentite: '/api/identite',
  apiDocuments: '/api/documents',
  /** Paiement des consultations par mobile money (ADR-0017). */
  apiPaiement: '/api/paiement',
  /** Opérateurs de mobile money du pays : « code:Nom affiché », séparés par des virgules. */
  operateurs: lire('VITE_OPERATEURS', 'airtel:Airtel Money,moov:Moov Money')
    .split(',')
    .map((x) => x.split(':'))
    .filter(([code, nom]) => Boolean(code && nom))
    .map(([code, nom]) => ({ code: code ?? '', nom: nom ?? '' })),
  /** Indicatif téléphonique du pays, sans « + » (Gabon : 241). */
  indicatif: lire('VITE_INDICATIF', '241'),
  /** Nom de l'assurance maladie nationale du pays déployé (Gabon : CNAMGS). */
  assurance: lire('VITE_NOM_ASSURANCE', 'CNAMGS'),
  /** Fuseau horaire du pays déployé (IANA). */
  fuseau: lire('VITE_FUSEAU', 'Africa/Libreville'),
  /** Langue et formats (BCP 47). */
  langue: lire('VITE_LANGUE', 'fr-FR'),
};
