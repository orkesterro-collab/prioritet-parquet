#!/usr/bin/env python3
"""Build visually faithful WebP assets and swap only product image references.

Original PNGs are retained as backups. Use Pillow's ICC support and avoid any
brightness, contrast, saturation or gamma changes.
"""
from pathlib import Path
from PIL import Image, ImageOps
import re

ROOT = Path(".")
ASSETS = ROOT / "assets"
VERSION = "20261018w1"
ORIGINALS = sorted(p for p in ASSETS.glob("ECO-30-*.png")
                   if re.fullmatch(r"ECO-30-(?:[1-9]|10)(?:-[234])?\.png", p.name))

if len(ORIGINALS) != 40:
    raise RuntimeError(f"Expected 40 original product PNG files; found {len(ORIGINALS)}")

def change_one(content, old, new, where):
    n = content.count(old)
    if n != 1:
        raise RuntimeError(f"{where}: expected one matching section, got {n}")
    return content.replace(old, new, 1)

def save_webp(src, dest, max_edge, quality):
    with Image.open(src) as original:
        # Do not apply any colour/brightness correction to the source imagery.
        icc = original.info.get("icc_profile")
        im = ImageOps.exif_transpose(original)
        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
            rgba = im.convert("RGBA")
            background = Image.new("RGB", rgba.size, (255, 255, 255))
            background.paste(rgba, mask=rgba.getchannel("A"))
            im = background
        else:
            im = im.convert("RGB")
        im.thumbnail((max_edge, max_edge), Image.Resampling.LANCZOS)
        options = dict(format="WEBP", quality=quality, method=6)
        if icc:
            options["icc_profile"] = icc
        im.save(dest, **options)
    return dest.stat().st_size

before_total = sum(p.stat().st_size for p in ORIGINALS)
full_total = card_total = thumb_total = 0
for png in ORIGINALS:
    stem = png.stem
    full_total += save_webp(png, ASSETS / (stem + ".webp"), 1600, 87)
    thumb_total += save_webp(png, ASSETS / (stem + "-thumb.webp"), 260, 78)
    if stem.endswith("-4") or re.fullmatch(r"ECO-30-(?:[1-9]|10)", stem):
        card_total += save_webp(png, ASSETS / (stem + "-card.webp"), 720, 84)
print(f"Gallery originals: {before_total:,} bytes")
print(f"Gallery WebP:      {full_total:,} bytes")
print(f"20 card WebP:      {card_total:,} bytes")
print(f"40 thumb WebP:     {thumb_total:,} bytes")

index_path = ROOT / "index.html"
page = index_path.read_text(encoding="utf-8")
page = change_one(
    page,
    ".wood{background-image:var(--photo)!important;background-position:center!important;background-size:cover!important;filter:none!important}.wood i{display:none!important}",
    ".wood{background-image:none!important;filter:none!important}.wood i{display:none!important}",
    "index obsolete duplicate texture background"
)
# Only desktop devices with a real hover pointer receive an interior image element.
# src is attached on hover, so neither desktop nor mobile fetch preview images
# until the user actually requests them.
start = page.index('<div class="wood" style="--wood:')
end = page.index('</div><div class="decor-meta">', start) + len("</div>")
new_card_markup = """<div class="wood" style="--wood:'+p[4]+'"><img class="wood-photo" src="assets/'+p[0].replace(" ","-")+'-4-card.webp?v=20261018w1" alt="'+p[1]+' — фактура покрытия" loading="lazy" decoding="async">"""
new_card_markup += """'+(supportsDecorHover?'<img class="wood-photo wood-interior" data-src="assets/'+p[0].replace(" ","-")+'-card.webp?v=20261018w1" alt="" aria-hidden="true" decoding="async">':'')+'"""
new_card_markup += """</div>"""
page = page[:start] + new_card_markup + page[end:]
page = change_one(
    page, "function renderProducts(){", 
    'const supportsDecorHover=window.matchMedia("(hover:hover) and (pointer:fine)").matches;\nfunction renderProducts(){',
    "index renderProducts hover capability"
)
old_style_start = page.index("/* Декоры: исходно фактура")
old_style_end = page.index('</style></head><body id="top">', old_style_start)
new_style = """
/* Original wood texture; only fine-pointer desktop receives on-demand interior. */
#collection .decor-card .wood{position:relative;isolation:isolate}
#collection .decor-card .wood-photo{flex:none}
#collection .decor-card .wood-interior{
  position:absolute;inset:0;width:100%;height:100%;
  object-fit:cover;object-position:center;
  transform:translate3d(101%,0,0);
  transition:transform .46s cubic-bezier(.23,.72,.25,1);
  pointer-events:none;z-index:1;
}
@media(hover:hover) and (pointer:fine){
 #collection .decor-card.is-preview-ready:hover .wood-interior,
 #collection .decor-card.is-preview-ready:focus-visible .wood-interior{
   transform:translate3d(0,0,0);
 }
}
#collection .decor-card .sale-badge{z-index:3}
@media(prefers-reduced-motion:reduce){
 #collection .decor-card .wood-interior{transition:none}
}
"""
page = page[:old_style_start] + new_style + page[old_style_end:]

old_js_start = page.index("function applyRealPhotos(){")
old_js_end = page.index("let galleryCode=null;", old_js_start)
new_js = """// Gallery thumbnails and texture cards do not create second PNG background requests.
const decorGridEl=document.getElementById("decorGrid");
if(decorGridEl && supportsDecorHover){
  const requestInterior=e=>{
    const card=e.target.closest(".decor-card");
    if(!card || !decorGridEl.contains(card))return;
    const preview=card.querySelector(".wood-interior");
    if(!preview || preview.hasAttribute("src"))return;
    preview.addEventListener("load",()=>card.classList.add("is-preview-ready"),{once:true});
    preview.src=preview.dataset.src;
  };
  decorGridEl.addEventListener("pointerover",e=>{
    if(e.pointerType==="mouse")requestInterior(e);
  });
  decorGridEl.addEventListener("focusin",requestInterior);
}

"""
page = page[:old_js_start] + new_js + page[old_js_end:]
page, gallery_count = re.subn(r'(assets/ECO-30-(?:[1-9]|10)(?:-[234])?)\.png', r'\1.webp', page)
if gallery_count != 40:
    raise RuntimeError(f"Expected 40 gallery image references in index, found {gallery_count}")
if "is-touch-preview" in page:
    raise RuntimeError("Touch hover animation was not removed")
if "applyRealPhotos" in page or "--photo" in page:
    raise RuntimeError("Old PNG background fetch remains")
if page.count("data-src=") != 1:
    raise RuntimeError("Expected one on-demand interior image markup")
index_path.write_text(page, encoding="utf-8")

js_path = ROOT / "product.js"
js = js_path.read_text(encoding="utf-8")
js = change_one(js, 'const PRODUCT_IMAGE_VERSION="?v=20261012-color2";',
                'const PRODUCT_IMAGE_VERSION="?v=' + VERSION + '";', "product cache key")
if js.count(".png${PRODUCT_IMAGE_VERSION}") != 5:
    raise RuntimeError(f"Unexpected product JS original references {js.count('.png${PRODUCT_IMAGE_VERSION}')}")
js = js.replace(".png${PRODUCT_IMAGE_VERSION}", ".webp${PRODUCT_IMAGE_VERSION}")
js = change_one(js, 'src="${src}" alt="${product.name} — фото ${i+1}"',
                'src="${src.replace(".webp","-thumb.webp")}" loading="lazy" decoding="async" alt="${product.name} — фото ${i+1}"',
                "product gallery thumbnail")
js = change_one(js, 'assets/${slug}.webp${PRODUCT_IMAGE_VERSION}',
                'assets/${slug}-card.webp${PRODUCT_IMAGE_VERSION}', "related decor thumbnail")
js_path.write_text(js, encoding="utf-8")

for product in range(1, 11):
    path = ROOT / f"eco-30-{product}.html"
    html = path.read_text(encoding="utf-8")
    before = f'src="assets/ECO-30-{product}.png?v=20261012-color2"'
    after = f'src="assets/ECO-30-{product}.webp?v={VERSION}"'
    html = change_one(html, before, after, str(path))
    html = change_one(html, '<img id="mainPhoto" ', 
                      '<img id="mainPhoto" fetchpriority="high" decoding="async" ', str(path))
    path.write_text(html, encoding="utf-8")

# Final checks for generated assets referenced from all ten galleries.
for product in range(1, 11):
    for suffix in ("", "-2", "-3", "-4"):
        base = f"ECO-30-{product}{suffix}"
        for name in (base + ".webp", base + "-thumb.webp"):
            if not (ASSETS / name).is_file():
                raise RuntimeError(f"Missing image {name}")
    for suffix in ("", "-4"):
        if not (ASSETS / f"ECO-30-{product}{suffix}-card.webp").is_file():
            raise RuntimeError(f"Missing card image for {product}")
print("PASS: 40 gallery WebP, 40 thumbnails and 20 cards; all ten product HTML pages updated")
