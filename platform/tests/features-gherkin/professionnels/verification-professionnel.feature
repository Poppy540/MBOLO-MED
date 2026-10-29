# language: fr
# Données FICTIVES uniquement. Règles : ADR-0026 (vérification des professionnels), décisions du
# porteur de projet du 2026-10-28 (séparation des tâches demandée au service des invitations).
@professionnels @vague1
Fonctionnalité: Une personne habilitée vérifie le dossier d'un professionnel candidat
  Afin que seuls des professionnels vérifiés à la source consultent des patients
  En tant que personne chargée de la vérification des professionnels
  Je veux examiner le dossier du candidat, chaque consultation étant tracée, puis décider ; jamais pour un candidat que j'ai recruté.

  Scénario: La personne habilitée examine le dossier puis vérifie le candidat : fiche active et vérifiée
    Étant donné que "recruteur-fictif-01" est connecté
    Et que "recruteur-fictif-01" invite le professionnel "Fictif" "Verifie"
    Et que le candidat crée son compte avec ce code et configure la double authentification
    Et que le candidat accepte la charte, déclare son inscription et dépose ses trois pièces
    Et que "verificateur-pro-fictif-01" ouvre les professionnels à vérifier dans l’espace professionnel
    Quand la personne habilitée ouvre le dossier du candidat
    Alors dans l’"espace professionnel", le focus est sur le titre "Candidat"
    Quand elle regarde la photo de son diplôme
    Alors chaque consultation est tracée dans le dossier, sur la fiche du candidat
    Et l’écran de l’"espace professionnel" respecte les règles d’accessibilité
    Quand elle vérifie le candidat, les quatre points étant conformes, et confirme
    Alors la fiche du candidat est active et vérifiée, avec la fin de validité de son inscription
    Quand le candidat se reconnecte à l’espace professionnel
    Alors il arrive sur ses rendez-vous, avec le rôle professionnel et sans le rôle d’attente

  Scénario: Personne ne vérifie un candidat qu'il a recruté, ni sans le rôle de vérification
    Étant donné que "verificateur-pro-fictif-01" est connecté
    Et que "verificateur-pro-fictif-01" invite le professionnel "Fictif" "Separation"
    Et que "recruteur-fictif-01" est connecté
    Alors le dossier du candidat est refusé à "verificateur-pro-fictif-01" avec le statut 403
    Et le dossier du candidat est refusé à "recruteur-fictif-01" avec le statut 403
