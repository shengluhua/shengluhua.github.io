#!/usr/bin/env python3
"""Build the Learning Atlas catalog from existing Markdown; never edit lesson/quiz files."""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
LESSONS = ROOT / "lessons"
QUIZZES = ROOT / "quizzes"
MANIFEST = ROOT / "manifest.json"
START = dt.date(2026, 10, 20)
TRACKS = ("arch", "algo", "opt", "ai")
NAME = re.compile(r"^(arch|algo|opt|ai)-(\d{3,})\.md$")


def yaml_scalar(value: str) -> str:
    value = value.strip()
    if value and value[0] in "\"'" and value[-1] == value[0]:
        return value[1:-1]
    return value


def frontmatter(text: str) -> dict[str, str]:
    match = re.match(r"\A---\s*\n(.*?)\n---\s*(?:\n|$)", text, flags=re.S)
    if not match:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        parts = re.match(r"^([a-zA-Z_][\w-]*):\s*(.*?)\s*$", line)
        if parts:
            fields[parts.group(1)] = yaml_scalar(parts.group(2))
    return fields


def tags(raw: str) -> list[str]:
    raw = raw.strip()
    if raw.startswith("[") and raw.endswith("]"):
        raw = raw[1:-1]
    return [yaml_scalar(word.strip()) for word in raw.split(",") if word.strip()]


def valid_quiz(ident: str) -> bool:
    path = QUIZZES / (ident + ".json")
    if not path.is_file():
        return False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        qs = data["questions"]
        return (data.get("lesson_id") == ident and len(qs) == 4 and
                [q.get("level") for q in qs] == [1, 2, 3, 4] and
                [q.get("points") for q in qs] == [15, 20, 25, 40])
    except (KeyError, ValueError, TypeError, OSError):
        return False


def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    previous = {entry["id"]: entry for entry in manifest.get("lessons", [])}
    found: list[dict] = []
    ids: set[str] = set()

    for path in sorted(LESSONS.glob("*.md")):
        match = NAME.match(path.name)
        if not match:
            continue
        ident, (track, numstr) = path.stem, match.groups()
        number = int(numstr)
        text = path.read_text(encoding="utf-8")
        if not text.strip():
            continue
        meta = frontmatter(text)
        if not meta:
            # Do not present unstructured/possibly placeholder text as an archived lecture.
            continue
        old = previous.get(ident, {})
        title = meta.get("title") or old.get("title") or f"第 {number} 课"
        description = meta.get("summary") or old.get("abstract") or "课程内容与自测题"
        try:
            minutes = int(meta.get("minutes") or old.get("minutes") or 17)
        except ValueError:
            minutes = 17
        entry = dict(old)
        entry.update({
            "id": ident,
            "track": track,
            "number": number,
            "date": meta.get("date") or (START + dt.timedelta(days=number - 1)).isoformat(),
            "week": (number - 1) // 7 + 1,
            "title": title,
            "abstract": description,
            "file": "lessons/" + path.name,
            "minutes": minutes,
            "kind": meta.get("kind") or old.get("kind") or "review",
            "quiz": valid_quiz(ident),
            "diagram": meta.get("diagram") or old.get("diagram") or "",
            "tags": tags(meta.get("tags", "")) or old.get("tags", []),
        })
        found.append(entry)
        ids.add(ident)

    found.sort(key=lambda l: (l["number"], TRACKS.index(l["track"])))
    last_number = max((item["number"] for item in found), default=0)
    missing = [
        f"{track}-{n:03d}"
        for n in range(1, last_number + 1)
        for track in TRACKS
        if f"{track}-{n:03d}" not in ids
    ]
    orphan = sorted(
        f.stem for f in QUIZZES.glob("*.json")
        if re.match(r"^(arch|algo|opt|ai)-\d{3,}$", f.stem) and f.stem not in ids
    )

    manifest.update({
        "version": 3,
        "lessons": found,
        "missingLessons": missing,
        "orphanQuizzes": orphan,
        "indexVerifiedOn": dt.datetime.now(ZoneInfo("Asia/Shanghai")).date().isoformat(),
        "indexDescription": "自动索引现有 Markdown；kind=review 为复习稿，缺失课稿不计入归档。",
    })
    new_text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    old_text = MANIFEST.read_text(encoding="utf-8")
    if new_text != old_text:
        MANIFEST.write_text(new_text, encoding="utf-8")
    print(f"Indexed {len(found)} lessons, {len(missing)} gaps, {len(orphan)} orphan quizzes")


if __name__ == "__main__":
    main()
