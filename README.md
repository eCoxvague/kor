# KOR — orman ateşi bekliyor

Odun kes, ateşi besle, karanlık yaklaşmadan güçlen: saf HTML + Canvas 2D ile yazılmış, bağımlılığı ve derleme adımı olmayan bir tarayıcı oyunu.

**Oyna:** https://ecoxvague.github.io/kor/

## Sınıflar

- **Baltacı** — Yakın dövüşte dayanıklı oduncu. Geniş savurma, yüksek can; yaklaşmak gerekir. Dallar: Balta, Kor, Kök.
- **Okçu** — Menzilden vuran, hızlı avcı. Uzaktan güvenli kesim, geniş toplama; canı düşük. Dallar: Yay, İz, Kor.
- **Büyücü** — Isıyla büyü yapan alan ustası. Patlama çok hedefi vurur; büyü ısı harcar, canı en düşük. Dallar: Alev, Ayaz, Kül.

Her sınıfın 3 dalı, her dalda 4 düğümü ve 4 yeteneği vardır.

## Kontroller

| Tuş | İşlev |
| --- | --- |
| W A S D | Hareket |
| Sol tık / Boşluk | Saldır (basılı tut) |
| E | Odunu ateşe at |
| F | Beceri ağacını aç / kapat |
| 1, 2, 3, Q | Yetenekler |
| Shift | Atıl |
| ESC / P | Duraklat (ESC açık ağacı da kapatır) |
| M | Sesi aç / kapat |
| C | Sınıf değiştir (duraklatılmışken ya da ölüm ekranında) |

Beceri ağacında ok tuşları ya da WASD ile gezin, Enter ya da tıklama ile düğümü al.

## Yerelde çalıştırma

Depoyu indir, klasörün içinde bir yerel sunucu başlat:

```
python -m http.server 5173
```

Sonra tarayıcıda `http://localhost:5173` adresini aç. Oyun ES modülleri kullandığı için `index.html` dosyasına çift tıklamak çalışmaz.

## Testler

```
npm test
```

Node gerekir; paket kurulumu gerekmez.
