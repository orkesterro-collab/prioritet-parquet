
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
const codeSlug=product.code.replace(" ","-");
const images=[`assets/${codeSlug}.png`,`assets/${codeSlug}-2.png`,`assets/${codeSlug}-3.png`,`assets/${codeSlug}-4.png`];
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
  document.getElementById("thumbs").innerHTML=images.map((src,i)=>`<button class="thumb ${i===0?"active":""}" onclick="showImage(${i})"><img src="${src}" alt="${product.name} — фото ${i+1}"></button>`).join("");
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
  const specs=[
    ["Артикул",product.code],["Тип товара","VSPC / натуральный шпон на SPC-основе"],
    ["Порода дерева",product.species],["Поверхность",product.surface],
    ["Длина","600 мм"],["Ширина","125 мм"],["Толщина","5,5 мм"],
    ["Толщина натурального шпона","0,6 мм"],["Защитное покрытие","7 слоёв УФ-лака"],
    ["Фаска","4V"],["Соединение","Замковое"],["Беспороговая укладка","до 200 м²"],
    ["Температурное расширение","< 0,04%"],["Тёплый пол","Да"],
    ["Способы укладки","Плавающая или клеевая"]
  ];
  document.getElementById("specTable").innerHTML=specs.map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`).join("");
  const idx=ALL_PRODUCTS.findIndex(p=>p.code===product.code);
  const related=[1,2,3,4].map(n=>ALL_PRODUCTS[(idx+n)%ALL_PRODUCTS.length]);
  document.getElementById("relatedGrid").innerHTML=related.map(p=>{
    const slug=p.code.replace(" ","-");
    return `<a class="related-card" href="${p.url}"><img src="assets/${slug}.png" alt="${p.name}" loading="lazy"><div class="related-meta"><small><span>${p.species}</span><span>${p.code}</span></small><h3>${p.name.replace(p.species+" ","")}</h3></div></a>`;
  }).join("");
}
function renderPrice(p){
  const box=document.getElementById("priceBox");
  if(p&&p.active&&p.sale){
    box.innerHTML=`<div class="price-row"><span class="old-price">${money(p.regular)}</span><span class="sale-price">${money(p.sale)} <small>/ м²</small></span></div>`;
  } else {
    box.innerHTML=`<div class="price-row"><span class="price">${money((p&&p.regular)||product.price)} <small>/ м²</small></span></div>`;
  }
}
async function loadPrice(){
  renderPrice({regular:product.price});
  try{
    const r=await fetch(DATA_ENDPOINT,{cache:"no-store"});
    if(!r.ok) return;
    const data=await r.json();
    if(data.prices&&data.prices[product.code]) renderPrice(data.prices[product.code]);
  }catch(e){console.warn("Price fallback",e)}
}
window.showImage=showImage;
document.addEventListener("keydown",e=>{if(e.key==="ArrowLeft")showImage(current-1);if(e.key==="ArrowRight")showImage(current+1)});
renderGallery();renderBase();loadPrice();
