# language: fr
# Données FICTIVES uniquement. Règles : ADR-0026, étape 5 (décision du porteur de projet du
# 2026-10-29 : les rendez-vous à venir d'un professionnel suspendu ou à revérifier sont signalés à
# l'équipe, jamais annulés automatiquement).
@professionnels @vague1
Fonctionnalité: L'équipe d'assistance voit les rendez-vous à reprendre
  Afin de prévenir chaque patient et de lui proposer un autre médecin
  En tant que membre de l'équipe d'assistance aux patients
  Je veux la liste des rendez-vous à venir chez un professionnel qui n'est plus vérifié.

  Scénario: La liste est réservée à l'équipe d'assistance
    Étant donné que "assistant-fictif-01" est connecté
    Et que "patient-fictif-01" est connecté
    Alors "assistant-fictif-01" obtient la liste des rendez-vous à reprendre, sans cache
    Et la liste des rendez-vous à reprendre est refusée à "patient-fictif-01"
