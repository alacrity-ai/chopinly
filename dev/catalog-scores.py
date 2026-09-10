#!/usr/bin/env python3
"""Catalogue helper for the Scores library (WSHED-104 / WSHED-105).

Gives uploaded scores a proper title, composer and tags WITHOUT touching a PDF:
the edits are metadata on the `score` sync entities in D1, so LWW carries them
to every device on its next sync. Four subcommands, meant to be run in order
(the SOP is claude_ops/docs/sops/chopinly-score-cataloging.md):

  probe  — for every PDF in --pdfs, dump embedded metadata, outline, the text
           of the first pages, and render pages 1–2 to PNG for a visual look
           (needs PyMuPDF: `pip install pymupdf`)
  table  — turn a decisions TSV into the markdown review table for the card
  sql    — turn the decisions TSV into the D1 statements that apply them
           (idempotent: rows already matching are skipped)
  check  — after applying, compare a fresh D1 dump against the decisions

Inputs:
  --scores   the raw JSON that `wrangler d1 execute --json` prints for
             SELECT id, body, updated_at, deleted, rev FROM entities WHERE kind='score' …
  --decisions a TSV with the header
             id  title  composer  tags  rung  confidence  note
             (tags are |-separated, lowercase, from the SOP's vocabulary)

Nothing here talks to the network; listing and downloading the PDFs and running
the SQL are wrangler / curl one-liners in the SOP, so the secrets stay in the
shell and never in this file.
"""
import argparse, json, os, re, sys, time, csv

VOCAB = {
    "era": ["baroque", "classical", "romantic", "impressionist", "modern"],
    "form": ["invention", "prelude", "fugue", "suite", "partita", "sonata", "variations", "fantasia",
             "improvisation", "ballade", "nocturne", "waltz", "impromptu", "concerto", "étude"],
    "kind": ["collection", "method", "arrangement", "game"],
    "instrument": ["organ"],
}
ALL_TAGS = {t for v in VOCAB.values() for t in v}
RUNGS = ["metadata", "filename", "text", "outline", "visual"]
CONFIDENCE = ["high", "medium", "low"]


def load_scores(path):
    """Raw wrangler --json output (a list with one result set) → {id: row} with body parsed."""
    raw = json.load(open(path, encoding="utf-8"))
    results = raw[0]["results"] if isinstance(raw, list) and raw and "results" in raw[0] else raw
    out = {}
    for r in results:
        if r.get("deleted"):
            continue
        out[r["id"]] = {**r, "body": json.loads(r["body"])}
    return out


def load_decisions(path):
    rows = list(csv.DictReader(open(path, encoding="utf-8"), delimiter="\t"))
    need = ["id", "title", "composer", "tags", "rung", "confidence"]
    bad = []
    for i, r in enumerate(rows, 2):
        for k in need:
            if not (r.get(k) or "").strip() and k != "composer":
                bad.append(f"line {i}: empty {k}")
        r["tags"] = [t.strip() for t in (r.get("tags") or "").split("|") if t.strip()]
        for t in r["tags"]:
            if t not in ALL_TAGS:
                bad.append(f"line {i}: tag '{t}' is not in the vocabulary")
        if r["rung"] not in RUNGS:
            bad.append(f"line {i}: rung '{r['rung']}' (use {'/'.join(RUNGS)})")
        if r["confidence"] not in CONFIDENCE:
            bad.append(f"line {i}: confidence '{r['confidence']}'")
        r["title"] = r["title"].strip()
        r["composer"] = (r.get("composer") or "").strip()
    if bad:
        sys.exit("decisions.tsv: " + "; ".join(bad))
    return rows


def cmd_probe(a):
    import fitz  # PyMuPDF
    scores = load_scores(a.scores)
    os.makedirs(a.thumbs, exist_ok=True)
    out = []
    for sid, s in scores.items():
        p = os.path.join(a.pdfs, f"{sid}.pdf")
        if not os.path.exists(p):
            out.append({"id": sid, "title": s["body"].get("title"), "error": "no file"})
            continue
        try:
            d = fitz.open(p)
        except Exception as e:  # noqa: BLE001
            out.append({"id": sid, "title": s["body"].get("title"), "error": str(e)})
            continue
        md = {k: v for k, v in (d.metadata or {}).items() if v}
        texts = [re.sub(r"\s+", " ", d[i].get_text("text")).strip()[:600] for i in range(min(3, d.page_count))]
        for i in range(min(a.pages, d.page_count)):
            pg = d[i]
            z = a.width / pg.rect.width
            pg.get_pixmap(matrix=fitz.Matrix(z, z), alpha=False).save(os.path.join(a.thumbs, f"{sid}-{i + 1}.png"))
        out.append({"id": sid, "title": s["body"].get("title"), "composer": s["body"].get("composer", ""),
                    "tags": s["body"].get("tags", []), "pages": d.page_count, "size": os.path.getsize(p),
                    "meta": md, "has_text": any(len(t) > 20 for t in texts), "text": texts,
                    "outline": [t[1] for t in d.get_toc()][:60]})
        d.close()
    json.dump(out, open(a.out, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    n = len(out)
    print(f"{n} probed; {sum(1 for o in out if o.get('has_text'))} with a text layer; "
          f"{sum(1 for o in out if o.get('meta', {}).get('title'))} with a metadata title; "
          f"{sum(1 for o in out if o.get('outline'))} with an outline; "
          f"{sum(1 for o in out if o.get('error'))} errors")


def cmd_table(a):
    scores = load_scores(a.scores)
    rows = load_decisions(a.decisions)
    print("| # | score id | old title | new title | composer | tags | rung | conf | note |")
    print("|---|---|---|---|---|---|---|---|---|")
    for i, r in enumerate(rows, 1):
        s = scores.get(r["id"])
        old = s["body"].get("title", "") if s else "(not in D1)"
        oc = s["body"].get("composer", "") if s else ""
        oldc = f" (was: {oc})" if oc and oc != r["composer"] else ""
        flag = "" if r["confidence"] == "high" else " ⚠️"
        print(f"| {i} | `{r['id'][:8]}` | {old} | **{r['title']}** | {r['composer']}{oldc} | {', '.join(r['tags'])} | {r['rung']} | {r['confidence']}{flag} | {r.get('note', '')} |")
    missing = [sid for sid in scores if sid not in {r['id'] for r in rows}]
    if missing:
        print(f"\n**{len(missing)} score(s) in D1 without a decision:** " + ", ".join(f"`{m[:8]}` {scores[m]['body'].get('title')}" for m in missing))


def q(s):
    return "'" + s.replace("'", "''") + "'"


def changed(body, r):
    return (body.get("title") != r["title"] or (body.get("composer") or "") != r["composer"]
            or list(body.get("tags") or []) != r["tags"])


def cmd_sql(a):
    scores = load_scores(a.scores)
    rows = load_decisions(a.decisions)
    now = int(time.time() * 1000)
    todo = []
    for r in rows:
        s = scores.get(r["id"])
        if not s:
            print(f"-- skip {r['id']}: not in D1", file=sys.stderr)
            continue
        if not changed(s["body"], r):
            continue
        body = dict(s["body"])
        body["title"] = r["title"]
        if r["composer"]:
            body["composer"] = r["composer"]
        else:
            body.pop("composer", None)
        body["tags"] = r["tags"]
        todo.append((r["id"], json.dumps(body, ensure_ascii=False, separators=(",", ":"))))
    n = len(todo)
    lines = [f"-- catalog-scores: {n} score rows for user {a.uid}, generated {time.strftime('%Y-%m-%d %H:%M:%S')} (updated_at {now})",
             f"UPDATE users SET rev = rev + {n} WHERE id = {q(a.uid)};"]
    for k, (sid, body) in enumerate(todo, 1):
        lines.append(
            f"UPDATE entities SET body = {q(body)}, updated_at = {now}, rev = (SELECT rev FROM users WHERE id = {q(a.uid)}) - {n} + {k} "
            f"WHERE user_id = {q(a.uid)} AND kind = 'score' AND id = {q(sid)} AND deleted = 0;")
    open(a.out, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print(f"{n} rows to update → {a.out}" if n else "nothing to do: every row already matches")


def cmd_check(a):
    scores = load_scores(a.scores)
    rows = load_decisions(a.decisions)
    bad = [r["id"] for r in rows if r["id"] not in scores or changed(scores[r["id"]]["body"], r)]
    print(f"{len(rows) - len(bad)} of {len(rows)} decisions applied" + (f"; NOT applied: {', '.join(b[:8] for b in bad)}" if bad else ""))
    sys.exit(1 if bad else 0)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("probe"); p.add_argument("--scores", required=True); p.add_argument("--pdfs", required=True)
    p.add_argument("--out", default="probe.json"); p.add_argument("--thumbs", default="thumbs")
    p.add_argument("--pages", type=int, default=2); p.add_argument("--width", type=int, default=1000); p.set_defaults(f=cmd_probe)
    p = sub.add_parser("table"); p.add_argument("--scores", required=True); p.add_argument("--decisions", required=True); p.set_defaults(f=cmd_table)
    p = sub.add_parser("sql"); p.add_argument("--scores", required=True); p.add_argument("--decisions", required=True)
    p.add_argument("--uid", required=True); p.add_argument("--out", default="apply.sql"); p.set_defaults(f=cmd_sql)
    p = sub.add_parser("check"); p.add_argument("--scores", required=True); p.add_argument("--decisions", required=True); p.set_defaults(f=cmd_check)
    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
