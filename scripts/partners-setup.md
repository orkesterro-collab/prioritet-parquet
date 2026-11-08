# Partners data

The Partners tab in Site_PrioritetPerket holds public salon data. The existing live Apps Script currently returns prices, faq and updated only.

The new page immediately uses its published six-salon snapshot. It also accepts a partners array from the existing endpoint when that field is added. An explicit empty array removes every salon. A missing field or failed fetch retains the published snapshot.

## Connect the sheet

1. Open the Apps Script project serving the existing pricing/FAQ endpoint.
2. Add partners-sheet.gs without replacing the existing doGet function.
3. Add partners: readPrioritetPartners_() to the existing JSON response object.
4. Deploy a new version of the existing Web App. Preserve its current endpoint URL and access settings.
5. Verify partners appears and changing a row updates where-to-buy.html after reload. Confirm prices and faq still work.

The Google Sheets connector cannot edit or redeploy Apps Script. Browser Google sign-in was unavailable, so this activation step remains pending.

## Columns

One row is one salon. Публиковать controls visibility; Город, Салон and Адрес are required. Широта and Долгота position the map pin. A record without coordinates still appears in the list. Телефон, Часы работы, Сайт, Ссылка на карту and Информация для посетителя are optional public fields. Порядок sorts ascending.

Do not place internal or personal notes in the public-data tab. Only these named fields are exported; other workbook tabs are untouched.

## Map

Leaflet 1.9.4 loads from its pinned official CDN with integrity hashes. OpenStreetMap attribution remains visible and tiles use ordinary browser caching. There is no tile prefetch or runtime geocoding. The six initial points were resolved once from the existing public addresses and cached. Change PARTNERS_CONFIG.tileUrl to switch tile providers.
