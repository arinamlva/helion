# HELION — Лунные ресурсы для энергетики будущего

Концепт-сайт вымышленной компании HELION, которая готовит добычу гелия-3 у южного полюса Луны.
Статический сайт: HTML, CSS и JavaScript без сборки и фреймворков.

> Компания и все данные на сайте вымышленные. Форма обратной связи — демонстрационная и ничего не отправляет.

## Запуск локально

```bash
python3 -m http.server 8000
```

Откройте http://localhost:8000.

## Публикация на GitHub Pages

1. Создайте репозиторий и загрузите содержимое этой папки в корень.
2. Settings → Pages → Source: «Deploy from a branch», ветка `main`, папка `/ (root)`.
3. Сайт откроется по адресу `https://<логин>.github.io/<репозиторий>/`.
4. Адреса в `index.html`, `robots.txt` и `sitemap.xml` указывают на https://arinamlva.github.io/helion/ — при переезде на свой домен замените их.

## Структура

- `index.html` — страница целиком
- `assets/site.css`, `assets/site.js` — стили и скрипты
- `assets/hero-scrub.mp4`, `assets/hero-poster.jpg` — видео первого экрана для горизонтальных экранов (прокручивается скроллом)
- `assets/hero-scrub-m.mp4`, `assets/hero-poster-m.jpg` — вертикальная версия для телефонов, с панорамой от Земли к станции
- `assets/rock-*.{jpg,mp4}` — блок «Нагрейте лунный камень»
- `assets/station.jpg`, `news-*.jpg`, `partner-*.png` — изображения

## Технологии

- Шрифты: Unbounded и Inter (Google Fonts)
- 3D-модель комплекса: Three.js r160 с CDN jsDelivr, при недоступности — запасная 2D-отрисовка
- Звук блока с камнем синтезируется через Web Audio API

Крупные файлы: `hero-scrub.mp4` (~11 МБ). Лимит GitHub на файл — 100 МБ, поэтому Git LFS не нужен.
