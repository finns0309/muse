#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request
from datetime import datetime
from pathlib import Path
from openpyxl import Workbook

MUSE_DIR = Path.home() / "Library/Application Support/muse"
SRC = MUSE_DIR / "data/library.json"
COOKIE = (MUSE_DIR / "cookie.txt").read_text().strip()
OUT = Path(__file__).resolve().parent / "library.xlsx"
API = "http://127.0.0.1:10754"


def api_get(path):
    sep = "&" if "?" in path else "?"
    url = f"{API}{path}{sep}cookie={urllib.parse.quote(COOKIE)}"
    return json.loads(urllib.request.urlopen(url).read())


uid = api_get("/login/status")["data"]["profile"]["userId"]
all_record = {r["song"]["id"]: r["playCount"] for r in api_get(f"/user/record?uid={uid}&type=0").get("allData") or []}
week_record = {r["song"]["id"]: r["playCount"] for r in api_get(f"/user/record?uid={uid}&type=1").get("weekData") or []}
print(f"fetched: allTime={len(all_record)} weekly={len(week_record)}")

tracks = json.loads(SRC.read_text(encoding="utf-8"))["tracks"]

wb = Workbook()
ws = wb.active
ws.title = "library"
ws.append(["name", "ar_name", "addedAt", "playCount(allTime)", "playCount(weekly)"])
for t in tracks:
    ar = " / ".join(a.get("name", "") for a in (t.get("ar") or []))
    ts = t.get("addedAt")
    added = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S") if ts else ""
    sid = t.get("id")
    ws.append([t.get("name", ""), ar, added, all_record.get(sid, ""), week_record.get(sid, "")])

wb.save(OUT)
print(f"wrote {len(tracks)} rows -> {OUT}")
