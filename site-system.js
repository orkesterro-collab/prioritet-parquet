/* Единая мобильная навигация для всех страниц */
(function(){
  const button=document.querySelector(".pp-toggle");
  const menu=document.querySelector(".pp-menu");
  const backdrop=document.querySelector(".pp-backdrop");
  if(!button||!menu||!backdrop)return;
  function setOpen(open){
    menu.hidden=!open;
    backdrop.hidden=!open;
    button.setAttribute("aria-expanded",String(open));
    button.setAttribute("aria-label",open?"Закрыть меню":"Открыть меню");
    document.body.classList.toggle("pp-menu-open",open);
  }
  button.addEventListener("click",()=>setOpen(menu.hidden));
  backdrop.addEventListener("click",()=>{setOpen(false);button.focus()});
  menu.querySelectorAll("a").forEach(a=>a.addEventListener("click",()=>setOpen(false)));
  document.addEventListener("keydown",e=>{
    if(e.key==="Escape"&&!menu.hidden){setOpen(false);button.focus()}
  });
  window.addEventListener("resize",()=>{if(window.innerWidth>1040&&!menu.hidden)setOpen(false)});
})();
