# KOUIZE

KOUIZE transforme tes notes de cours en quiz pour réviser, seul ou avec ta classe. Tu gagnes des XP, tu montes de niveau, tu débloques des badges et tu grimpes dans le classement.

## Ce que tu peux faire

- **Jouer aux quiz de ta classe** : rejoins la classe de ton enseignant avec son code et son mot de passe.
- **Créer tes propres classes** :
  - **privée** : tu invites tes amis par e-mail, et eux seuls la voient ;
  - **personnelle** : rien que pour toi, pour t'entraîner et suivre tes progrès.
- **Ajouter des quiz faits avec ton IA** (ChatGPT, Claude, Gemini…) à partir de tes propres notes, rangés par matière. Chaque membre d'une classe peut en ajouter.
- **Partager tes notes** : joins à chaque quiz les notes d'où il vient (PDF, TXT ou MD). Toute la classe peut les lire dans l'onglet **Notes**.
- **Suivre ta progression** : score, temps et correction détaillée à chaque tentative, XP, niveaux, badges, classement de la semaine et depuis le début.

## Commencer

1. Crée un compte avec ton nom, ton e-mail et un mot de passe.
2. Sur **Mes classes** :
   - **Rejoindre avec un code** pour la classe de ton enseignant ;
   - **Nouvelle classe** pour créer la tienne.
3. Si quelqu'un t'a invité, ouvre le lien reçu par e-mail. L'invitation apparaît aussi sur ta page d'accueil dès que tu te connectes avec cette adresse.

Tu retrouves tout en te connectant, sur n'importe quel appareil.

## Ajouter un quiz avec ton IA

1. Dans une classe, clique sur **Ajouter un quiz**.
2. Choisis la **matière** du quiz parmi celles de la classe, ou crée-en une nouvelle (un nom et un emoji).
3. Clique sur **Copier le prompt pour ton IA**, colle-le dans ton IA, suivi de tes notes (texte, PDF, diapositives : tout ce que ton IA sait lire).
4. Copie sa réponse et colle-la dans KOUIZE. Tu peux aussi l'enregistrer dans un fichier `.json` et l'envoyer.
5. Si tu veux, joins tes notes (PDF, TXT ou MD, jusqu'à 5 fichiers de 15 Mo), puis clique sur **Ajouter le quiz**.

Si quelque chose ne va pas, KOUIZE t'indique quelle question corriger : demande simplement à ton IA de la refaire.

Les quiz peuvent mélanger cinq types de questions : choix multiple, plusieurs réponses, vrai/faux, réponse courte et texte à trous.

## Lire les notes

L'onglet **Notes** d'une classe rassemble les notes de tous les membres, rangées par matière puis par quiz, avec qui les a ajoutées. Clique sur un fichier pour le lire dans la page : les fichiers Markdown sont mis en forme, les PDF s'ouvrent dans la visionneuse du navigateur, et tu peux tout télécharger.

Pour ajouter des notes plus tard à un quiz que tu as ajouté, clique sur le trombone à côté de ce quiz. Tu peux supprimer les notes que tu as ajoutées ; la personne qui gère la classe peut supprimer toutes les notes.

Les notes ne sont visibles que par les membres de la classe.

## Jouer

- **Entraînement** : la réponse et l'explication s'affichent après chaque question.
- **Examen** : tout est corrigé à la fin, avec une limite de temps si tu veux.
- **Fiches** : révise les questions comme des cartes à retourner.

Raccourcis clavier : `1` à `9` pour choisir, `Entrée` pour valider, `←` `→` pour naviguer, `F` pour marquer une question.

**Comment les points sont comptés :**
- Chaque bonne réponse rapporte 10, 20 ou 30 XP selon sa difficulté.
- Seule ta **meilleure tentative** sur chaque quiz compte : refaire un quiz peut améliorer ton score, mais pas cumuler des points.

Tu as repéré une erreur dans une question ? Clique sur **Suggérer une correction** : la personne qui gère la classe la verra.

## Gérer ta classe

Dans l'onglet **Gérer** de ta classe, tu peux :
- inviter des gens par e-mail et annuler des invitations ;
- voir les membres et en retirer ;
- masquer ou supprimer n'importe quel quiz de la classe ;
- traiter les suggestions de correction ;
- renommer la classe, la passer de privée à personnelle (ou l'inverse), ou la supprimer.

Chaque membre peut masquer ou supprimer les quiz qu'il a lui-même ajoutés, et leurs notes.

## Pour les enseignants

Les enseignants préparent leurs quiz dans le **studio** KOUIZE sur leur ordinateur : ils déposent leurs notes, l'IA écrit des questions tirées uniquement de ces notes, puis ils les publient dans leurs classes en ligne. Les élèves rejoignent ces classes avec un code et un mot de passe.

Depuis la page **Admin**, l'enseignant voit et gère toutes les classes, y compris celles créées par les élèves : il peut masquer ou supprimer n'importe quel quiz ou fichier de notes, retirer des joueurs, archiver ou supprimer une classe, et changer son mot de passe admin.

## Installer et héberger

Les instructions techniques (lancer le studio, mettre le site en ligne, configurer les e-mails) sont dans [docs/INSTALL.md](docs/INSTALL.md).
