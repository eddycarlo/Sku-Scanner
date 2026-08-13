# CIS Scanner

Appli web (PWA) pour iPhone : scanne un code-barres en magasin, l'appli dit tout de suite si le produit est déjà acheté ou pas, selon la base CIS Product Database.

## Ce que ça fait

- Scan caméra en direct (pas besoin d'appuyer sur un bouton pour chaque code, juste pointer).
- Banniere ROUGE = "PAS ENCORE ACHETÉ", VERTE = "DÉJÀ ACHETÉ", ORANGE = code introuvable dans la base.
- Recherche manuelle par marque/description si un code est endommagé ou que la caméra a de la misère.
- Fonctionne hors-ligne une fois ouvert une première fois (mise en cache de l'appli).
- Bouton "Marquer comme acheté" pendant le scan — ça reste LOCAL sur ton téléphone (localStorage), pas envoyé nulle part, et c'est temporaire (juste pour ce magasinage-ci). L'onglet "À reporter" liste tout ce que tu as marqué localement, avec un bouton pour copier la liste et la coller dans une conversation Claude.

## Déploiement sur GitHub Pages

1. Crée un nouveau repo GitHub (public — Pages gratuit demande un repo public, sauf si t'as GitHub Pro).
2. Mets tous les fichiers de ce dossier (`index.html`, `app.js`, `style.css`, `manifest.json`, `sw.js`, `products.json`, `vendor/`, `icons/`) à la racine du repo — glisser-déposer dans l'interface web GitHub fonctionne, pas besoin de git en ligne de commande.
3. Va dans **Settings → Pages**. Sous "Build and deployment", choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`. Sauvegarde.
4. Attends ~1 minute. Ton adresse va être `https://<ton-username>.github.io/<nom-du-repo>/`.
5. Sur ton iPhone, ouvre cette adresse dans **Safari** (pas Chrome — l'ajout à l'écran d'accueil en mode app plein écran, c'est une fonction Safari sur iOS).
6. Appuie sur le bouton **Partager** (le carré avec la flèche) → **Sur l'écran d'accueil**. L'icône CIS Scanner apparaît, et ça s'ouvre en plein écran comme une vraie appli.
7. Au premier lancement, autorise l'accès à la caméra quand Safari le demande.

## Mettre à jour un statut (acheté / à acheter)

**Claude est la seule source de vérité.** `products.json` sur GitHub n'est qu'une copie exportée pour que l'appli fonctionne hors-ligne sur ton téléphone — ne jamais l'éditer à la main directement.

Le flux :

1. En magasin, tu scannes et tu marques "Acheté" dans l'appli au besoin (ça reste local, temporaire).
2. De retour dans une conversation Claude, va dans l'onglet "À reporter" de l'appli, appuie sur **Copier la liste pour Claude**, et colle-la dans le chat.
3. Claude met à jour `cis_products_v1.csv` dans le projet "CIS - Product Database" (la vraie base).
4. Claude régénère `products.json` à partir de la base mise à jour et te le redonne.
5. Tu remplaces le fichier dans ton repo : sur GitHub.com, va dans le repo → **Add file → Upload files** → dépose le nouveau `products.json` (même nom, ça écrase l'ancien) → commit.
6. GitHub Pages redéploie automatiquement en ~30-60 secondes. La prochaine fois que t'ouvres l'appli (avec une connexion), la nouvelle donnée se charge.
7. Retourne dans l'onglet "À reporter" de l'appli et efface les mises à jour locales une fois reportées.

Aucune édition manuelle de JSON — juste copier/coller et remplacer un fichier.

## Limites connues

- La correspondance des codes-barres se fait sur les 10-12 derniers chiffres (pas juste une égalité stricte), pour gérer les UPC tronqués dans les données Nielsen. Dans de très rares cas, ça peut faire un faux match si deux produits différents partagent les mêmes derniers chiffres — l'appli l'indique quand c'est ambigu.
- Le bouton "Marquer comme acheté" ne modifie PAS `products.json` sur GitHub automatiquement (ça demanderait un serveur/backend et une gestion d'authentification — évité exprès pour rester simple, gratuit, et pour que Claude reste la seule vraie base de données). C'est juste une note locale sur ton téléphone, à reporter via Claude.
- Si tu n'ouvres pas l'appli pendant plusieurs semaines, iOS peut vider les données locales de Safari (y compris tes notes "À reporter" pas encore copiées) — reporte-les à Claude assez régulièrement plutôt que de les laisser s'accumuler.
