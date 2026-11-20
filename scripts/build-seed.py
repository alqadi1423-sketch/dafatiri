#!/usr/bin/env python3
"""يبني migrations/0002_seed.sql من الأرصدة والحركات المسجلة يوم 20 نوفمبر 2026."""
import json
from pathlib import Path

D = "2026-11-20"

LEDGERS = [
    {
        "id": "khas", "name": "دفتر 1: خاص", "sort": 1, "private": 1,
        "config": {
            "cols": [{"key": "debt", "label": "الدين", "sign": 1},
                     {"key": "pay", "label": "السداد", "sign": -1}],
            "items": [{"label": "رصيد افتتاحي", "col": "debt"},
                      {"label": "دين إضافي", "col": "debt"},
                      {"label": "سداد", "col": "pay"}],
            "balanceLabel": "المتبقي لك",
        },
        "members": [("عبدالغني", None), ("بيت جميل", None), ("سمير", None), ("نبيله", None),
                    ("سبأ", None), ("منى", None), ("سميره", None), ("أمي", None),
                    ("بلقيس", None), ("بلال", None), ("علي", None), ("جميل", None)],
        "tx": [
            ("عبدالغني", "رصيد افتتاحي", 9813), ("بيت جميل", "رصيد افتتاحي", 15595),
            ("سمير", "رصيد افتتاحي", 12881), ("نبيله", "رصيد افتتاحي", 900),
            ("سبأ", "رصيد افتتاحي", 920), ("منى", "رصيد افتتاحي", 255),
            ("سميره", "رصيد افتتاحي", 3968), ("أمي", "رصيد افتتاحي", 5376),
            ("بلقيس", "رصيد افتتاحي", 645), ("بلال", "رصيد افتتاحي", 1215),
            ("علي", "رصيد افتتاحي", 13379), ("جميل", "رصيد افتتاحي", 13000),
            ("بلقيس", "سداد", 30),
        ],
    },
    {
        "id": "sandooq", "name": "دفتر 2: صندوق العائلة", "sort": 2, "private": 0,
        "config": {
            "cols": [{"key": "share", "label": "الحصة والإيداع", "sign": 1},
                     {"key": "withdraw", "label": "السحب", "sign": -1}],
            "items": [{"label": "رصيد افتتاحي", "col": "share"},
                      {"label": "إيداع", "col": "share"},
                      {"label": "سحب", "col": "withdraw"}],
            "balanceLabel": "الرصيد المتبقي",
        },
        "members": [("نبيله", "بنت"), ("منى", "بنت"), ("سميره", "بنت"), ("جميلة", "بنت"),
                    ("بلقيس", "بنت"), ("سبأ", "بنت"), ("جميل", "ابن"), ("نبيل", "ابن"),
                    ("سمير", "ابن"), ("عبدالغني", "ابن"), ("فاطمه", "الأم")],
        "tx": [(n, "رصيد افتتاحي", 437500) for n in ["نبيله", "منى", "سميره", "جميلة", "بلقيس", "سبأ"]]
              + [(n, "رصيد افتتاحي", 875000) for n in ["جميل", "نبيل", "سمير", "عبدالغني", "فاطمه"]],
    },
    {
        "id": "ali-hisn", "name": "دفتر 3: ديون العائلة على علي حصن", "sort": 3, "private": 0,
        "config": {
            "cols": [{"key": "debt", "label": "أصل الدين", "sign": 1},
                     {"key": "pay", "label": "المسدد", "sign": -1},
                     {"key": "waive", "label": "الإبراء", "sign": -1}],
            "items": [{"label": "رصيد افتتاحي", "col": "debt"},
                      {"label": "دين إضافي", "col": "debt"},
                      {"label": "سداد", "col": "pay"},
                      {"label": "إبراء", "col": "waive"}],
            "balanceLabel": "المتبقي على علي حصن",
        },
        "members": [("أمي", None), ("عبدالغني", None), ("بيت جميل", None), ("نبيل", None),
                    ("سمير", None), ("نبيله", None), ("جميله", None), ("سبأ", None),
                    ("بلقيس", None), ("سميره", None), ("منى", None)],
        "tx": [
            ("أمي", "رصيد افتتاحي", 15000), ("أمي", "إبراء", 5000, "تصدّقت"),
            ("عبدالغني", "رصيد افتتاحي", 10000), ("بيت جميل", "رصيد افتتاحي", 15000),
            ("نبيل", "رصيد افتتاحي", 20000), ("سمير", "رصيد افتتاحي", 15000),
            ("نبيله", "رصيد افتتاحي", 7500), ("جميله", "رصيد افتتاحي", 7500),
            ("سبأ", "رصيد افتتاحي", 7500), ("بلقيس", "رصيد افتتاحي", 7500),
            ("سميره", "رصيد افتتاحي", 7500), ("منى", "رصيد افتتاحي", 7500),
            ("منى", "إبراء", 7500, "تصدّقت"),
            ("سميره", "سداد", 1165, "سحب من صندوق العائلة"),
            ("سمير", "سداد", 3340, "سحب من صندوق العائلة"),
            ("نبيله", "سداد", 200, "سحب من صندوق العائلة"),
        ],
    },
]


def q(v):
    if v is None:
        return "NULL"
    if isinstance(v, int):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


out = ["-- البيانات الافتتاحية كما سُجلت في 20 نوفمبر 2026 (مولّد من scripts/build-seed.py)"]
for L in LEDGERS:
    out.append(f"INSERT INTO ledgers (id, name, sort, private, config) VALUES ({q(L['id'])}, {q(L['name'])}, "
               f"{L['sort']}, {L['private']}, {q(json.dumps(L['config'], ensure_ascii=False))});")
    for i, (name, role) in enumerate(L["members"], 1):
        out.append(f"INSERT INTO members (ledger_id, name, role_label, sort) VALUES ({q(L['id'])}, {q(name)}, {q(role)}, {i});")
    item_col = {it["label"]: it["col"] for it in L["config"]["items"]}
    names = {m for m, _ in L["members"]}
    for t in L["tx"]:
        name, item, riyal = t[0], t[1], t[2]
        note = t[3] if len(t) > 3 else None
        assert name in names, name
        out.append(
            "INSERT INTO tx (ledger_id, member_id, date, item, col, amount, note, created_by) "
            f"SELECT {q(L['id'])}, id, {q(D)}, {q(item)}, {q(item_col[item])}, {riyal * 100}, {q(note)}, 'seed' "
            f"FROM members WHERE ledger_id = {q(L['id'])} AND name = {q(name)};")

Path(__file__).resolve().parent.parent.joinpath("migrations/0002_seed.sql").write_text("\n".join(out) + "\n", encoding="utf-8")
print("ok")
