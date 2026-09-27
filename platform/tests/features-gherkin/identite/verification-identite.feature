# language: fr
# Données FICTIVES uniquement (photos générées, jamais de vraie personne). Règles : ADR-0014, ADR-0015.
# Charte en BROUILLON : le flag identite.photos n'est ouvert qu'aux comptes de test.
@identite @documents @securite
Fonctionnalité: Vérification d'identité par photos
  Afin qu'un médecin sache qui il soigne
  En tant que patient dont l'identité est à vérifier
  Je veux accepter la charte puis envoyer une photo de mon document et de mon visage,
  qu'une personne habilitée vérifiera.

  Scénario: Le patient accepte la charte puis envoie ses deux photos depuis l'application
    Quand "patient-fictif-03" ouvre l’application patient avant la vérification de son identité
    Et que le patient ouvre « Vérifier mon identité »
    Et que le patient accepte la charte de vérification d'identité
    Et que le patient envoie la photo de sa pièce d'identité puis celle de son visage
    Alors l'application indique que ses deux photos sont envoyées
    Et le dossier médical contient l'accord de "patient-fictif-03" à la charte "0.1"

  Scénario: Sans charte acceptée, aucune photo n'est reçue
    Étant donné que "patient-fictif-03" est connecté
    Et que "patient-fictif-03" n'a pas accepté la charte de vérification d'identité
    Quand "patient-fictif-03" envoie une photo de son visage
    Alors l'envoi est refusé avec le statut 403 et le message « Acceptez d'abord la charte de vérification d'identité. »

  Scénario: Un fichier qui n'est pas une photo est refusé, même annoncé comme photo
    Étant donné que "patient-fictif-03" est connecté
    Et que "patient-fictif-03" accepte la charte de vérification d'identité
    Quand "patient-fictif-03" envoie un document PDF présenté comme une photo
    Alors l'envoi est refusé avec le statut 415 et le message « Seules les photos JPEG ou PNG sont acceptées. »

  Scénario: Un patient dont l'identité est déjà vérifiée n'envoie plus de photo
    Étant donné que "patient-fictif-01" est connecté
    Et que "patient-fictif-01" accepte la charte de vérification d'identité
    Quand "patient-fictif-01" envoie une photo de son visage
    Alors l'envoi est refusé avec le statut 409 et le message « Votre identité est déjà vérifiée. »

  Scénario: Tant que la fonction n'est pas ouverte pour lui, le patient n'envoie aucune photo
    Étant donné que "patient-fictif-02" est connecté
    Quand "patient-fictif-02" envoie une photo de son visage
    Alors l'envoi est refusé avec le statut 403 et le message « Fonction non disponible. »
