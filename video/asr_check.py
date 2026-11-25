"""Проверка озвучки распознаванием речи: дорожка каждого сегмента распознаётся и сравнивается со сценарием.

    python video/asr_check.py segments.json tts_dir
segments.json — [{"id": "seg_01", "text": "..."}], в tts_dir лежат <id>.wav.
Распознаватель — faster-whisper, только локально (модель из кеша, без загрузки из сети): ASR_MODEL (по умолчанию small),
ASR_MODEL_DIR — папка модели. Если распознавателя или модели нет, печатается {"status": "unavailable", "reason": ...}.
Итог — одна строка JSON: доля совпадения слов по каждому сегменту и сегменты ниже порога ASR_MIN (по умолчанию 0.8).
"""
import difflib
import json
import os
import re
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def words(s):
    return re.findall(r"[а-яёa-z0-9]+", s.lower().replace("ё", "е"))


def main(seg_file, tts_dir):
    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "unavailable", "reason": f"нет faster-whisper: {e.__class__.__name__}"}, ensure_ascii=False))
        return
    name = os.environ.get("ASR_MODEL", "small")
    try:
        model = WhisperModel(os.environ.get("ASR_MODEL_DIR") or name, device="cpu", compute_type="int8", local_files_only=True)
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"status": "unavailable", "reason": f"модель {name} не найдена локально: {str(e)[:200]}"}, ensure_ascii=False))
        return
    segs = json.load(open(seg_file, encoding="utf-8"))
    thr = float(os.environ.get("ASR_MIN", "0.8"))
    out = []
    for s in segs:
        wav = os.path.join(tts_dir, s["id"] + ".wav")
        parts, _ = model.transcribe(wav, language="ru", beam_size=1)
        heard = " ".join(p.text for p in parts)
        ratio = difflib.SequenceMatcher(None, words(s["text"]), words(heard)).ratio()
        out.append({"segment": s["id"], "match": round(ratio, 3), "heard": heard.strip()})
    low = [o for o in out if o["match"] < thr]
    print(json.dumps({"status": "ok", "model": name, "threshold": thr, "mean_match": round(sum(o["match"] for o in out) / max(1, len(out)), 3), "below_threshold": low, "segments": out}, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(2)
    main(sys.argv[1], sys.argv[2])
