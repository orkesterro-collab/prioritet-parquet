// Run: node scripts/test-product-schema.cjs (no dependencies or live requests).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'product.js'),'utf8');
async function run(i,response,fail=false){
  const html=fs.readFileSync(path.join(root,`eco-30-${i}.html`),'utf8');
  const product=JSON.parse(html.match(/window.PRODUCT=(\{.*?\});/)[1]);
  const nodes=new Map();
  const element=()=>({textContent:'',innerHTML:'',classList:{toggle(){}},remove(){nodes.delete(this.id)}});
  const document={title:'',head:{appendChild(n){nodes.set(n.id,n)}},createElement:element,
    getElementById(id){return nodes.get(id)||null},querySelector(){return null},querySelectorAll(){return []},addEventListener(){}};
  for(const id of ['mainPhoto','thumbs','descriptionText','keyfacts','relatedGrid','priceBox','availabilityText'])nodes.set(id,element());
  const ctx=vm.createContext({window:{PRODUCT:product},document,URL,console:{warn(){}},fetch:async()=>{if(fail)throw Error('offline');return {ok:true,json:async()=>response}}});
  vm.runInContext(source,ctx);
  await new Promise(setImmediate);
  const schema=nodes.get('productStructuredData');
  return {ctx,nodes,product,schema:schema&&JSON.parse(schema.textContent)};
}
(async()=>{
  for(let i=1;i<=10;i++){
    const price=i===8?186:189;
    const r=await run(i,{prices:{[`ECO 30-${i}`]:{regular:price,sale:null,active:false,availability:'В наличии'}}});
    assert.equal(r.product.price,price);assert.equal(r.schema.sku,`ECO 30-${i}`);
    assert.equal(r.schema.offers.price,price);assert.equal(r.schema.offers.priceCurrency,'BYN');
    assert.equal(r.schema.offers.availability,'https://schema.org/InStock');
    assert.equal(r.schema.offers.priceSpecification.referenceQuantity.unitCode,'MTK');
    assert.ok(r.nodes.get('priceBox').innerHTML.includes(`${price} BYN`));
    assert.equal(r.nodes.get('availabilityText').textContent,'В наличии');
    for(const src of r.schema.image)assert.ok(fs.existsSync(path.join(root,new URL(src).pathname)));
    const webpage=JSON.parse(fs.readFileSync(path.join(root,`eco-30-${i}.html`),'utf8').match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
    assert.equal(r.schema.mainEntityOfPage['@id'],webpage['@id']);
    // Repeated updates replace the same node; invalid data removes an old Offer.
    vm.runInContext('renderPrice({regular:199,sale:179,active:true,availability:"Нет в наличии"},true)',r.ctx);
    assert.equal(JSON.parse(r.nodes.get('productStructuredData').textContent).offers.price,179);
    assert.equal(JSON.parse(r.nodes.get('productStructuredData').textContent).offers.availability,'https://schema.org/OutOfStock');
    vm.runInContext('renderPrice({regular:0},true)',r.ctx);assert.ok(!r.nodes.has('productStructuredData'));
  }
  for(const regular of [undefined,null,'',0,-1,'NaN','<b>189</b>',true,Infinity]){
    const r=await run(1,{prices:{'ECO 30-1':{regular}}});assert.ok(!r.schema);
  }
  assert.ok(!(await run(1,{},true)).schema);
  assert.ok(!(await run(1,{prices:{}})).schema);
  const unknown=await run(1,{prices:{'ECO 30-1':{regular:189,availability:'Уточнить'}}});
  assert.ok(!Object.hasOwn(unknown.schema.offers,'availability'));
  assert.equal(unknown.nodes.get('availabilityText').textContent,'Уточнить');
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const collection=JSON.parse(index.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(collection.mainEntity.itemListElement.length,10);assert.ok(!JSON.stringify(collection).includes('"Product"'));
  console.log('PASS: all 10 products, prices, units, availability, sale, replacement, invalid/missing data and offline fallback; homepage ItemList.');
})().catch(e=>{console.error(e);process.exitCode=1});
