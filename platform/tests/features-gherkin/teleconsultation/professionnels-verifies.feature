# language: fr
# Données FICTIVES uniquement. Règles : ADR-0026 (vérification des professionnels par un humain habilité).
@teleconsultation @vague1
Fonctionnalité: Seuls les professionnels vérifiés reçoivent des patients
  Afin de ne consulter que des professionnels dont le diplôme et l'inscription ont été vérifiés
  En tant que patient
  Je ne dois voir dans l'annuaire, et ne pouvoir réserver, que des professionnels vérifiés.

  Scénario: Un professionnel non vérifié n'apparaît pas aux patients, même avec un agenda
    Étant donné un créneau libre de "prac-fictif-candidat" est publié dans 11 jours
    Et que "patient-fictif-01" est connecté
    Alors l’annuaire de "patient-fictif-01" montre "prac-fictif-001" et pas "prac-fictif-candidat"
    Et les créneaux de "prac-fictif-candidat" ne sont pas proposés à "patient-fictif-01"
    Quand "patient-fictif-01" réserve le premier de ces créneaux
    Alors la réservation est refusée car le créneau n'est plus disponible
    Et le dossier médical garde ce créneau libre
