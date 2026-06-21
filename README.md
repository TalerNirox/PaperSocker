# ⚽ Paper Soccer

Une adaptation HTML5 du célèbre jeu de papier et crayon « Paper Soccer » (le « petit bonhomme »), jouable en solo contre une IA ou en multijoueur local entre amis.

## 🎮 Comment jouer

Le jeu se déroule sur une grille. À chaque tour, vous tracez une ligne depuis la position actuelle du ballon vers un point adjacent (y compris en diagonale). Le ballon **rebondit** lorsqu'il atteint un bord, un coin, ou un point déjà visité — ce qui vous offre un coup supplémentaire. L'objectif est d'atteindre le but adverse avant que votre adversaire n'atteigne le vôtre.

- **Déplacer** : cliquez sur un point voisin valide pour envoyer le ballon
- **Règle du rebond** : si le ballon atterrit sur un point déjà utilisé ou sur le bord du terrain, vous rejouez
- **Victoire** : amenez le ballon dans le but adverse

## ✨ Fonctionnalités

- 🤖 Mode solo contre une IA
- 👥 Mode 2 joueurs en local
- ↩️ Annulation du dernier coup
- 🖥️ Support du plein écran
- 📱 Design responsive (ordinateur & mobile)

## 🛠️ Stack technique

- JavaScript natif (sans framework)
- HTML5 Canvas
- CSS3

## 🚀 Jouer en ligne

👉 [Jouer sur GitHub Pages](https://talernirox.github.io/PaperSocker)

## 📁 Structure du projet

\```
├── index.html    # Structure de la page
├── style.css     # Mise en forme et thème visuel
└── game.js       # Logique du jeu (règles, IA, rendu canvas)
\```
