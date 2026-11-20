# Google Lens pour Edge (v1.3 — Panneau latéral à droite)

Extension Manifest V3 légère pour retrouver **Google Lens** dans la barre d'outils de Microsoft Edge avec les résultats **directement dans le panneau latéral à droite (Side Panel)**, exactement comme dans Google Chrome — **sans aucune clé API**.

## Fonctionnalités
- **Bouton caméra dans la barre d'outils** (`Alt+Shift+L`) : ouvre instantanément la sélection sur la page sans popup intermédiaire.
- **Résultats à droite dans le panneau latéral Edge** : dès que vous relâchez la sélection (ou cliquez sur une image), le Side Panel s'ouvre à droite avec les vrais résultats Google Lens (Visuel, Traduire, Texte, Devoirs, Produits).
- **Bouton `↗ Onglet` + repli automatique** : ouvre la recherche en cours dans un grand onglet si besoin (et bascule automatiquement vers un onglet si le Side Panel est fermé/indisponible).
- **Clic direct sur une image / vidéo / canvas** : survolez une image et cliquez une fois pour la rechercher dans le panneau latéral.
- **Mode `Aperçu` optionnel (mémorisé)** : vérifiez, copiez (`Ctrl+C`) ou enregistrez en PNG avant d'envoyer.
- **Coller (`Ctrl+V` / bouton Coller)** : fonctionne pendant la sélection et directement dans le panneau latéral (pratique avec `Win+Maj+S`).
- **Menu clic droit** :
  - Sur une image : *Rechercher cette image avec Google Lens* (ouvre le panneau à droite).
  - Sur une page : *Rechercher une zone de l'écran avec Google Lens*.
  - Sur l'icône de l'extension : *Coller ou importer une image (Ctrl+V)*.

## Installation / Mise à jour dans Microsoft Edge
1. Clonez ou téléchargez ce dépôt.
2. Ouvrez `edge://extensions` et activez **Mode développeur**.
3. Cliquez sur **Charger l'extension décompressée** → sélectionnez le dossier de l'extension (ou cliquez sur **Actualiser ↻** si déjà chargée au même endroit).
4. Épinglez l'icône caméra depuis le menu **Extensions** (pièce de puzzle) pour la garder dans la barre d'outils.
