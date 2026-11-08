'use strict';
(function(){
  const config=window.PARTNERS_CONFIG||{};
  const cityNav=document.getElementById('partner-cities');
  const list=document.getElementById('salons');
  const live=document.getElementById('locator-status');
  const mapError=document.getElementById('map-error');
  let partners=[],city='',map=null,markers=new Map(),selected='';
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
    if(map&&marker){if(pan)map.setView([p.lat,p.lng],Math.max(map.getZoom(),14),{animate:false});marker.openPopup();}
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
  function renderMarkers(items){
    if(!map)return;
    markers.forEach(m=>m.remove());markers.clear();
    items.filter(p=>p.hasPoint).forEach(p=>{
      const icon=L.divIcon({className:'partner-pin',html:'<span class="pin-dot" aria-hidden="true"></span>',iconSize:[34,42],iconAnchor:[17,42],popupAnchor:[0,-35]});
      const m=L.marker([p.lat,p.lng],{icon,title:p.name+', '+p.address,alt:p.name+', '+p.address,keyboard:true}).addTo(map);
      const popup=el('div','map-popup');popup.append(el('strong','',p.name),el('p','',p.address),external('Построить маршрут ↗',routeUrl(p)));
      m.bindPopup(popup,{maxWidth:270,autoPan:true});m.on('click',()=>choose(p,false));markers.set(p.id,m);
    });
    const points=items.filter(p=>p.hasPoint).map(p=>[p.lat,p.lng]);
    if(points.length===1)map.setView(points[0],14,{animate:false});
    else if(points.length)map.fitBounds(points,{padding:[48,48],maxZoom:13,animate:false});
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
  function initMap(){
    if(!window.L){mapError.hidden=false;return;}
    map=L.map('partner-map',{scrollWheelZoom:false,zoomControl:false}).setView([53.9,27.56],11);
    L.control.zoom({position:'topright'}).addTo(map);
    const tiles=L.tileLayer(config.tileUrl||'https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'}).addTo(map);
    let failures=0;tiles.on('tileerror',()=>{if(++failures>=3)mapError.hidden=false;});tiles.on('tileload',()=>{mapError.hidden=true;failures=0;});
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
