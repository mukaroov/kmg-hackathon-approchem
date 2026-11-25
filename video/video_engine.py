import ast
import json
import math
import operator
import os
import shutil
import subprocess
from abc import ABC, abstractmethod
from enum import Enum
from pathlib import Path
from typing import Annotated, Any, Dict, List, Literal, Optional, Type, Union

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.gridspec import GridSpec
from matplotlib.patches import Polygon, Rectangle
from pydantic import BaseModel, Field, model_validator


# =====================================================================
# 1. СТРОГИЕ КОНТРАКТЫ ДАННЫХ (LLM TOOL SCHEMA)
# =====================================================================

class FrameClass(str, Enum):
    A_DATA = "A"       # Данные (кривые, кроссплоты, карты) — 0% генерации
    B_PROCESS = "B"    # Процессы (фильтрация, прибор в скважине, рост фаций) — 0% генерации
    C_APPEARANCE = "C" # Внешний вид
    D_ATMOSPHERE = "D" # Атмосфера


class VideoFormat(str, Enum):
    SHORTS = "9:16"    # 40-75 сек (макс 90), один механизм
    EXPLAINER = "16:9" # 90-180 сек, синхронные виды + решение на данных


class RenderMode(str, Enum):
    MP4 = "mp4"              # Рендер финального видеофайла
    WEB_STATE = "web_state"  # Экспорт JSON-состояний для интерактива в браузере (без MP4)


class TimelineSegment(BaseModel):
    segment_id: str = Field(..., description="Уникальный ID сегмента, например 'seg_01'")
    claim_id: str = Field(..., description="ID утверждения из учебного слоя (источник правды)")
    page_ref: int = Field(..., ge=1, description="Номер страницы книги, подтверждающий факт")
    duration_sec: float = Field(..., gt=0.5, le=60.0, description="Длительность сегмента в секундах")
    screen_caption: str = Field(
        ...,
        description="Короткая плашка на экран (СТРОГО до 8 слов, без формул и греческих букв)"
    )
    narration_script: str = Field(
        ...,
        description="Текст для отдельного агента озвучки (до 18 слов, числа и термины словами)"
    )
    is_prediction_pause: bool = Field(
        False,
        description="True, если в конце этого сегмента держится пауза на вопрос-предсказание"
    )


# --- Строгие схемы параметров для каждого шаблона ---

class PressureWaveParams(BaseModel):
    template_type: Literal["pressure_wave_2d"] = "pressure_wave_2d"
    p_init_mpa: float = Field(..., gt=0, description="Начальное пластовое давление P0, МПа")
    p_well_mpa: Optional[float] = Field(None, ge=0, description="Забойное давление на скважине Pc, МПа (режим well_mode='pressure')")
    kappa_m2_s: float = Field(..., gt=0, description="Коэффициент пьезопроводности, м^2/с")
    r_max_m: float = Field(100.0, gt=1.0, description="Радиус рассматриваемой зоны пласта, м")
    r_well_m: float = Field(0.1, gt=0.01, description="Радиус скважины, м")
    sim_time_sec: float = Field(3600.0, gt=1.0, description="Модельное физическое время процесса, сек")
    well_mode: Literal["pressure", "rate"] = Field(
        "pressure",
        description="'pressure' — постоянное забойное давление (численное решение); "
                    "'rate' — постоянный дебит: точная формула p = P0 − A·[−Ei(−r²/(4κt))] (основная формула упругого режима)"
    )
    drawdown_scale_mpa: Optional[float] = Field(
        None, gt=0, description="Для well_mode='rate': множитель A = Q0·μ/(4π·k·h), МПа"
    )
    show_log_approx: bool = Field(
        False, description="Для well_mode='rate': показать логарифмическое приближение −Ei(−x) ≈ ln(1/x) − 0,5772 и границу x = 0,01"
    )

    @model_validator(mode="after")
    def check_bounds(self) -> "PressureWaveParams":
        if self.r_well_m >= self.r_max_m:
            raise ValueError("r_well_m должен быть строго меньше r_max_m")
        if self.well_mode == "pressure":
            if self.p_well_mpa is None:
                raise ValueError("для well_mode='pressure' нужно p_well_mpa")
            if math.isclose(self.p_init_mpa, self.p_well_mpa):
                raise ValueError("p_init_mpa и p_well_mpa не должны совпадать, иначе перепад давления равен нулю")
        elif self.drawdown_scale_mpa is None:
            raise ValueError("для well_mode='rate' нужно drawdown_scale_mpa = Q0·μ/(4π·k·h), МПа")
        return self


class WellLayer(BaseModel):
    top_m: float
    bottom_m: float
    lithology: Literal["clay", "sand_oil", "sand_water", "sand_gas", "limestone", "reef", "dolomite", "salt", "anhydrite", "dense"]
    label: str
    gk_value: float = Field(..., description="Показание гамма-каротажа (мкР/ч или API)")
    rt_value: float = Field(..., description="Удельное электрическое сопротивление (Ом·м)")

    @model_validator(mode="after")
    def check_depth(self) -> "WellLayer":
        if self.bottom_m <= self.top_m:
            raise ValueError(f"Подошва пласта ({self.bottom_m}) должна быть глубже кровли ({self.top_m})")
        return self


class WellLogParams(BaseModel):
    template_type: Literal["well_log_sync"] = "well_log_sync"
    layers: List[WellLayer] = Field(..., min_length=2, description="Список пластов сверху вниз")
    gk_label: str = Field("ГК (мкР/ч)", description="Подпись кривой радиоактивности")
    rt_label: str = Field("УЭС (Ом·м)", description="Подпись кривой сопротивления")


class CrossplotPoint(BaseModel):
    x: float
    y: float
    label: str = ""
    is_reservoir: bool = False


class CrossplotParams(BaseModel):
    template_type: Literal["crossplot_cutoff"] = "crossplot_cutoff"
    points: List[CrossplotPoint] = Field(..., min_length=5, description="Точки измерений из книги/датасета")
    x_label: str = Field(..., description="Ось X, например 'Глинистость Kгл, %'")
    y_label: str = Field(..., description="Ось Y, например 'Пористость Kп, %'")
    x_cutoff: Optional[float] = Field(None, description="Граничное значение по оси X")
    y_cutoff: Optional[float] = Field(None, description="Граничное значение по оси Y")
    cutoff_rule_text: str = Field(..., description="Правило выделения коллектора текстом")


class GeologicalStage(BaseModel):
    stage_name: str = Field(..., description="Название этапа геологического времени")
    x_coords: List[float] = Field(..., min_length=3, description="Координаты профиля по простиранию, м")
    top_profile_m: List[float] = Field(..., min_length=3, description="Кровля слоя на этом этапе, м")
    base_profile_m: List[float] = Field(..., min_length=3, description="Подошва слоя на этом этапе, м")
    lithology: Literal["clay", "sand_oil", "sand_water", "sand_gas", "limestone", "reef", "dolomite", "salt", "anhydrite", "dense"]

    @model_validator(mode="after")
    def check_lengths(self) -> "GeologicalStage":
        n = len(self.x_coords)
        if len(self.top_profile_m) != n or len(self.base_profile_m) != n:
            raise ValueError(
                f"В этапе '{self.stage_name}' длины x_coords ({n}), top_profile_m ({len(self.top_profile_m)}) "
                f"и base_profile_m ({len(self.base_profile_m)}) обязаны совпадать."
            )
        return self


class GeologicalEvolutionParams(BaseModel):
    template_type: Literal["geological_evolution"] = "geological_evolution"
    stages: List[GeologicalStage] = Field(..., min_length=2, description="Последовательные этапы от древних к молодым")
    true_horizontal_m: float = Field(..., gt=0, description="Реальная протяжённость разреза, м")
    true_vertical_m: float = Field(..., gt=0, description="Реальная мощность толщи, м")
    show_true_scale_at_end: bool = Field(True, description="Переключить на истинный масштаб 1:1 в финале (по ТЗ)")


class FormulaPlotParams(BaseModel):
    template_type: Literal["formula_dynamic_plot"] = "formula_dynamic_plot"
    formula_expr: str = Field(
        ...,
        description="Математическая формула Python от переменной 'x' и dynamic_var, напр. 'rho * 9.81 * x / 1e6'"
    )
    x_min: float
    x_max: float
    x_label: str
    y_label: str
    plot_title: str
    dynamic_var_name: str = Field(..., description="Имя изменяемого во времени параметра, напр. 'rho'")
    dynamic_var_start: float
    dynamic_var_end: float
    dynamic_var_unit: str = ""
    constants: Dict[str, float] = Field(default_factory=dict, description="Константы из книги, входящие в формулу")

    @model_validator(mode="after")
    def check_x_range(self) -> "FormulaPlotParams":
        if self.x_max <= self.x_min:
            raise ValueError("x_max должен быть строго больше x_min")
        return self


SceneParamsUnion = Annotated[
    Union[
        PressureWaveParams,
        WellLogParams,
        CrossplotParams,
        GeologicalEvolutionParams,
        FormulaPlotParams,
    ],
    Field(discriminator="template_type")
]


class SceneSpecification(BaseModel):
    """Единая спецификация сцены, которую заполняет LLM-агент."""
    node_id: str = Field(..., description="Устойчивый ID узла учебного слоя")
    render_mode: RenderMode = RenderMode.MP4
    video_format: VideoFormat = VideoFormat.EXPLAINER
    fps: int = Field(24, ge=10, le=60)

    # Классы кадров и честность (обязательно по ТЗ)
    frame_class: FrameClass = Field(..., description="Только 'A' (данные) или 'B' (процесс)")
    origin_label: Literal["симуляция", "реальные данные", "схема"] = "симуляция"
    is_true_scale: bool = False
    exaggeration_note: str = Field(
        ...,
        description="Что именно преувеличено, напр.: 'Не в масштабе: вертикальный масштаб увеличен в 20 раз'"
    )
    assumptions: List[str] = Field(..., min_length=1, description="Допущения модели из книги")

    # Строго типизированные параметры выбранного физического шаблона
    scene_params: SceneParamsUnion

    # Педагогическая обвязка для паспорта ролика
    hook_question: str
    prediction_question: str
    transfer_question: str
    data_bridge_text: str

    # Временная шкала (синхронизирует экранные подписи и отдельного агента озвучки)
    timeline_segments: List[TimelineSegment] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_tz_rules(self) -> "SceneSpecification":
        if self.frame_class not in {FrameClass.A_DATA, FrameClass.B_PROCESS}:
            raise ValueError("Детерминированный движок обслуживает только классы кадров A и B.")

        if not self.is_true_scale and len(self.exaggeration_note.strip()) < 10:
            raise ValueError("Если is_true_scale=False, необходимо явно указать, что преувеличено (exaggeration_note).")

        for seg in self.timeline_segments:
            words = seg.screen_caption.strip().split()
            if len(words) > 9:
                raise ValueError(
                    f"Подпись '{seg.screen_caption}' слишком длинная ({len(words)} слов). По ТЗ максимум 7-8 слов."
                )
            if "\\" in seg.screen_caption or "$" in seg.screen_caption:
                raise ValueError(
                    f"В экранной подписи '{seg.screen_caption}' запрещены LaTeX-формулы и спецсимволы."
                )
        return self

    @property
    def total_duration_sec(self) -> float:
        return round(sum(s.duration_sec for s in self.timeline_segments), 3)


# =====================================================================
# 2. ДОМЕННЫЙ СТАЙЛГАЙД (ОТДЕЛЁН ОТ ДВИЖКА)
# =====================================================================

class DomainStyleConfig:
    def __init__(self, styleguide_dict: Optional[Dict[str, Any]] = None):
        self.cfg = styleguide_dict or {
            "bg_color": "#0F1514",
            "panel_color": "#172020",
            "ink_color": "#E5ECE9",
            "accent_color": "#52C3BF",
            "secondary_accent": "#EE8A5A",
            "ochre": "#DDAA4C",
            "pressure_cmap": "viridis",
            "lithology": {
                "clay": "#6E7F80",       # Глина
                "sand_oil": "#9C6C12",   # Нефтенасыщенный коллектор
                "sand_water": "#2F65A8", # Водоносный коллектор
                "sand_gas": "#C8612F",   # Газонасыщенный коллектор
                "limestone": "#8BB2C2",  # Карбонаты / известняк
                "reef": "#F0A35E",       # Рифовый известняк
                "dolomite": "#A98FD1",   # Доломит
                "salt": "#C9D6DF",       # Соль
                "anhydrite": "#D98CB3",  # Ангидрит
                "dense": "#8C7B6B"       # Плотная порода
            },
            "font_family": "DejaVu Sans"
        }


# =====================================================================
# 3. РЕЕСТР ШАБЛОНОВ (5 УНИВЕРСАЛЬНЫХ ДВИЖКОВ ПОД ВСЕ ГЛАВЫ)
# =====================================================================

class BaseRenderTemplate(ABC):
    def __init__(self, style: DomainStyleConfig):
        self.style = style.cfg

    @abstractmethod
    def simulate(self, spec: SceneSpecification) -> Dict[str, Any]:
        """Вычисляет все состояния модели на интервале [0, total_duration_sec]."""
        pass

    @abstractmethod
    def draw_frame(
        self, fig: plt.Figure, gs: GridSpec, spec: SceneSpecification, sim_data: Dict[str, Any], frame_idx: int
    ) -> None:
        """Отрисовывает кадр frame_idx из единого состояния sim_data."""
        pass

    def export_lightweight_state(self, sim_data: Dict[str, Any], max_steps: int = 60) -> Dict[str, Any]:
        """Сериализует данные для веб-интерактива (JSON без рендера MP4)."""
        serializable: Dict[str, Any] = {}
        for k, v in sim_data.items():
            if isinstance(v, np.ndarray):
                if v.ndim >= 1 and len(v) > max_steps:
                    idx = np.linspace(0, len(v) - 1, max_steps, dtype=int)
                    serializable[k] = np.round(v[idx], 4).tolist()
                else:
                    serializable[k] = np.round(v, 4).tolist()
            else:
                serializable[k] = v
        return serializable


TEMPLATE_REGISTRY: Dict[str, Type[BaseRenderTemplate]] = {}


def register_template(template_type: str):
    def decorator(cls: Type[BaseRenderTemplate]):
        TEMPLATE_REGISTRY[template_type] = cls
        return cls
    return decorator


# --- ШАБЛОН 1: ВОЛНА ДАВЛЕНИЯ В УПРУГОМ ПЛАСТЕ ---
def exp_integral_e1(x: np.ndarray) -> np.ndarray:
    """E1(x) = −Ei(−x) = ∫_x^∞ e^{−u}/u du при x > 0: ряд при x ≤ 1, цепная дробь при x > 1."""
    x = np.asarray(x, dtype=np.float64)
    out = np.empty_like(x)
    small = x <= 1.0
    xs = x[small]
    if xs.size:
        s = np.zeros_like(xs)
        term = np.ones_like(xs)
        for n in range(1, 40):
            term = term * (-xs) / n            # (−x)^n / n!
            s = s - term / n                   # Σ (−1)^{n+1} x^n / (n·n!)
        out[small] = -0.5772156649015329 - np.log(xs) + s
    xl = x[~small]
    if xl.size:
        f = xl + 2 * 60 + 1
        for n in range(60, 0, -1):
            f = xl + 2 * n - 1 - (n * n) / f
        out[~small] = np.exp(-xl) / f
    return out


@register_template("pressure_wave_2d")
class PressureWaveTemplate(BaseRenderTemplate):
    def simulate(self, spec: SceneSpecification) -> Dict[str, Any]:
        p: PressureWaveParams = spec.scene_params  # type: ignore
        total_frames = max(2, int(round(spec.total_duration_sec * spec.fps)))
        if p.well_mode == "rate":
            return self._simulate_rate(spec, p, total_frames)
        nr = 120
        r = np.linspace(p.r_well_m, p.r_max_m, nr)
        dr = r[1] - r[0]

        dt_frame = p.sim_time_sec / total_frames
        dt_sub = 0.4 * (dr ** 2) / p.kappa_m2_s
        substeps = min(2000, max(1, int(math.ceil(dt_frame / dt_sub))))
        dt = dt_frame / substeps

        P = np.full(nr, p.p_init_mpa, dtype=np.float64)
        P[0] = p.p_well_mpa
        history_P, history_t_min = [], []

        for f in range(total_frames):
            history_P.append(P.copy())
            history_t_min.append((f * dt_frame) / 60.0)
            for _ in range(substeps):
                P_new = P.copy()
                d2P = (P[2:] - 2 * P[1:-1] + P[:-2]) / (dr ** 2)
                dP = (P[2:] - P[:-2]) / (2 * dr)
                P_new[1:-1] = P[1:-1] + dt * p.kappa_m2_s * (d2P + dP / r[1:-1])
                P_new[0] = p.p_well_mpa
                P_new[-1] = P_new[-2]
                P = P_new

        x = np.linspace(-p.r_max_m, p.r_max_m, 140)
        X, Y = np.meshgrid(x, x)
        R_grid = np.sqrt(X ** 2 + Y ** 2)

        vmin = min(p.p_well_mpa, p.p_init_mpa)
        vmax = max(p.p_well_mpa, p.p_init_mpa)

        return {
            "r": r,
            "R_grid": R_grid,
            "P_frames": np.array(history_P),
            "t_min": np.array(history_t_min),
            "p_init": p.p_init_mpa,
            "p_well": p.p_well_mpa,
            "vmin": vmin,
            "vmax": vmax,
            "r_max": p.r_max_m,
        }

    def _simulate_rate(self, spec: SceneSpecification, p: PressureWaveParams, total_frames: int) -> Dict[str, Any]:
        """Постоянный дебит: точное решение для точечного стока p = P0 − A·E1(r²/(4κt)), без численной схемы."""
        A = float(p.drawdown_scale_mpa)
        r = np.geomspace(p.r_well_m, p.r_max_m, 240)          # логарифмическая сетка: воронка у скважины крутая
        t_frames = np.linspace(0.0, p.sim_time_sec, total_frames)
        P, P_log, r_x001 = [], [], []
        for t in t_frames:
            if t <= 0:
                P.append(np.full_like(r, p.p_init_mpa)); P_log.append(np.full_like(r, np.nan)); r_x001.append(0.0)
                continue
            xr = r ** 2 / (4 * p.kappa_m2_s * t)
            P.append(p.p_init_mpa - A * exp_integral_e1(xr))
            lg = p.p_init_mpa - A * (np.log(1.0 / xr) - 0.5772)
            lg[lg > p.p_init_mpa] = np.nan                       # дальше приближение даёт давление выше начального — не рисуем
            P_log.append(lg)
            r_x001.append(math.sqrt(0.01 * 4 * p.kappa_m2_s * t))  # радиус, внутри которого x ≤ 0,01
        p_min = p.p_init_mpa - A * float(exp_integral_e1(np.array([p.r_well_m ** 2 / (4 * p.kappa_m2_s * p.sim_time_sec)]))[0])
        x = np.linspace(-p.r_max_m, p.r_max_m, 140)
        X, Y = np.meshgrid(x, x)
        return {
            "mode": "rate",
            "r": r,
            "R_grid": np.sqrt(X ** 2 + Y ** 2),
            "P_frames": np.array(P),
            "P_log_frames": np.array(P_log),
            "r_x001": np.array(r_x001),
            "t_min": t_frames / 60.0,
            "p_init": p.p_init_mpa,
            "p_well": p_min,
            "vmin": p_min,
            "vmax": p.p_init_mpa,
            "r_max": p.r_max_m,
            "show_log": p.show_log_approx,
        }

    def draw_frame(self, fig: plt.Figure, gs: GridSpec, spec: SceneSpecification, sim_data: Dict[str, Any], frame_idx: int):
        if sim_data.get("mode") == "rate":
            return self._draw_rate(fig, gs, spec, sim_data, frame_idx)
        P_1d = sim_data["P_frames"][frame_idx]
        P_2d = np.interp(sim_data["R_grid"], sim_data["r"], P_1d, right=sim_data["p_init"])
        r_max = sim_data["r_max"]

        ax_top = fig.add_subplot(gs[0, 0])
        ax_top.set_facecolor(self.style["panel_color"])
        im = ax_top.imshow(
            P_2d, extent=[-r_max, r_max, -r_max, r_max], origin="lower",
            cmap=self.style["pressure_cmap"], vmin=sim_data["vmin"], vmax=sim_data["vmax"]
        )
        ax_top.scatter([0], [0], color="#FF5555", s=45, zorder=5)
        ax_top.set_title(f"Вид сверху: давление P, МПа (t = {sim_data['t_min'][frame_idx]:.1f} мин)", fontsize=10.5)
        ax_top.set_xlabel("X, м")
        ax_top.set_ylabel("Y, м")
        fig.colorbar(im, ax=ax_top, fraction=0.046, pad=0.04)  # единицы — в заголовке: подпись у шкалы задевает соседние оси

        ax_plot = fig.add_subplot(gs[1, 0] if gs.nrows == 2 else gs[0, 1])
        ax_plot.set_facecolor(self.style["panel_color"])
        ax_plot.plot(sim_data["r"], P_1d, color=self.style["accent_color"], lw=2.5, label="Текущее P(r, t)")
        ax_plot.axhline(sim_data["p_init"], color="#888888", ls="--", label=f"Начальное P₀ = {sim_data['p_init']} МПа")
        ax_plot.set_xlim(0, r_max)
        margin = max(0.5, (sim_data["vmax"] - sim_data["vmin"]) * 0.12)
        ax_plot.set_ylim(sim_data["vmin"] - margin, sim_data["vmax"] + margin)
        ax_plot.grid(True, ls=":", alpha=0.25, color=self.style["ink_color"])
        ax_plot.set_title("Профиль давления от скважины", fontsize=10.5)
        ax_plot.set_xlabel("Расстояние r, м")
        ax_plot.set_ylabel("Давление P, МПа")
        ax_plot.legend(loc="lower right", fontsize=8.5)

    def _draw_rate(self, fig: plt.Figure, gs: GridSpec, spec: SceneSpecification, sim_data: Dict[str, Any], frame_idx: int):
        r, r_max = sim_data["r"], sim_data["r_max"]
        P_1d = sim_data["P_frames"][frame_idx]
        t_min = sim_data["t_min"][frame_idx]
        P_2d = np.interp(sim_data["R_grid"], r, P_1d, left=P_1d[0], right=sim_data["p_init"])

        ax_top = fig.add_subplot(gs[0, 0])
        ax_top.set_facecolor(self.style["panel_color"])
        im = ax_top.imshow(P_2d, extent=[-r_max, r_max, -r_max, r_max], origin="lower",
                           cmap=self.style["pressure_cmap"], vmin=sim_data["vmin"], vmax=sim_data["vmax"])
        ax_top.scatter([0], [0], color="#FF5555", s=45, zorder=5)
        if sim_data["show_log"] and sim_data["r_x001"][frame_idx] > 0:
            ax_top.add_patch(plt.Circle((0, 0), sim_data["r_x001"][frame_idx], fill=False, ls=":", lw=1.6,
                                        color=self.style["ink_color"]))
        ax_top.set_title(f"Вид сверху: давление P, МПа, постоянный дебит (t = {t_min:.1f} мин)", fontsize=10.5)
        ax_top.set_xlabel("X, м")
        ax_top.set_ylabel("Y, м")
        fig.colorbar(im, ax=ax_top, fraction=0.046, pad=0.04)  # единицы — в заголовке: подпись у шкалы задевает соседние оси

        ax_plot = fig.add_subplot(gs[1, 0] if gs.nrows == 2 else gs[0, 1])
        ax_plot.set_facecolor(self.style["panel_color"])
        ax_plot.set_xscale("log")
        ax_plot.plot(r, P_1d, color=self.style["accent_color"], lw=2.5, label="Точно: формула (23.52) с −Ei")
        if sim_data["show_log"] and t_min > 0:
            ax_plot.plot(r, sim_data["P_log_frames"][frame_idx], color=self.style["ink_color"], lw=1.6, ls="--",
                         label="Логарифм: формула (23.53)")
            rx = sim_data["r_x001"][frame_idx]
            if r[0] < rx < r_max:
                ax_plot.axvline(rx, color=self.style["ink_color"], ls=":", lw=1.2, label="Граница x = 0,01")
        ax_plot.axhline(sim_data["p_init"], color="#888888", ls="--", lw=1.0, label=f"Начальное P₀ = {sim_data['p_init']:g} МПа")
        ax_plot.set_xlim(r[0], r_max)
        margin = max(0.05, (sim_data["vmax"] - sim_data["vmin"]) * 0.08)
        ax_plot.set_ylim(sim_data["vmin"] - margin, sim_data["vmax"] + margin)
        ax_plot.grid(True, ls=":", alpha=0.25, color=self.style["ink_color"])
        ax_plot.set_title("Профиль давления от скважины", fontsize=10.5)
        ax_plot.set_xlabel("Расстояние r, м (логарифмическая шкала)")
        ax_plot.set_ylabel("Давление P, МПа")
        ax_plot.legend(loc="lower right", fontsize=8.5)


# --- ШАБЛОН 2: СИНХРОННЫЙ КАРОТАЖНЫЙ ЗОНД И РАЗРЕЗ СКВАЖИНЫ ---
@register_template("well_log_sync")
class WellLogSyncTemplate(BaseRenderTemplate):
    def simulate(self, spec: SceneSpecification) -> Dict[str, Any]:
        p: WellLogParams = spec.scene_params  # type: ignore
        layers_sorted = sorted(p.layers, key=lambda x: x.top_m)
        z_min = layers_sorted[0].top_m
        z_max = layers_sorted[-1].bottom_m

        nz = 300
        depths = np.linspace(z_min, z_max, nz)
        gk = np.zeros(nz)
        rt = np.zeros(nz)

        for i, z in enumerate(depths):
            for lyr in layers_sorted:
                if lyr.top_m <= z <= lyr.bottom_m:
                    gk[i] = lyr.gk_value
                    rt[i] = lyr.rt_value
                    break

        win = min(9, max(1, nz // 10))
        if win > 1:
            kernel = np.ones(win) / float(win)
            # сглаживание с повтором крайних значений: без этого на границах разреза кривые ложно уходят к нулю
            pad = (win // 2, win - 1 - win // 2)
            gk = np.convolve(np.pad(gk, pad, mode="edge"), kernel, mode="valid")
            rt = np.convolve(np.pad(rt, pad, mode="edge"), kernel, mode="valid")

        total_frames = max(2, int(round(spec.total_duration_sec * spec.fps)))
        sonde_depths = np.linspace(z_max, z_min, total_frames)
        max_val = float(max(np.max(gk), np.max(rt), 1.0))

        return {
            "layers": [l.model_dump() for l in layers_sorted],
            "z_min": z_min,
            "z_max": z_max,
            "depths": depths,
            "gk": gk,
            "rt": rt,
            "sonde_depths": sonde_depths,
            "max_x": max_val * 1.15,
        }

    def draw_frame(self, fig: plt.Figure, gs: GridSpec, spec: SceneSpecification, sim_data: Dict[str, Any], frame_idx: int):
        p: WellLogParams = spec.scene_params  # type: ignore
        z_min, z_max = sim_data["z_min"], sim_data["z_max"]
        cur_z = sim_data["sonde_depths"][frame_idx]
        lith_colors = self.style["lithology"]

        ax_well = fig.add_subplot(gs[0, 0])
        ax_well.set_facecolor(self.style["panel_color"])
        for lyr in sim_data["layers"]:
            c = lith_colors.get(lyr["lithology"], "#555555")
            ax_well.add_patch(Rectangle((0, lyr["top_m"]), 1.0, lyr["bottom_m"] - lyr["top_m"], fc=c, alpha=0.85, ec="#222"))
            ax_well.text(0.06, (lyr["top_m"] + lyr["bottom_m"]) / 2, lyr["label"], va="center", fontsize=8.5, fontweight="bold")

        ax_well.add_patch(Rectangle((0.46, z_min), 0.08, z_max - z_min, fc="#111111", ec=self.style["ink_color"], lw=0.8))
        ax_well.plot([0.5, 0.5], [z_min, cur_z], color="#AAAAAA", lw=1.2)
        ax_well.scatter([0.5], [cur_z], color="#FF4444", s=90, marker="s", zorder=6)
        ax_well.set_xlim(0, 1)
        ax_well.set_ylim(z_max, z_min)  # Глубина растёт ВНИЗ (обязательно по ТЗ)
        ax_well.set_xticks([])
        ax_well.set_ylabel("Глубина H, м")
        ax_well.set_title(f"Разрез скважины (зонд: {cur_z:.1f} м)", fontsize=10.5)

        ax_log = fig.add_subplot(gs[1, 0] if gs.nrows == 2 else gs[0, 1])
        ax_log.set_facecolor(self.style["panel_color"])
        mask = sim_data["depths"] >= cur_z
        ax_log.plot(sim_data["gk"][mask], sim_data["depths"][mask], color=self.style["accent_color"], lw=2.2, label=p.gk_label)
        ax_log.plot(sim_data["rt"][mask], sim_data["depths"][mask], color=self.style["secondary_accent"], lw=2.2, label=p.rt_label)
        ax_log.axhline(cur_z, color="#FF4444", ls="--", lw=1.0)
        ax_log.set_xlim(0, sim_data["max_x"])
        ax_log.set_ylim(z_max, z_min)
        ax_log.grid(True, ls=":", alpha=0.25, color=self.style["ink_color"])
        ax_log.set_xlabel("Показания методов ГИС")
        ax_log.set_title("Каротажные кривые (синхронно)", fontsize=10.5)
        ax_log.legend(loc="lower right", fontsize=8.5)


# --- ШАБЛОН 3: ДИНАМИЧЕСКАЯ ПАЛЕТКА / КРОССПЛОТ ---
@register_template("crossplot_cutoff")
class CrossplotCutoffTemplate(BaseRenderTemplate):
    def simulate(self, spec: SceneSpecification) -> Dict[str, Any]:
        p: CrossplotParams = spec.scene_params  # type: ignore
        xs = np.array([pt.x for pt in p.points])
        ys = np.array([pt.y for pt in p.points])
        is_res = np.array([pt.is_reservoir for pt in p.points])
        return {"xs": xs, "ys": ys, "is_res": is_res, "n_points": len(xs)}

    def draw_frame(self, fig: plt.Figure, gs: GridSpec, spec: SceneSpecification, sim_data: Dict[str, Any], frame_idx: int):
        p: CrossplotParams = spec.scene_params  # type: ignore
        total_frames = max(2, int(round(spec.total_duration_sec * spec.fps)))
        progress = frame_idx / (total_frames - 1)

        ax = fig.add_subplot(gs[:, :])
        ax.set_facecolor(self.style["panel_color"])

        visible_count = max(1, int(sim_data["n_points"] * min(1.0, progress * 1.6)))
        xs = sim_data["xs"][:visible_count]
        ys = sim_data["ys"][:visible_count]
        is_res = sim_data["is_res"][:visible_count]

        if progress < 0.55:
            ax.scatter(xs, ys, color=self.style["ink_color"], alpha=0.75, s=55, label="Замеры керна / ГИС")
        else:
            ax.scatter(xs[~is_res], ys[~is_res], color="#6E7F80", alpha=0.7, s=55, label="Неколлектор")
            ax.scatter(xs[is_res], ys[is_res], color=self.style["ochre"], edgecolors="#FFF", s=75, label="Коллектор")
            if p.x_cutoff is not None:
                ax.axvline(p.x_cutoff, color="#FF5555", ls="--", lw=2.0, label=f"Порог X = {p.x_cutoff}")
            if p.y_cutoff is not None:
                ax.axhline(p.y_cutoff, color=self.style["accent_color"], ls="--", lw=2.0, label=f"Порог Y = {p.y_cutoff}")

        ax.set_xlabel(p.x_label)
        ax.set_ylabel(p.y_label)
        ax.set_title(f"Критерий выделения: {p.cutoff_rule_text}", fontsize=10.5)
        ax.grid(True, ls=":", alpha=0.25, color=self.style["ink_color"])
        ax.legend(loc="upper right", fontsize=8.5)


# --- ШАБЛОН 4: ЭВОЛЮЦИЯ РАЗРЕЗА ВО ВРЕМЕНИ (РИФЫ / ДЕЛЬТЫ + ИСТИННЫЙ МАСШТАБ) ---
@register_template("geological_evolution")
class GeologicalEvolutionTemplate(BaseRenderTemplate):
    def simulate(self, spec: SceneSpecification) -> Dict[str, Any]:
        p: GeologicalEvolutionParams = spec.scene_params  # type: ignore
        all_x = [x for st in p.stages for x in st.x_coords]
        all_y = [y for st in p.stages for y in (st.top_profile_m + st.base_profile_m)]
        return {
            "stages": [s.model_dump() for s in p.stages],
            "x_min": min(all_x), "x_max": max(all_x),
            "y_min": min(all_y), "y_max": max(all_y),
        }

    def draw_frame(self, fig: plt.Figure, gs: GridSpec, spec: SceneSpecification, sim_data: Dict[str, Any], frame_idx: int):
        p: GeologicalEvolutionParams = spec.scene_params  # type: ignore
        total_frames = max(2, int(round(spec.total_duration_sec * spec.fps)))
        progress = frame_idx / (total_frames - 1)
        stages = sim_data["stages"]

        ax = fig.add_subplot(gs[:, :])
        ax.set_facecolor(self.style["panel_color"])

        active_stages = max(1, min(len(stages), int(math.ceil(progress * len(stages) * 1.2))))
        for idx in range(active_stages):
            st = stages[idx]
            xs = np.array(st["x_coords"])
            top = np.array(st["top_profile_m"])
            base = np.array(st["base_profile_m"])
            poly_xy = np.vstack([np.column_stack([xs, base]), np.column_stack([xs[::-1], top[::-1]])])
            c = self.style["lithology"].get(st["lithology"], "#52C3BF")
            ax.add_patch(Polygon(poly_xy, closed=True, fc=c, ec="#111111", alpha=0.88, label=st["stage_name"]))

        ax.set_xlim(sim_data["x_min"], sim_data["x_max"])
        ax.set_ylim(sim_data["y_min"], sim_data["y_max"])
        ax.set_xlabel(f"Протяжённость, м (реально: {p.true_horizontal_m:.0f} м)")
        ax.set_ylabel(f"Мощность, м (реально: {p.true_vertical_m:.0f} м)")

        if p.show_true_scale_at_end and progress > 0.8:
            ax.set_aspect("equal", adjustable="datalim")
            ax.set_title(
                f"ИСТИННЫЙ МАСШТАБ 1:1 ({p.true_vertical_m:.0f} м × {p.true_horizontal_m:.0f} м)",
                color="#DDAA4C", fontsize=10.5
            )
        else:
            ax.set_title(f"Этап формирования: {stages[active_stages - 1]['stage_name']}", fontsize=10.5)

        ax.legend(loc="upper left", fontsize=8.0)


# --- ШАБЛОН 5: УНИВЕРСАЛЬНЫЙ ФОРМУЛЬНЫЙ ДВИЖОК (ДЛЯ ТЕСТОВЫХ ГЛАВ) ---
@register_template("formula_dynamic_plot")
class FormulaDynamicTemplate(BaseRenderTemplate):
    SAFE_OPS = {
        ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul,
        ast.Div: operator.truediv, ast.Pow: operator.pow, ast.USub: operator.neg,
    }
    SAFE_FUNCS = {"sqrt": np.sqrt, "exp": np.exp, "log": np.log, "sin": np.sin, "cos": np.cos, "abs": np.abs}

    def _safe_eval(self, expr: str, variables: Dict[str, Any]) -> Any:
        node = ast.parse(expr, mode="eval").body

        def _eval(n):
            if isinstance(n, ast.Constant):
                return n.value
            if isinstance(n, ast.Name):
                if n.id in variables:
                    return variables[n.id]
                raise ValueError(f"Неизвестная переменная '{n.id}' в формуле '{expr}'")
            if isinstance(n, ast.BinOp):
                return self.SAFE_OPS[type(n.op)](_eval(n.left), _eval(n.right))
            if isinstance(n, ast.UnaryOp):
                return self.SAFE_OPS[type(n.op)](_eval(n.operand))
            if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in self.SAFE_FUNCS:
                return self.SAFE_FUNCS[n.func.id](*[_eval(a) for a in n.args])
            raise ValueError(f"Недопустимая конструкция в формуле: {ast.dump(n)}")

        return _eval(node)

    def simulate(self, spec: SceneSpecification) -> Dict[str, Any]:
        p: FormulaPlotParams = spec.scene_params  # type: ignore
        x = np.linspace(p.x_min, p.x_max, 250)
        total_frames = max(2, int(round(spec.total_duration_sec * spec.fps)))
        var_vals = np.linspace(p.dynamic_var_start, p.dynamic_var_end, total_frames)

        y_frames = []
        with np.errstate(divide="ignore", invalid="ignore"):
            for val in var_vals:
                env = {**p.constants, "x": x, p.dynamic_var_name: val}
                y_res = self._safe_eval(p.formula_expr, env)
                if np.isscalar(y_res):
                    y_res = np.full_like(x, float(y_res))
                y_frames.append(np.asarray(y_res, dtype=np.float64))

        y_arr = np.array(y_frames)
        finite_vals = y_arr[np.isfinite(y_arr)]
        if finite_vals.size == 0:
            raise ValueError(f"Формула '{p.formula_expr}' не дала конечных числовых значений на интервале [{p.x_min}, {p.x_max}]")

        return {
            "x": x,
            "y_frames": y_arr,
            "var_vals": var_vals,
            "y_min": float(np.min(finite_vals)),
            "y_max": float(np.max(finite_vals)),
        }

    def draw_frame(self, fig: plt.Figure, gs: GridSpec, spec: SceneSpecification, sim_data: Dict[str, Any], frame_idx: int):
        p: FormulaPlotParams = spec.scene_params  # type: ignore
        ax = fig.add_subplot(gs[:, :])
        ax.set_facecolor(self.style["panel_color"])

        ax.plot(sim_data["x"], sim_data["y_frames"][0], color="#888888", ls="--", label="Начальное состояние")
        cur_v = sim_data["var_vals"][frame_idx]
        ax.plot(
            sim_data["x"], sim_data["y_frames"][frame_idx],
            color=self.style["accent_color"], lw=2.8,
            label=f"{p.dynamic_var_name} = {cur_v:.2f} {p.dynamic_var_unit}".strip()
        )

        span = sim_data["y_max"] - sim_data["y_min"]
        margin = max(1e-3, span * 0.12)
        ax.set_xlim(p.x_min, p.x_max)
        ax.set_ylim(sim_data["y_min"] - margin, sim_data["y_max"] + margin)
        ax.grid(True, ls=":", alpha=0.25, color=self.style["ink_color"])
        ax.set_xlabel(p.x_label)
        ax.set_ylabel(p.y_label)
        ax.set_title(p.plot_title, fontsize=11)
        ax.legend(loc="best", fontsize=9)


# =====================================================================
# 4. ГЛАВНЫЙ ИНСТРУМЕНТ ДЛЯ LLM-АГЕНТА (БЕЗ ОЗВУЧКИ, СО СБОРКОЙ MP4/WEB)
# =====================================================================

class VisualAnimationEngine:
    """
    Детерминированный генератор научной анимации и интерактивных состояний.
    Вызывается LLM-агентом после заполнения SceneSpecification.
    """

    def __init__(self, output_root: Union[str, Path] = "./build_media", styleguide: Optional[Dict[str, Any]] = None):
        self.output_root = Path(output_root)
        self.style_cfg = DomainStyleConfig(styleguide)

    @classmethod
    def get_llm_tool_schema(cls) -> Dict[str, Any]:
        """Возвращает JSON Schema для передачи в Structured Outputs / Function Calling LLM."""
        return SceneSpecification.model_json_schema()

    def build_scene(self, raw_spec: Union[Dict[str, Any], SceneSpecification]) -> Dict[str, Any]:
        spec = raw_spec if isinstance(raw_spec, SceneSpecification) else SceneSpecification.model_validate(raw_spec)
        t_type = spec.scene_params.template_type

        if t_type not in TEMPLATE_REGISTRY:
            raise ValueError(f"Шаблон '{t_type}' не найден. Доступные: {list(TEMPLATE_REGISTRY.keys())}")

        template = TEMPLATE_REGISTRY[t_type](self.style_cfg)
        sim_data = template.simulate(spec)

        node_dir = self.output_root / spec.node_id
        node_dir.mkdir(parents=True, exist_ok=True)

        timeline_sync = self._build_timeline_sync(spec)
        sync_path = node_dir / "timeline_sync.json"
        sync_path.write_text(json.dumps(timeline_sync, ensure_ascii=False, indent=2), encoding="utf-8")

        if spec.render_mode == RenderMode.WEB_STATE:
            web_payload = {
                "node_id": spec.node_id,
                "template_type": t_type,
                "frame_class": spec.frame_class.value,
                "origin_label": spec.origin_label,
                "exaggeration_note": spec.exaggeration_note,
                "assumptions": spec.assumptions,
                "state_series": template.export_lightweight_state(sim_data),
                "timeline": timeline_sync,
            }
            web_json_path = node_dir / f"{spec.node_id}_interactive.json"
            web_json_path.write_text(json.dumps(web_payload, ensure_ascii=False, indent=2), encoding="utf-8")
            passport_path = self._write_passport(node_dir, spec, video_path=None, timeline_sync=timeline_sync)
            return {
                "status": "ok",
                "mode": "web_state",
                "interactive_json": web_json_path.as_posix(),
                "timeline_sync_json": sync_path.as_posix(),
                "passport_json": passport_path.as_posix(),
            }

        # Очищаем старые кадры перед пересборкой узла
        frames_dir = node_dir / "frames"
        if frames_dir.exists():
            shutil.rmtree(frames_dir)
        frames_dir.mkdir(parents=True, exist_ok=True)

        self._render_png_sequence(spec, template, sim_data, timeline_sync, frames_dir)

        video_path = node_dir / f"{spec.node_id}_silent.mp4"
        self._encode_silent_mp4(frames_dir, spec.fps, video_path)

        passport_path = self._write_passport(node_dir, spec, video_path=video_path, timeline_sync=timeline_sync)

        return {
            "status": "ok",
            "mode": "mp4",
            "video_path": video_path.as_posix(),
            "timeline_sync_json": sync_path.as_posix(),
            "passport_json": passport_path.as_posix(),
            "total_duration_sec": spec.total_duration_sec,
        }

    def _build_timeline_sync(self, spec: SceneSpecification) -> List[Dict[str, Any]]:
        cursor = 0.0
        sync = []
        for seg in spec.timeline_segments:
            start_t = round(cursor, 3)
            end_t = round(cursor + seg.duration_sec, 3)
            sync.append({
                "segment_id": seg.segment_id,
                "claim_id": seg.claim_id,
                "page_ref": seg.page_ref,
                "start_sec": start_t,
                "end_sec": end_t,
                "duration_sec": seg.duration_sec,
                "screen_caption": seg.screen_caption,
                "narration_script": seg.narration_script,
                "is_prediction_pause": seg.is_prediction_pause,
            })
            cursor = end_t
        return sync

    def _render_png_sequence(
        self,
        spec: SceneSpecification,
        template: BaseRenderTemplate,
        sim_data: Dict[str, Any],
        timeline_sync: List[Dict[str, Any]],
        frames_dir: Path,
    ) -> None:
        total_frames = max(2, int(round(spec.total_duration_sec * spec.fps)))
        dpi = 180
        # Точные чётные размеры: 1080x1920 для 9:16 и 1920x1080 для 16:9
        if spec.video_format == VideoFormat.SHORTS:
            figsize, gs_rows, gs_cols = (1080 / dpi, 1920 / dpi), 2, 1
        else:
            figsize, gs_rows, gs_cols = (1920 / dpi, 1080 / dpi), 1, 2

        cfg = self.style_cfg.cfg
        plt.rcParams.update({
            "font.family": cfg["font_family"],
            "text.color": cfg["ink_color"],
            "axes.labelcolor": cfg["ink_color"],
            "axes.edgecolor": cfg.get("muted_color", cfg["ink_color"]),
            "xtick.color": cfg["ink_color"],
            "ytick.color": cfg["ink_color"],
            "font.size": 11,
            # легенда на тёмной панели: светлый текст на тёмном фоне (белая подложка по умолчанию делала текст нечитаемым)
            "legend.facecolor": cfg["panel_color"],
            "legend.edgecolor": cfg.get("muted_color", cfg["ink_color"]),
            "legend.labelcolor": cfg["ink_color"],
        })
        # Стайлгайд организаторов: подпись не мельче 44 px на кадре со стороной 1080 (при dpi 180 — 17,6 pt);
        # у вертикального ролика безопасная зона — без верхних 220 px и нижних 380 px, по бокам 70 px.
        cap_pt = max(18.0, cfg.get("min_caption_px_at_1080", 44) * 72 / dpi)
        plaque_pt = 12.0
        if spec.video_format == VideoFormat.SHORTS:
            sz = cfg.get("safe_zone", {"top": 220, "bottom": 380, "side": 70})
            top_y, cap_y, side = 1 - sz["top"] / 1920, sz["bottom"] / 1920, sz["side"] / 1080
            gs_box = dict(left=side + 0.10, right=1 - side, top=top_y - 0.085, bottom=cap_y + 0.10)
        else:
            top_y, cap_y, side = 0.965, 0.035, 0.035
            gs_box = dict(left=0.09, right=0.95, top=0.83, bottom=0.19)
        prov_color = cfg.get("provenance", {}).get(spec.origin_label, cfg["accent_color"])

        for i in range(total_frames):
            t_sec = i / spec.fps
            fig = plt.figure(figsize=figsize, dpi=dpi, facecolor=cfg["bg_color"])
            gs = GridSpec(gs_rows, gs_cols, figure=fig, hspace=0.30, wspace=0.25, **gs_box)

            template.draw_frame(fig, gs, spec, sim_data, i)

            # метка происхождения кадра (цвет — по стайлгайду) и плашка масштаба
            prov_text = f"ИСТОЧНИК: {spec.origin_label.upper()} · КЛАСС {spec.frame_class.value}"
            scale_text = "ИСТИННЫЙ МАСШТАБ" if spec.is_true_scale else spec.exaggeration_note
            if spec.video_format == VideoFormat.SHORTS:
                prov_xy, prov_ha, scale_xy = (side, top_y), "left", (side, top_y - 0.032)
            else:
                prov_xy, prov_ha, scale_xy = (1 - side, top_y), "right", (side, top_y)
            fig.text(*prov_xy, prov_text, ha=prov_ha, va="top", fontsize=plaque_pt, fontweight="bold",
                     bbox=dict(boxstyle="round,pad=0.35", facecolor=cfg["panel_color"], edgecolor=prov_color, lw=1.6))
            fig.text(*scale_xy, scale_text, ha="left", va="top", fontsize=plaque_pt - 1, color=cfg["ochre"], wrap=True,
                     bbox=dict(boxstyle="round,pad=0.35", facecolor="#3A2E16", edgecolor=cfg["ochre"], lw=1.0))

            active_seg = next((s for s in timeline_sync if s["start_sec"] <= t_sec < s["end_sec"]), timeline_sync[-1])
            fig.text(
                0.5, cap_y, active_seg["screen_caption"],
                ha="center", va="bottom", fontsize=cap_pt, fontweight="bold", wrap=True,
                bbox=dict(boxstyle="round,pad=0.45", facecolor="#000000", alpha=0.78, edgecolor="none")
            )

            frame_file = frames_dir / f"frame_{i:05d}.png"
            fig.savefig(frame_file, facecolor=cfg["bg_color"])
            plt.close(fig)

    @staticmethod
    def _encode_silent_mp4(frames_dir: Path, fps: int, output_mp4: Path) -> None:
        """Собирает чистый видеопоток H.264 без аудио с гарантированно чётным разрешением."""
        cmd = [
            os.environ.get("FFMPEG_PATH", "ffmpeg"), "-y",  # путь к ffmpeg задаётся в .env (FFMPEG_PATH)
            "-framerate", str(fps),
            "-i", (frames_dir / "frame_%05d.png").resolve().as_posix(),
            "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2",
            "-map", "0:v:0",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-crf", "20",
            "-movflags", "+faststart",
            output_mp4.resolve().as_posix(),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        if res.returncode != 0 or not output_mp4.exists() or output_mp4.stat().st_size == 0:
            raise RuntimeError(f"Ошибка сборки видео FFmpeg (код {res.returncode}):\n{res.stderr[-1200:]}")

    @staticmethod
    def _write_passport(
        node_dir: Path, spec: SceneSpecification, video_path: Optional[Path], timeline_sync: List[Dict[str, Any]]
    ) -> Path:
        passport = {
            "node_id": spec.node_id,
            "render_mode": spec.render_mode.value,
            "video_file": video_path.as_posix() if video_path else None,
            "format": spec.video_format.value,
            "duration_sec": spec.total_duration_sec,
            "frame_classes": [
                {"range": f"0.0-{spec.total_duration_sec}s", "class": spec.frame_class.value, "origin": spec.origin_label}
            ],
            "exaggerations": [] if spec.is_true_scale else [spec.exaggeration_note],
            "assumptions": spec.assumptions,
            "sources_table": [
                {
                    "segment_id": s["segment_id"],
                    "claim_id": s["claim_id"],
                    "page": s["page_ref"],
                    "time_range": f"{s['start_sec']}-{s['end_sec']}s",
                    "text": s["narration_script"],
                }
                for s in timeline_sync
            ],
            "pedagogy": {
                "hook_question": spec.hook_question,
                "prediction_question": spec.prediction_question,
                "transfer_question": spec.transfer_question,
                "data_bridge": spec.data_bridge_text,
            },
            "scene_specification": spec.model_dump(),
        }
        passport_path = node_dir / f"{spec.node_id}_passport.json"
        passport_path.write_text(json.dumps(passport, ensure_ascii=False, indent=2), encoding="utf-8")
        return passport_path


# =====================================================================
# ТЕСТ ЗАПУСКА (ПРОВЕРКА РАБОТОСПОСОБНОСТИ)
# =====================================================================
if __name__ == "__main__":
    engine = VisualAnimationEngine(output_root="./build_media")

    latyshova_spec = {
        "node_id": "latyshova.v20.well_log.01",
        "render_mode": "mp4",
        "video_format": "16:9",
        "fps": 24,
        "frame_class": "B",
        "origin_label": "симуляция",
        "is_true_scale": False,
        "exaggeration_note": "Не в масштабе: диаметр скважины увеличен в 40 раз",
        "assumptions": ["Пласты горизонтальные", "Влияние глинистой корки не учтено"],
        "scene_params": {
            "template_type": "well_log_sync",
            "layers": [
                {"top_m": 2000, "bottom_m": 2010, "lithology": "clay", "label": "Глина (покрышка)", "gk_value": 14.5, "rt_value": 4.0},
                {"top_m": 2010, "bottom_m": 2022, "lithology": "sand_oil", "label": "Песчаник (нефть)", "gk_value": 3.2, "rt_value": 42.0},
                {"top_m": 2022, "bottom_m": 2032, "lithology": "sand_water", "label": "Песчаник (вода)", "gk_value": 3.5, "rt_value": 2.2},
                {"top_m": 2032, "bottom_m": 2040, "lithology": "clay", "label": "Глина", "gk_value": 15.0, "rt_value": 3.5}
            ]
        },
        "hook_question": "Как отличить нефтяной пласт от водоносного на глубине двух километров?",
        "prediction_question": "Что покажет кривая сопротивления, когда зонд перейдёт из воды в нефть?",
        "transfer_question": "Почему высокого сопротивления недостаточно без кривой гамма-каротажа?",
        "data_bridge_text": "Алгоритм интерпретации ГИС сравнивает синхронные кривые ГК и УЭС по глубине и выделяет интервалы коллектора.",
        "timeline_segments": [
            {
                "segment_id": "seg_01",
                "claim_id": "lat.v20.c1",
                "page_ref": 95,
                "duration_sec": 3.5,
                "screen_caption": "Зонд поднимается по стволу скважины",
                "narration_script": "Каротажный прибор поднимается снизу вверх и непрерывно записывает свойства пород."
            },
            {
                "segment_id": "seg_02",
                "claim_id": "lat.v20.c2",
                "page_ref": 98,
                "duration_sec": 4.0,
                "screen_caption": "Низкий ГК и высокое сопротивление — нефть",
                "narration_script": "В нефтенасыщенном песчанике радиоактивность падает, а электрическое сопротивление резко растёт.",
                "is_prediction_pause": True
            }
        ]
    }

    res = engine.build_scene(latyshova_spec)
    print(json.dumps(res, ensure_ascii=False, indent=2))