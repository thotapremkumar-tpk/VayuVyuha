"""pptxgenjs repeats <a:pPr> before later runs of a bulleted paragraph; a paragraph may carry only one, first."""
import zipfile, re, sys, shutil, os
src = sys.argv[1]; tmp = src + ".tmp"
pat = re.compile(r"(</a:r>)<a:pPr(?:[^>]*/>|[^>]*>.*?</a:pPr>)", re.S)
n = 0
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if re.match(r"ppt/slides/slide\d+\.xml$", item.filename):
            txt, k = pat.subn(r"\1", data.decode("utf8")); n += k; data = txt.encode("utf8")
        zout.writestr(item, data)
os.replace(tmp, src); print("stray paragraph props removed:", n)
