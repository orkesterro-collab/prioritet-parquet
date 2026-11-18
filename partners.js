'use strict';
(function(){
  const config=window.PARTNERS_CONFIG||{};
  const cityNav=document.getElementById('partner-cities');
  const list=document.getElementById('salons');
  const live=document.getElementById('locator-status');
  const mapError=document.getElementById('map-error');
  let partners=[],city='',map=null,markers=new Map(),selected='';
  let popup;
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
    return {id:clean(row.id)||place+'|'+name+'|'+address,name,address,city:place,phone:clean(pick('phone','Телефон')),hours:clean(pick('hours','Часы работы')),website:webUrl(pick('website','Сайт')),lat,lng,hasPoint:Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180,map_url:webUrl(pick('map_url','Ссылка на карту')),description:clean(pick('description','Информация для посетителя')),sort_order:number(pick('sort_order','Порядок'))||index};
  }
  function routeUrl(p){return p.map_url||'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(p.city+', '+p.address+', Беларусь');}
  function el(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e;}
  function external(label,href,className){const a=el('a',className,label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function markSelected(id){
    selected=id;
    markers.forEach((m,key)=>{const node=m.getElement();if(node)node.classList.toggle('is-selected',key===id);});
  }
  function choose(p,pan=true){
    const detail=byId.get(p.id);if(detail&&!detail.open)detail.open=true;
    byId.forEach((other,key)=>{if(key!==p.id)other.open=false;});
    markSelected(p.id);
    const marker=markers.get(p.id);
    if (marker) {
      const position = marker.getPosition();
      const view = map.getView();
      if (pan) {
        view.setCenter(position);
        view.setZoom(Math.max(view.getZoom(), 14));
      }
      const close = el('button', 'popup-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', 'Закрыть');
      function closePopup() {
        popup.setPosition(undefined);
        marker.getElement().focus({preventScroll:true});
      }
      close.addEventListener('click', closePopup);
      const content = popup.getElement();
      content.replaceChildren(close, el('strong', '', p.name), el('p', '', p.address),
        external('Построить маршрут ↗', routeUrl(p)));
      content.onkeydown = event => { if (event.key === 'Escape') closePopup(); };
      popup.setPosition(position);
    }
    live.textContent=p.name+', '+p.address;
  }
  function renderList(items){
    list.replaceChildren();byId.clear();
    if(!items.length){list.append(el('p','empty-list','Адреса салонов скоро появятся.'));return;}
    items.forEach(p=>{
      const d=el('details','salon');d.dataset.partnerId=p.id;
      const summary=el('summary');summary.append(el('span','salon-name',p.name),el('span','salon-address',p.address));d.append(summary);
      const body=el('div','salon-body');
      if(p.phone){const phone=el('a','salon-phone',p.phone);phone.href='tel:'+p.phone.replace(/[^\d+]/g,'');body.append(phone);}
      if(p.hours)body.append(el('p','salon-hours',p.hours));
      if(p.description)body.append(el('p','salon-description',p.description));
      if(p.website)body.append(external('Сайт салона',p.website,'salon-site'));
      const links=el('div','salon-links');links.append(external('Маршрут ↗',routeUrl(p),'route-link'));
      if(p.hasPoint){const show=el('button','','На карте');show.type='button';show.addEventListener('click',()=>{choose(p);document.querySelector('.map-panel').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});});links.append(show);}
      body.append(links);d.append(body);d.addEventListener('toggle',()=>{if(d.open&&selected!==p.id)choose(p);});
      byId.set(p.id,d);list.append(d);
    });
  }
  function renderMarkers(items) {
    if (!map) return;
    popup.setPosition(undefined);
    markers.forEach(marker => map.removeOverlay(marker));
    markers.clear();
    const extent = ol.extent.createEmpty();
    for (const partner of items.filter(p => p.hasPoint)) {
      const position = ol.proj.fromLonLat([partner.lng, partner.lat]);
      const button = el('button', 'partner-pin');
      button.type = 'button';
      button.title = `${partner.name}, ${partner.address}`;
      button.setAttribute('aria-label', button.title);
      const pin = el('span', 'pin-dot');
      pin.setAttribute('aria-hidden', 'true');
      button.append(pin);
      button.addEventListener('click', () => choose(partner, false));
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
    city=value;selected='';cityNav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.city===city)));
    const items=partners.filter(p=>p.city===city);renderList(items);renderMarkers(items);live.textContent='Салоны: '+city;
  }
  function setData(rows){
    partners=rows.map(normalize).filter(Boolean).sort((a,b)=>a.sort_order-b.sort_order);
    const cities=[...new Set(partners.map(p=>p.city))];cityNav.replaceChildren();
    cities.forEach(place=>{const b=el('button','',place);b.type='button';b.dataset.city=place;b.setAttribute('aria-pressed','false');b.addEventListener('click',()=>setCity(place));cityNav.append(b);});
    setCity(cities.includes(city)?city:(cities.includes('Минск')?'Минск':cities[0]||''));
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
    const content = el('div', 'map-popup');
    popup = new ol.Overlay({element:content, positioning:'bottom-center', offset:[0, -42],
      autoPan:{margin:12}, insertFirst:false});
    map.addOverlay(popup);
    map.on('singleclick', () => popup.setPosition(undefined));
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
