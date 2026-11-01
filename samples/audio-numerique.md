---
cours: Traitement du signal audio
semaine: 3
---

Ces notes couvrent la conversion d'un signal audio analogique en signal numérique : échantillonnage, quantification et formats de fichiers.

# Échantillonnage

L'échantillonnage consiste à mesurer l'amplitude d'un signal continu à intervalles réguliers. Le nombre de mesures par seconde est la **fréquence d'échantillonnage** $f_e$, exprimée en hertz (Hz). La période d'échantillonnage est $T_e = \frac{1}{f_e}$.

## Théorème de Nyquist-Shannon

Pour reconstruire parfaitement un signal, la fréquence d'échantillonnage doit être strictement supérieure au double de la fréquence maximale contenue dans le signal :

$$
f_e > 2 \, f_{max}
$$

La moitié de la fréquence d'échantillonnage, $f_e / 2$, est appelée **fréquence de Nyquist**. Pour l'audio de qualité CD, $f_e = 44{,}1$ kHz, ce qui permet de représenter des fréquences jusqu'à 22,05 kHz, soit un peu au-delà de la limite de l'audition humaine (environ 20 kHz).

### Repliement spectral

Si le signal contient des fréquences supérieures à la fréquence de Nyquist, elles se « replient » et apparaissent comme des fréquences plus basses qui n'existaient pas dans le signal d'origine. Ce phénomène s'appelle le **repliement spectral** (*aliasing*). On l'évite en appliquant un **filtre anti-repliement** (filtre passe-bas) avant l'échantillonnage.

## Fréquences courantes

| Usage | Fréquence d'échantillonnage |
|---|---|
| Téléphonie | 8 kHz |
| CD audio | 44,1 kHz |
| Vidéo, DVD | 48 kHz |
| Studio haute résolution | 96 kHz ou 192 kHz |

# Quantification

La quantification associe chaque échantillon à une valeur entière parmi un nombre fini de niveaux. Avec une résolution de $n$ bits, on dispose de $2^n$ niveaux. Un CD utilise 16 bits, soit 65 536 niveaux.

## Bruit de quantification

L'arrondi de chaque échantillon introduit une erreur appelée **bruit de quantification**. Le rapport signal sur bruit théorique d'un quantificateur uniforme est approximativement :

$$
SNR \approx 6{,}02 \, n + 1{,}76 \ \text{dB}
$$

Chaque bit supplémentaire améliore donc le rapport signal sur bruit d'environ 6 dB. Un signal 16 bits atteint environ 98 dB.

## Calcul du débit

Le débit d'un flux audio non compressé (PCM) se calcule ainsi :

```python
# débit en bits par seconde
def debit_pcm(fe_hz: int, bits: int, canaux: int) -> int:
    return fe_hz * bits * canaux

print(debit_pcm(44_100, 16, 2))  # 1 411 200 bit/s pour un CD stéréo
```

# Formats de fichiers

Les formats **sans perte** (WAV, FLAC) conservent toutes les données : WAV stocke le PCM brut, tandis que FLAC le compresse sans perte, généralement à 50–60 % de la taille d'origine. Les formats **avec perte** (MP3, AAC, Opus) suppriment les informations jugées inaudibles grâce à un modèle psychoacoustique, ce qui réduit fortement la taille du fichier.

![Chaîne de numérisation](images/chaine-numerisation.png)
