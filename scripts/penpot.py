#!/usr/bin/env python3
"""Клиент к локальному Penpot: чтение файла и запись изменений через RPC update-file.

Использование как библиотеки:
    from penpot import Penpot
    p = Penpot()
    p.reload()                      # свежий снимок файла
    p.objects()                     # dict объектов текущей страницы
    p.frame("Экран — ...")          # найти фрейм по имени
    p.apply([...changes...])        # применить список change-операций
"""
import json
import os
import urllib.error
import urllib.request
import uuid

DIR = os.path.dirname(os.path.abspath(__file__))
FILE_ID = "d9147cf4-631f-815b-8008-6c739ade69ad"
PAGE_ID = "d9147cf4-631f-815b-8008-6c739ade69ae"
ROOT = "00000000-0000-0000-0000-000000000000"


class PenpotError(RuntimeError):
    pass


class Penpot:
    def __init__(self, file_id=FILE_ID, page_id=PAGE_ID):
        self.file_id = file_id
        self.page_id = page_id
        self.auth = self._auth_token()
        self.data = None
        self.revn = None
        self.vern = None

    @staticmethod
    def _auth_token():
        """Кука auth-token: из PENPOT_AUTH_TOKEN, из penpot.cookies рядом, иначе логин."""
        if os.environ.get("PENPOT_AUTH_TOKEN"):
            return os.environ["PENPOT_AUTH_TOKEN"]
        jar = os.path.join(DIR, "penpot.cookies")
        if os.path.exists(jar):
            for line in open(jar):
                if "auth-token" in line:
                    return line.split("\t")[-1].strip()
        req = urllib.request.Request(
            "http://localhost:9001/api/rpc/command/login-with-password",
            data=json.dumps({
                "email": os.environ.get("PENPOT_EMAIL", "malafdmitry0@gmail.com"),
                "password": os.environ.get("PENPOT_PASSWORD", "penpot123"),
            }).encode(), method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        with urllib.request.urlopen(req, timeout=30) as r:
            for hdr in r.headers.get_all("Set-Cookie") or []:
                if hdr.startswith("auth-token="):
                    return hdr.split(";")[0].split("=", 1)[1]
        raise PenpotError("не удалось получить auth-token: задай PENPOT_AUTH_TOKEN")

    # ---------- транспорт ----------
    def rpc(self, cmd, payload=None, method="POST"):
        url = f"http://localhost:9001/api/rpc/command/{cmd}"
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        req.add_header("Cookie", f"auth-token={self.auth}")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode()
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            raise PenpotError(f"{cmd} → HTTP {e.code}: {e.read().decode()[:800]}") from None

    # ---------- чтение ----------
    def reload(self):
        self.data = self.rpc(f"get-file?id={self.file_id}", method="GET")
        self.revn = self.data["revn"]
        self.vern = self.data.get("vern", 0)
        return self

    def _pages(self):
        d = self.data["data"]
        return d.get("pagesIndex") or d.get("pages-index")

    def objects(self):
        return self._pages()[self.page_id]["objects"]

    def frame(self, name):
        for o in self.objects().values():
            if o.get("name") == name:
                return o
        raise PenpotError(f"нет объекта с именем {name!r}")

    def children(self, obj_id):
        objs = self.objects()
        return [objs[c] for c in objs[obj_id].get("shapes", []) if c in objs]

    def tree(self, obj_id, depth=0, max_depth=3):
        objs = self.objects()
        o = objs[obj_id]
        sel = o.get("selrect") or {}
        yield ("  " * depth + f"{o.get('type','?'):6s} {o.get('name','')!r} "
               f"{round(sel.get('width',0))}×{round(sel.get('height',0))} [{o['id'][:8]}]")
        if depth < max_depth:
            for cid in o.get("shapes", []):
                if cid in objs:
                    yield from self.tree(cid, depth + 1, max_depth)

    # ---------- запись ----------
    def apply(self, changes):
        if not changes:
            return self.revn
        res = self.rpc("update-file", {
            "id": self.file_id,
            "sessionId": str(uuid.uuid4()),
            "revn": self.revn,
            "vern": self.vern,
            "changes": changes,
        })
        self.revn = res.get("revn", self.revn + 1) if isinstance(res, dict) else self.revn + 1
        if isinstance(res, dict) and "vern" in res:
            self.vern = res["vern"]
        return self.revn

    def set_attrs(self, obj_id, **attrs):
        return {"type": "mod-obj", "pageId": self.page_id, "id": obj_id,
                "operations": [{"type": "set", "attr": k, "val": v} for k, v in attrs.items()]}

    def delete(self, obj_id):
        return {"type": "del-obj", "id": obj_id, "pageId": self.page_id}


if __name__ == "__main__":
    import sys
    p = Penpot().reload()
    print(f"файл «{p.data['name']}» revn={p.revn} vern={p.vern}")
    if len(sys.argv) > 1:
        print("\n".join(p.tree(p.frame(sys.argv[1])["id"],
                               max_depth=int(sys.argv[2]) if len(sys.argv) > 2 else 2)))
    else:
        objs = p.objects()
        roots = [o for o in objs.values() if o.get("type") == "frame" and o.get("frameId") == ROOT]
        for f in sorted(roots, key=lambda x: (x.get("y") or 0, x.get("x") or 0)):
            sel = f.get("selrect") or {}
            print(f"  {f['name']:42s} {round(sel.get('width',0))}×{round(sel.get('height',0))}"
                  f"  детей {len(f.get('shapes', []))}  [{f['id'][:8]}]")
