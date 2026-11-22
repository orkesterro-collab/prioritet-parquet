'use strict';
(function(){
  const config=window.PARTNERS_CONFIG||{};
  const cityNav=document.getElementById('partner-cities');
  const list=document.getElementById('salons');
  const live=document.getElementById('locator-status');
  const mapError=document.getElementById('map-error');
  const mapCaption=document.getElementById('map-caption');
  const mapContacts=document.getElementById('map-contacts');
  const mapHint=mapCaption.textContent;
  const markers=new Map();
  let partners=[],city='',map=null,selected=null;
  const byId=new Map();
  const clean=v=>String(v??'').trim();
  const number=v=>clean(v)===''?NaN:Number(clean(v).replace(',','.'));
  function webUrl(v){try{const u=new URL(clean(v));return /^https?:$/.test(u.protocol)?u.href:'';}catch(e){return '';}}
  function normalize(row,index){
    const pick=(...keys)=>keys.map(k=>row[k]).find(v=>v!==undefined&&v!==null);
    const active=pick('active','Публиковать');
    if(active===false||active===0||/^(false|нет|0)$/i.test(clean(active)))return null;
    const name=clean(pick('name','Салон')),address=clean(pick('address','Адрес')),place=clean(pick('city','Город'));
    if(!name||!address||!place)return null;
    const lat=number(pick('lat','latitude','Широта')),lng=number(pick('lng','lon','longitude','Долгота'));
    const phones = clean(pick('phone','Телефон')).split(/[\n;,]+/).map(clean).filter(Boolean);
    return {id:clean(row.id)||place+'|'+name+'|'+address,name,address,city:place,phones,hours:clean(pick('hours','Часы работы')),website:webUrl(pick('website','Сайт')),lat,lng,hasPoint:Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180,map_url:webUrl(pick('map_url','Ссылка на карту')),description:clean(pick('description','Информация для посетителя')),sort_order:number(pick('sort_order','Порядок'))||index};
  }
  function routeUrl(p){return p.map_url||'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(p.city+', '+p.address+', Беларусь');}
  function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
  function external(label,href,className){const a=el('a',className,label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function trackSalonLink(link, goal, partner) {
    link.addEventListener('click', () => {
      if (typeof window.ym !== 'function') return;
      window.ym(114347832, 'reachGoal', goal, {
        salon: partner.name,
        city: partner.city,
        address: partner.address,
        source: link.closest('details').dataset.source || 'list'
      });
    });
    return link;
  }
  function routeLink(partner) {
    const link = external('Маршрут ↗', routeUrl(partner), 'route-link');
    return trackSalonLink(link, 'salon_route', partner);
  }
  function phoneLink(partner, number) {
    const link = el('a', 'salon-phone', number);
    link.href = 'tel:' + number.replace(/[^\d+]/g, '');
    return trackSalonLink(link, 'salon_phone', partner);
  }
  function selectPartner(partner) {
    selected = partner;
    byId.forEach(({card, address, details}, id) => {
      const active = id === partner.id;
      card.classList.toggle('is-selected', active);
      if (address.tagName === 'BUTTON') address.setAttribute('aria-pressed', String(active));
      details.open = false;
    });
    markers.forEach((overlay, id) => {
      const pin = overlay.getElement();
      pin.classList.toggle('is-selected', id === partner.id);
      pin.setAttribute('aria-pressed', String(id === partner.id));
    });
    const marker = markers.get(partner.id);
    if (marker) {
      map.updateSize();
      const view = map.getView();
      view.cancelAnimations();
      view.setZoom(Math.max(view.getZoom(), 15));
      view.setCenter(marker.getPosition());
    }
    const label = partner.name + ', ' + partner.address;
    mapCaption.textContent = marker ? label : mapHint;
    mapContacts.hidden = !marker;
    live.textContent = label;
  }
  function showOnMap(partner) {
    selectPartner(partner);
    if (window.matchMedia('(max-width: 700px)').matches) {
      map.getTargetElement().scrollIntoView({block:'center'});
    }
  }
  mapContacts.addEventListener('click', () => {
    const row = byId.get(selected?.id);
    if (!row) return;
    row.details.dataset.source = 'map';
    row.details.open = true;
    row.details.querySelector('summary').focus({preventScroll:true});
    row.card.scrollIntoView({block:'nearest'});
  });
  function renderList(items){
    list.replaceChildren();byId.clear();
    if(!items.length){list.append(el('p','empty-list','Адреса салонов скоро появятся.'));return;}
    items.forEach(p=>{
      const card = el('article', 'salon');
      card.dataset.partnerId = p.id;
      const canShow = Boolean(map && p.hasPoint);
      const address = el(canShow ? 'button' : 'div', 'salon-select');
      const label = p.name + ', ' + p.address;
      address.append(el('span','salon-name',p.name), el('span','salon-address',p.address));
      if (canShow) {
        address.type = 'button';
        address.setAttribute('aria-label', label + ' — показать на карте');
        address.setAttribute('aria-pressed', 'false');
        address.addEventListener('click', () => showOnMap(p));
      }
      const details = el('details');
      const summary = el('summary');
      summary.setAttribute('aria-label', 'Контакты — ' + label);
      summary.addEventListener('click', () => {
        if (!details.open) {
          selectPartner(p);
          details.dataset.source = 'list';
        }
      });
      const body=el('div','salon-body');
      for (const number of p.phones) body.append(phoneLink(p, number));
      if(p.hours)body.append(el('p','salon-hours',p.hours));
      if(p.description)body.append(el('p','salon-description',p.description));
      if(p.website)body.append(external('Сайт салона',p.website,'salon-site'));
      const links=el('div','salon-links');links.append(routeLink(p));
      if (canShow) {
        const show = el('button', '', 'На карте');
        show.type = 'button';
        show.addEventListener('click', () => { address.focus({preventScroll:true}); showOnMap(p); });
        links.append(show);
      }
      body.append(links);
      details.append(summary, body);
      card.append(address, details);
      byId.set(p.id, {card, address, details});
      list.append(card);
    });
  }
  function renderMarkers(items) {
    if (!map) return;
    markers.forEach(marker => map.removeOverlay(marker));
    markers.clear();
    const extent = ol.extent.createEmpty();
    for (const partner of items.filter(p => p.hasPoint)) {
      const position = ol.proj.fromLonLat([partner.lng, partner.lat]);
      const button = el('button', 'partner-pin');
      button.type = 'button';
      button.title = `${partner.name}, ${partner.address}`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', 'false');
      const pin = el('span', 'pin-dot');
      pin.setAttribute('aria-hidden', 'true');
      button.append(pin);
      button.addEventListener('click', () => selectPartner(partner));
      const marker = new ol.Overlay({element:button, position, positioning:'bottom-center'});
      map.addOverlay(marker);
      markers.set(partner.id, marker);
      ol.extent.extendCoordinate(extent, position);
    }
    if (markers.size) map.getView().fit(extent, {
      padding:[48, 48, 48, 48], maxZoom:markers.size === 1 ? 14 : 13
    });
  }
  function setCity(value){
    city=value;selected=null;mapCaption.textContent=mapHint;mapContacts.hidden=true;
    cityNav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.city===city)));
    const items=partners.filter(p=>p.city===city);renderList(items);renderMarkers(items);live.textContent='Салоны: '+city;
  }
  function setData(rows){
    const previous = selected;
    const previousDetails = byId.get(previous?.id)?.details;
    partners=rows.map(normalize).filter(Boolean).sort((a,b)=>a.sort_order-b.sort_order);
    const cities=[...new Set(partners.map(p=>p.city))];cityNav.replaceChildren();
    cities.forEach(place=>{const b=el('button','',place);b.type='button';b.dataset.city=place;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>setCity(place));cityNav.append(b);});
    setCity(cities.includes(city)?city:(cities.includes('Минск')?'Минск':cities[0]||''));
    // The sheet and the initial snapshot can use different IDs for the same address.
    if (previous && previous.city === city) {
      const match = partners.find(p => p.city === city && (p.id === previous.id ||
        (p.name === previous.name && p.address === previous.address)));
      if (match) {
        selectPartner(match);
        if (previousDetails?.open) {
          const details = byId.get(match.id).details;
          details.dataset.source = previousDetails.dataset.source || 'list';
          details.open = true;
        }
      }
    }
  }
  function initMap() {
    if (!window.ol || !window.olms) {
      mapError.hidden = false;
      return;
    }
    const basemap = new ol.layer.Group();
    map = new ol.Map({
      target: 'partner-map',
      controls: [new ol.control.Zoom({zoomInTipLabel:'Приблизить', zoomOutTipLabel:'Отдалить'})],
      view: new ol.View({center:ol.proj.fromLonLat([27.56, 53.9]), zoom:11,
        minZoom:2, maxZoom:19, enableRotation:false})
    });
    for (const interaction of map.getInteractions().getArray().slice()) {
      if (interaction instanceof ol.interaction.MouseWheelZoom) map.removeInteraction(interaction);
    }
    const styleUrl = new URL('map-style.json?v=20261118-ink', document.baseURI).href;
    olms.apply(basemap, styleUrl).then(() => {
      const sources = new Set(basemap.getLayers().getArray().map(layer => layer.getSource()));
      for (const source of sources) {
        if (!source) continue;
        source.on('tileloaderror', () => { mapError.hidden = false; });
        source.on('tileloadend', () => { mapError.hidden = true; });
      }
      map.addLayer(basemap);
    }).catch(() => { mapError.hidden = false; });
  }
  async function load(){
    initMap();
    const seed=document.getElementById('partners-seed');if(seed)setData(JSON.parse(seed.textContent));
    if(!config.dataEndpoint)return;
    try{
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
      let response;try{response=await fetch(config.dataEndpoint,{signal:controller.signal});}finally{clearTimeout(timer);}
      if(!response.ok)throw Error('HTTP '+response.status);
      const data=await response.json();
      // An explicit empty array hides every salon; absent partners retains the published fallback.
      if(Array.isArray(data.partners))setData(data.partners);
    }catch(error){console.info('Partner feed unavailable; published salon data retained.');}
  }
  load();
})();
