#!/usr/bin/env python3
"""Vérifie la conformité de tous les skills de Mbolo Santé (règles de CLAUDE.md).

Pour chaque SKILL.md (agents/**/skills/ et .claude/skills/) :
- frontmatter présent, `name` = nom du dossier, nom en minuscules-tirets (≤ 64 car.) ;
- `description` présente et ≤ 1024 caractères ;
- sections « Limites et interdits » et « Sources », au moins un exemple [FICTIF] ;
- moins de 500 lignes ;
- mention du comité médical si `validation-medicale` est déclarée ;
- nombre réel de cas de test ≥ compteur `cas-de-test` ; statut `complet` ⇒ au moins 3 cas.

Usage : python3 scripts/verifier_skills.py [racine]   (code de sortie 1 en cas d'erreur)
"""
import glob
import os
import re
import sys

MENTION_COMITE = "Contenu à valider par le comité médical avant toute mise en production."


def cas_de_test(chemin_skill: str, nom: str) -> int:
    if f"{os.sep}.claude{os.sep}skills{os.sep}" in chemin_skill:
        fichiers = glob.glob(os.path.join(os.path.dirname(chemin_skill), "evals", "*.md"))
    else:
        agent = chemin_skill.split(f"{os.sep}skills{os.sep}")[0]
        fichiers = [os.path.join(agent, "evals", f"{nom}.md")]
    texte = "".join(open(f, encoding="utf-8").read() for f in fichiers if os.path.exists(f))
    return len(re.findall(r"^## Cas \d+", texte, re.M))


def verifier(racine: str) -> list[str]:
    erreurs: list[str] = []
    chemins = sorted(
        set(glob.glob(os.path.join(racine, "agents", "**", "SKILL.md"), recursive=True))
        | set(glob.glob(os.path.join(racine, ".claude", "skills", "*", "SKILL.md")))
    )
    for chemin in chemins:
        rel = os.path.relpath(chemin, racine)
        texte = open(chemin, encoding="utf-8").read()
        dossier = os.path.basename(os.path.dirname(chemin))
        fm = re.match(r"^---\n(.*?)\n---\n", texte, re.S)
        if not fm:
            erreurs.append(f"{rel} : frontmatter absent")
            continue
        entete = fm.group(1)
        nom = re.search(r"^name: (.+)$", entete, re.M)
        desc = re.search(r"^description: (.+)$", entete, re.M)
        if not nom or nom.group(1).strip() != dossier:
            erreurs.append(f"{rel} : `name` différent du nom du dossier")
        if not re.fullmatch(r"[a-z0-9-]{1,64}", dossier):
            erreurs.append(f"{rel} : nom de dossier invalide")
        if not desc or len(desc.group(1)) > 1024:
            erreurs.append(f"{rel} : description absente ou > 1024 caractères")
        for section in ("## Limites et interdits", "## Sources"):
            if section not in texte:
                erreurs.append(f"{rel} : section « {section[3:]} » manquante")
        if "FICTIF" not in texte:
            erreurs.append(f"{rel} : aucun exemple [FICTIF]")
        if texte.count("\n") > 500:
            erreurs.append(f"{rel} : plus de 500 lignes")
        if "validation-medicale" in entete and MENTION_COMITE not in texte:
            erreurs.append(f"{rel} : mention du comité médical manquante")
        statut = re.search(r"statut: (\S+)", entete)
        compteur = re.search(r'cas-de-test: "(\d+)/\d+"', entete)
        if not statut or not compteur:
            erreurs.append(f"{rel} : metadata `statut` ou `cas-de-test` manquante")
            continue
        reel = cas_de_test(chemin, dossier)
        if reel < int(compteur.group(1)):
            erreurs.append(f"{rel} : {reel} cas trouvés, {compteur.group(1)} déclarés")
        if statut.group(1) == "complet" and reel < 3:
            erreurs.append(f"{rel} : statut complet mais seulement {reel} cas")
    print(f"{len(chemins)} skills vérifiés, {len(erreurs)} erreur(s).")
    return erreurs


if __name__ == "__main__":
    liste = verifier(sys.argv[1] if len(sys.argv) > 1 else ".")
    for e in liste:
        print(f"  - {e}")
    sys.exit(1 if liste else 0)
