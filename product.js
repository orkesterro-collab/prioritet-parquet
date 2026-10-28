
const DATA_ENDPOINT="https://script.google.com/macros/s/AKfycbz5vLVF3OefJ1r_JUwijdQVuj3eOnF_D9eANn367wLMAfQawrltGwMjbcwxxTRhwRRt/exec";
const ALL_PRODUCTS=[
{code:"ECO 30-1",name:"Дуб Безупречный",species:"Дуб",surface:"Гладкая",url:"eco-30-1.html"},
{code:"ECO 30-2",name:"Дуб Редкий",species:"Дуб",surface:"Гладкая",url:"eco-30-2.html"},
{code:"ECO 30-3",name:"Дуб Статусный",species:"Дуб",surface:"Брашированная",url:"eco-30-3.html"},
{code:"ECO 30-4",name:"Дуб Престижный",species:"Дуб",surface:"Брашированная",url:"eco-30-4.html"},
{code:"ECO 30-5",name:"Дуб Элегантный",species:"Дуб",surface:"Брашированная",url:"eco-30-5.html"},
{code:"ECO 30-6",name:"Дуб Винтажный",species:"Дуб",surface:"Брашированная",url:"eco-30-6.html"},
{code:"ECO 30-7",name:"Дуб Благородный",species:"Дуб",surface:"Брашированная",url:"eco-30-7.html"},
{code:"ECO 30-8",name:"Дуб Монолитный",species:"Дуб",surface:"Брашированная",url:"eco-30-8.html"},
{code:"ECO 30-9",name:"Орех Натуральный",species:"Орех",surface:"Гладкая",url:"eco-30-9.html"},
{code:"ECO 30-10",name:"Дуб Изящный",species:"Дуб",surface:"Брашированная",url:"eco-30-10.html"}
];
const product=window.PRODUCT;
const PRODUCT_IMAGE_VERSION="?v=20261018w1";
const codeSlug=product.code.replace(" ","-");
const images=[`assets/${codeSlug}.webp${PRODUCT_IMAGE_VERSION}`,`assets/${codeSlug}-2.webp${PRODUCT_IMAGE_VERSION}`,`assets/${codeSlug}-3.webp${PRODUCT_IMAGE_VERSION}`,`assets/${codeSlug}-4.webp${PRODUCT_IMAGE_VERSION}`];
let current=0;
function money(n){return Number(n).toLocaleString("ru-RU")+" BYN"}
function showImage(i){
  current=(i+images.length)%images.length;
  const img=document.getElementById("mainPhoto");
  img.src=images[current];img.alt=product.name+" — фото "+(current+1);
  document.querySelectorAll(".thumb").forEach((b,j)=>b.classList.toggle("active",j===current));
}
function renderGallery(){
  document.getElementById("mainPhoto").src=images[0];
  document.getElementById("thumbs").innerHTML=images.map((src,i)=>`<button class="thumb ${i===0?"active":""}" onclick="showImage(${i})"><img src="${src.replace(".webp","-thumb.webp")}" loading="lazy" decoding="async" alt="${product.name} — фото ${i+1}"></button>`).join("");
}
function renderBase(){
  document.title=product.name+" "+product.code+" — Приоритет Паркет";
  document.querySelectorAll("[data-name]").forEach(el=>el.textContent=product.name);
  document.querySelectorAll("[data-code]").forEach(el=>el.textContent=product.code);
  document.querySelectorAll("[data-species]").forEach(el=>el.textContent=product.species);
  document.querySelectorAll("[data-surface]").forEach(el=>el.textContent=product.surface);
  document.getElementById("descriptionText").textContent=product.description;
  const facts=[
    ["Порода",product.species],["Поверхность",product.surface],
    ["Формат","600 × 125 × 5,5 мм"],["Шпон","0,6 мм"]
  ];
  document.getElementById("keyfacts").innerHTML=facts.map(x=>`<div class="keyfact"><b>${x[1]}</b><span>${x[0]}</span></div>`).join("");
  const idx=ALL_PRODUCTS.findIndex(p=>p.code===product.code);
  const related=[1,2,3,4].map(n=>ALL_PRODUCTS[(idx+n)%ALL_PRODUCTS.length]);
  document.getElementById("relatedGrid").innerHTML=related.map(p=>{
    const slug=p.code.replace(" ","-");
    return `<a class="related-card" href="${p.url}"><img src="assets/${slug}-card.webp${PRODUCT_IMAGE_VERSION}" alt="${p.name}" loading="lazy"><div class="related-meta"><small><span>${p.species}</span><span>${p.code}</span></small><h3>${p.name.replace(p.species+" ","")}</h3></div></a>`;
  }).join("");
}
// Only current service data may create a Google Product/Offer. Fallback prices
// remain informational and never imply verified availability or an Offer.
function positivePrice(value){
  if(typeof value!=="number"&&typeof value!=="string") return null;
  if(typeof value==="string"&&!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const n=Number(String(value).replace(",","."));
  return Number.isFinite(n)&&n>0?n:null;
}
function selectedPrice(p){
  if(!p||typeof p!=="object") return null;
  const regular=positivePrice(p.regular);
  const sale=p.active===true?positivePrice(p.sale):null;
  return regular?{regular,price:sale||regular,sale}:null;
}
function renderStructuredData(p,confirmed){
  document.getElementById("productStructuredData")?.remove();
  const selected=selectedPrice(p);
  if(!confirmed||!selected) return;
  const url="https://prioritetparket.by/"+product.slug+".html";
  const offer={"@type":"Offer",url,priceCurrency:"BYN",price:selected.price,
    priceSpecification:{"@type":"UnitPriceSpecification",price:selected.price,
      priceCurrency:"BYN",referenceQuantity:{"@type":"QuantitativeValue",value:1,unitCode:"MTK",unitText:"м²"}}};
  const availability={"В наличии":"InStock","Нет в наличии":"OutOfStock","Под заказ":"BackOrder","Предзаказ":"PreOrder"};
  const status=typeof p.availability==="string"?p.availability.trim():"";
  if(Object.hasOwn(availability,status)) offer.availability="https://schema.org/"+availability[status];
  const schema={"@context":"https://schema.org","@type":"Product","@id":url+"#product",
    url,name:product.name+" "+product.code,sku:product.code,
    image:images.map(src=>new URL(src,"https://prioritetparket.by/").href),
    description:product.description,brand:{"@type":"Brand",name:"Alpine Floor"},
    category:"SPC-паркет с натуральным древесным шпоном",offers:offer,
    mainEntityOfPage:{"@id":url+"#webpage"}};
  const script=document.createElement("script");
  script.id="productStructuredData";script.type="application/ld+json";
  script.textContent=JSON.stringify(schema);document.head.appendChild(script);
}
function renderPrice(p,confirmed=false){
  const selected=selectedPrice(p);
  const box=document.getElementById("priceBox");
  const shown=selected||{price:product.price};
  box.innerHTML=shown.sale
    ?`<div class="price-row"><span class="old-price">${money(shown.regular)}</span><span class="sale-price">${money(shown.price)} <small>/ м²</small></span></div>`
    :`<div class="price-row"><span class="price">${money(shown.price)} <small>/ м²</small></span></div>`;
  const status=document.getElementById("availabilityText");
  if(status) status.textContent=confirmed&&selected&&typeof p.availability==="string"
    ?p.availability.trim():"Наличие уточняйте у продавца";
  renderStructuredData(p,confirmed);
}
async function loadPrice(){
  renderPrice({regular:product.price});
  try{
    const r=await fetch(DATA_ENDPOINT,{cache:"no-store"});
    if(!r.ok) return;
    const data=await r.json();
    renderPrice(data?.prices?.[product.code],true);
  }catch(e){console.warn("Price fallback",e)}
}
window.showImage=showImage;
document.addEventListener("keydown",e=>{if(e.key==="ArrowLeft")showImage(current-1);if(e.key==="ArrowRight")showImage(current+1)});
renderGallery();renderBase();loadPrice();


(function(){
const btn=document.querySelector(".site-menu-button"),panel=document.querySelector(".site-mobile-menu"),scrim=document.querySelector(".site-menu-scrim");
if(!btn||!panel||!scrim)return;
function toggle(open){panel.hidden=!open;scrim.hidden=!open;btn.setAttribute("aria-expanded",String(open));btn.setAttribute("aria-label",open?"Закрыть меню":"Открыть меню");document.body.classList.toggle("site-menu-open",open)}
btn.addEventListener("click",()=>toggle(panel.hidden));
scrim.addEventListener("click",()=>toggle(false));
panel.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>toggle(false)));
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!panel.hidden){toggle(false);btn.focus()}});
window.addEventListener("resize",()=>{if(innerWidth>900&&!panel.hidden)toggle(false)});
})();
