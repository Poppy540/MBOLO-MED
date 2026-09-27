# language: fr
# Données FICTIVES uniquement. Règle : ADR-0010 (passerelle du dossier, permissions SMART).
@dossier @securite
Fonctionnalité: Accès au dossier médical par la passerelle
  Afin que le dossier médical ne soit lu que par des services autorisés, pour ce qui les concerne
  En tant que plateforme Mbolo Santé
  Je veux que chaque accès au dossier passe par la passerelle, avec un jeton de service
  et une permission explicite par type de ressource.

  Scénario: Une requête sans jeton est refusée
    Quand une requête sans jeton demande "Consent?patient=Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 401

  Scénario: Le jeton d'un patient n'ouvre pas le dossier directement
    Étant donné que "patient-fictif-01" est connecté
    Quand le jeton de "patient-fictif-01" est présenté au dossier pour lire "Patient/pat-fictif-001"
    Alors le dossier répond avec le statut 401

  Scénario: Le service identité lit les consentements d'un patient
    Étant donné que le service identité a obtenu son jeton de service
    Quand le service identité demande "Consent?patient=Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 200
    Et le dossier ne renvoie que des consentements

  Scénario: Le service identité ne peut pas lire le reste du dossier
    Étant donné que le service identité a obtenu son jeton de service
    Quand le service identité demande "Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 403

  Scénario: Le service identité ne peut pas élargir une recherche à d'autres ressources
    Étant donné que le service identité a obtenu son jeton de service
    Quand le service identité demande "Consent?patient=Patient/pat-fictif-001&_include=Consent:patient" au dossier
    Alors le dossier répond avec le statut 403

  Scénario: Aucun service ne peut supprimer un consentement
    Étant donné que le service identité a obtenu son jeton de service
    Quand le service identité tente de supprimer "Consent/1" du dossier
    Alors le dossier répond avec le statut 404

  Scénario: Une trace d'accès ne peut jamais être modifiée
    Étant donné que le service identité a obtenu son jeton de service
    Quand le service identité tente de modifier la trace d'accès "1"
    Alors le dossier répond avec le statut 403

  Scénario: Le service téléconsultation ne lit que les rendez-vous, les agendas et le statut d'identité
    Étant donné que le service téléconsultation a obtenu son jeton de service
    Quand le service téléconsultation demande "Appointment?patient=Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 200
    Quand le service téléconsultation demande "Consent?patient=Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 403
    Quand le service téléconsultation demande "Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 200
    Et le dossier ne renvoie que le statut de vérification d'identité
    Quand le service téléconsultation demande "Patient/pat-fictif-001?_elements=name,birthDate" au dossier
    Alors le dossier ne renvoie que le statut de vérification d'identité

  Scénario: Le service notifications ne lit que le numéro de téléphone
    Étant donné que le service notifications a obtenu son jeton de service
    Quand le service notifications demande "Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 200
    Et le dossier ne renvoie que le numéro de téléphone
    Quand le service notifications demande "Patient/pat-fictif-001?_elements=name" au dossier
    Alors le dossier ne renvoie que le numéro de téléphone
    Quand le service notifications demande "Consent?patient=Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 200
    Quand le service notifications demande "Condition?patient=Patient/pat-fictif-001" au dossier
    Alors le dossier répond avec le statut 403
