"""Обёртка видеодвижка для конвейера.

    python video/render_scene.py --schema                       # JSON-схема спецификации сцены (для запроса к модели)
    python video/render_scene.py --validate spec.json           # только проверка спецификации (pydantic)
    python video/render_scene.py spec.json out_dir [style.json] # рендер: кадры → MP4 без звука, timeline_sync, паспорт

Ответ — одна строка JSON в stdout. Ошибки спецификации: {"status": "invalid", "errors": [...]}, код выхода 2.
"""
import json
import sys
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")  # вывод JSON всегда в UTF-8, независимо от кодовой страницы консоли
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from pydantic import ValidationError  # noqa: E402
from video_engine import SceneSpecification, VisualAnimationEngine  # noqa: E402


def out(obj, code=0):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
    sys.stdout.flush()
    sys.exit(code)


def invalid(e: ValidationError):
    out({"status": "invalid", "errors": [{"loc": ".".join(str(x) for x in err["loc"]), "msg": err["msg"]} for err in e.errors()]}, 2)


def main():
    args = sys.argv[1:]
    if not args:
        out({"status": "error", "error": __doc__}, 1)
    if args[0] == "--schema":
        out(SceneSpecification.model_json_schema())
    if args[0] == "--validate":
        try:
            spec = SceneSpecification.model_validate(json.loads(Path(args[1]).read_text(encoding="utf-8")))
        except ValidationError as e:
            invalid(e)
        out({"status": "ok", "total_duration_sec": spec.total_duration_sec})
    spec_path, out_root = args[0], args[1]
    style = json.loads(Path(args[2]).read_text(encoding="utf-8")) if len(args) > 2 else None
    raw = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    try:
        res = VisualAnimationEngine(output_root=out_root, styleguide=style).build_scene(raw)
    except ValidationError as e:
        invalid(e)
    except Exception as e:  # ошибка шаблона или ffmpeg
        out({"status": "error", "error": f"{type(e).__name__}: {e}"}, 3)
    out(res)


if __name__ == "__main__":
    main()
