#!/usr/bin/env python3
"""
Демо-топологія (один модуль для усіх середовищ): Docker Compose (compose-seed),
Kubernetes Job deploy/k8s/demo-seed-job.yaml, Swarm: infra/local/swarm/demo-seed.sh.

Керування:
  COMPOSE_TOPOLOGY_RESET=1 або DEMO_SEED_RESET=1 — повний TRUNCATE + сид.
  Інакше пропуск, якщо вже є ПС KPP-PS-110.

Не чіпає alembic_version.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# У контейнері для `python scripts/…` див. PYTHONPATH у docker-compose; локально — додаємо корінь бекенду.
_backend_root = Path(__file__).resolve().parents[1]
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from sqlalchemy import text

from app.db import SessionLocal
from app.models import (
    AlertRule,
    City,
    ElectricalLine,
    Enterprise,
    Meter,
    MeterStatus,
    Site,
    Substation,
    Transformer,
)


def _wipe(session) -> None:
    session.execute(
        text(
            """
            TRUNCATE TABLE
              load_snapshots,
              alerts,
              alert_rules,
              validated_readings,
              raw_readings,
              daily_aggregations,
              monthly_aggregations,
              meters,
              sites,
              electrical_lines,
              transformers,
              substations,
              enterprises,
              cities,
              users
            RESTART IDENTITY CASCADE
            """
        )
    )


def _install_site_meters(
    session,
    *,
    site: Site,
    line: ElectricalLine,
    prefix: str,
    main_zone_name: str,
    subzones: list[tuple[str, str, str]],
) -> int:
    """Головний лічильник обліку + підлічильники зон. subzones: (суфікс, zone_name, meter_role)."""
    session.add(
        Meter(
            site_id=site.id,
            line_id=line.id,
            serial_number=f"{line.code}-{prefix}-MAIN",
            zone_name=main_zone_name,
            meter_role="головний",
            is_main_meter=True,
            meter_type="electricity",
            status=MeterStatus.active,
        )
    )
    n = 1
    for suf, zn, role in subzones:
        session.add(
            Meter(
                site_id=site.id,
                line_id=line.id,
                serial_number=f"{line.code}-{prefix}-{suf}",
                zone_name=zn,
                meter_role=role,
                is_main_meter=False,
                meter_type="electricity",
                status=MeterStatus.active,
            )
        )
        n += 1
    return n


def _seed_alert_rules(session) -> int:
    """Порогові правила на об'єкт (споживання за кВт·год у вікні; увімкнуться після накопичення показів)."""
    targets: list[tuple[str, float, str, int]] = [
        ("Цех пресування та грануляції", 7500.0, "high", 14),
        ("Склад гранули та добавок", 3200.0, "medium", 30),
        ("Екструзійний цех №2", 8800.0, "high", 14),
        ("Лабораторія та адміністрація", 2200.0, "medium", 30),
        ("Прокатний цех №1", 11500.0, "critical", 7),
        ("Склад сортового прокату", 4000.0, "medium", 30),
        ("Термоплощадка та адміністрація", 3500.0, "medium", 21),
    ]
    by_name = {s.name: s for s in session.query(Site).all()}
    n = 0
    for name, thr, sev, wdays in targets:
        site = by_name.get(name)
        if not site:
            continue
        session.add(
            AlertRule(
                site_id=site.id,
                meter_id=None,
                rule_type="threshold",
                threshold_kwh=thr,
                severity=sev,
                window_days=wdays,
                enabled=True,
            )
        )
        n += 1
    return n


def _seed(session) -> tuple[int, int]:
    # --- Міста
    lviv = City(name="Львів", region="Львівська область")
    dnipro = City(name="Дніпро", region="Дніпропетровська область")
    session.add_all([lviv, dnipro])
    session.flush()

    # --- Підприємства
    ent_poly = Enterprise(
        name="ТОВ «Карпатіон-Полімер»",
        city_id=lviv.id,
    )
    ent_steel = Enterprise(
        name="ПрАТ «Придніпровський металопрокат»",
        city_id=dnipro.id,
    )
    session.add_all([ent_poly, ent_steel])
    session.flush()

    # --- ПС 1: полімери (Львів, 2 Тр, 4 фідери 0,4 кВ)
    sub_kpp = Substation(
        enterprise_id=ent_poly.id,
        code="KPP-PS-110",
        name='ПС 110/10 кВ «Промзона Північ»',
        voltage_in_kv=110.0,
        voltage_out_kv=10.0,
        rated_capacity_kw=18000.0,
        threshold_warning_kw=12000.0,
        threshold_critical_kw=15000.0,
    )
    session.add(sub_kpp)
    session.flush()

    tr_kpp_a = Transformer(
        substation_id=sub_kpp.id,
        code="KPP-TR-A",
        name="Трансформатор 10/0,4 кВ, 2500 кВА (цех + склад)",
        rated_power_kva=2500.0,
        voltage_in_kv=10.0,
        voltage_out_kv=0.4,
        status="active",
    )
    tr_kpp_b = Transformer(
        substation_id=sub_kpp.id,
        code="KPP-TR-B",
        name="Трансформатор 10/0,4 кВ, 1600 кВА (екструзія + допоміжні)",
        rated_power_kva=1600.0,
        voltage_in_kv=10.0,
        voltage_out_kv=0.4,
        status="active",
    )
    session.add_all([tr_kpp_a, tr_kpp_b])
    session.flush()

    kpp_lines_spec = [
        (tr_kpp_a, "KPP-L-01", "Фідер 0,4 кВ — цех пресування та грануляції", 800.0, 1050.0),
        (tr_kpp_a, "KPP-L-02", "Фідер 0,4 кВ — склад сировини (ПЕ, ПП)", 420.0, 600.0),
        (tr_kpp_b, "KPP-L-03", "Фідер 0,4 кВ — екструзійний цех №2", 920.0, 1200.0),
        (tr_kpp_b, "KPP-L-04", "Фідер 0,4 кВ — лабораторія, офіс, їдальня", 260.0, 400.0),
    ]
    kpp_lines: list[ElectricalLine] = []
    for tr, code, title, w, c in kpp_lines_spec:
        ln = ElectricalLine(
            transformer_id=tr.id,
            code=code,
            name=title,
            voltage_kv=0.4,
            status="active",
            threshold_warning_kw=w,
            threshold_critical_kw=c,
        )
        session.add(ln)
        kpp_lines.append(ln)
    session.flush()

    meter_total = 0

    # Назви зон українською; симулятор — services/simulator/generator.py (ключові підрядки в назві/ролі).
    kpp_sites_spec: list[
        tuple[ElectricalLine, str, str, str, str, list[tuple[str, str, str]]]
    ] = [
        (
            kpp_lines[0],
            "Цех пресування та грануляції",
            "Винники, вул. Промислова, 12",
            "ЦП",
            "Головний облік цеху пресування",
            [
                ("П-1", "Зона гідропресів і преформ", "зона_навантаження"),
                ("Г-1", "Лінія грануляції й подачі сировини", "зона_навантаження"),
                ("П-2", "Допоміжні приводи та конвеєри", "зона_навантаження"),
                ("С-1", "Освітлення виробничого простору", "освітлення"),
                ("В-1", "Вентиляція, аспірація, витяжка", "вентиляція"),
            ],
        ),
        (
            kpp_lines[1],
            "Склад гранули та добавок",
            "Ангар С, територія заводу",
            "СИР",
            "Головний облік складу сировини",
            [
                ("П-1", "Приймальні рампи та стрічкові транспортери", "зона_навантаження"),
                ("С-1", "Силоси ПЕ/ПП та ваговий контроль", "зона_навантаження"),
                ("О-1", "Зовнішнє освітлення території складу", "освітлення"),
                ("К-1", "Кліматизація складських камер", "вентиляція"),
            ],
        ),
        (
            kpp_lines[2],
            "Екструзійний цех №2",
            "Корпус Е",
            "ЕКС",
            "Головний облік екструзійної лінії",
            [
                ("Е-1", "Шнекові екструдери та головні двигуни", "зона_навантаження"),
                ("Е-2", "Калібратори, ванни охолодження, ролики протягу", "зона_навантаження"),
                ("Е-3", "Дробарка відходів і повторна грануляція", "зона_навантаження"),
                ("С-1", "Освітлення високого залу", "освітлення"),
                ("Т-1", "Нагрівальні зони циліндра та кондиціювання цеху", "вентиляція"),
            ],
        ),
        (
            kpp_lines[3],
            "Лабораторія та адміністрація",
            "КПП, адмінблок",
            "АДМ",
            "Головний облік адміністративного блоку",
            [
                ("Л-1", "Випробувальне та вимірювальне обладнання лабораторії", "зона_навантаження"),
                ("О-1", "Офісні приміщення та переговорні", "освітлення"),
                ("О-2", "Серверна та слаботочні мережі", "освітлення"),
                ("К-1", "Кухня їдальні та клімат у громадських зонах", "вентиляція"),
            ],
        ),
    ]
    for ln, sname, loc, prefix, main_zn, subs in kpp_sites_spec:
        site = Site(enterprise_id=ent_poly.id, line_id=ln.id, name=sname, location=loc)
        session.add(site)
        session.flush()
        meter_total += _install_site_meters(
            session, site=site, line=ln, prefix=prefix, main_zone_name=main_zn, subzones=subs
        )

    # --- ПС 2: метал (Дніпро)
    sub_svz = Substation(
        enterprise_id=ent_steel.id,
        code="SVZ-PS-110",
        name='ПС 110/10 кВ «Металопрокат — Західний вузол»',
        voltage_in_kv=110.0,
        voltage_out_kv=10.0,
        rated_capacity_kw=24000.0,
        threshold_warning_kw=16000.0,
        threshold_critical_kw=20000.0,
    )
    session.add(sub_svz)
    session.flush()

    tr_svz_1 = Transformer(
        substation_id=sub_svz.id,
        code="SVZ-TR-1",
        name="Силовий трансформатор 10/0,4 кВ, 4000 кВА (прокат + склад)",
        rated_power_kva=4000.0,
        voltage_in_kv=10.0,
        voltage_out_kv=0.4,
        status="active",
    )
    tr_svz_2 = Transformer(
        substation_id=sub_svz.id,
        code="SVZ-TR-2",
        name="Трансформатор 10/0,4 кВ, 2500 кВА (енергоблок, КИП)",
        rated_power_kva=2500.0,
        voltage_in_kv=10.0,
        voltage_out_kv=0.4,
        status="active",
    )
    session.add_all([tr_svz_1, tr_svz_2])
    session.flush()

    svz_lines_spec = [
        (tr_svz_1, "SVZ-L-01", "0,4 кВ — лінія прокатного стану", 2800.0, 3400.0),
        (tr_svz_1, "SVZ-L-02", "0,4 кВ — склад заготівлі та відвантаження", 650.0, 950.0),
        (tr_svz_2, "SVZ-L-03", "0,4 кВ — компресорна, освітлення цеху ТПП, офіс", 480.0, 720.0),
    ]
    svz_lines: list[ElectricalLine] = []
    for tr, code, title, w, c in svz_lines_spec:
        ln = ElectricalLine(
            transformer_id=tr.id,
            code=code,
            name=title,
            voltage_kv=0.4,
            status="active",
            threshold_warning_kw=w,
            threshold_critical_kw=c,
        )
        session.add(ln)
        svz_lines.append(ln)
    session.flush()

    svz_sites_spec: list[
        tuple[ElectricalLine, str, str, str, str, list[tuple[str, str, str]]]
    ] = [
        (
            svz_lines[0],
            "Прокатний цех №1",
            "вул. Металургів, 7",
            "ПРК",
            "Головний облік прокатного цеху",
            [
                ("М-1", "Чистова й проміжна кліть, приводи валків", "зона_навантаження"),
                ("М-2", "Рольганги, змотувачі, лінія упаковки", "зона_навантаження"),
                ("К-1", "Мостові крани й електроприводи пересувних міст та тельферів", "зона_навантаження"),
                ("Д-1", "Витяжка й очищення диму та пилу", "вентиляція"),
                ("З-1", "Ремонтно-зварювальна зона та малогабаритні преси", "зона_навантаження"),
            ],
        ),
        (
            svz_lines[1],
            "Склад сортового прокату",
            "Проммайданчик А",
            "СКЛ",
            "Головний облік складу металопрокату",
            [
                ("В-1", "Магнітні крани та вантажні платформи", "зона_навантаження"),
                ("Р-1", "Рельсові тяговачі та стаціонарні лебідки", "зона_навантаження"),
                ("О-1", "Освітлення навісу та перону відвантаження", "освітлення"),
            ],
        ),
        (
            svz_lines[2],
            "Термоплощадка та адміністрація",
            "Корпус ГПП",
            "ГПП",
            "Головний облік допоміжного комплексу",
            [
                ("К-1", "Компресорна та насосна станція", "зона_навантаження"),
                ("О-1", "Адміністративні офіси", "освітлення"),
                ("Ї-1", "Їдальня, кліматопостачання гарячого цеху", "вентиляція"),
                ("Н-1", "Кільцеві насоси системи технічного водопостачання", "зона_навантаження"),
            ],
        ),
    ]
    for ln, sname, loc, prefix, main_zn, subs in svz_sites_spec:
        site = Site(enterprise_id=ent_steel.id, line_id=ln.id, name=sname, location=loc)
        session.add(site)
        session.flush()
        meter_total += _install_site_meters(
            session, site=site, line=ln, prefix=prefix, main_zone_name=main_zn, subzones=subs
        )

    n_rules = _seed_alert_rules(session)
    return meter_total, n_rules


def main() -> int:
    """Заливаємо демо, якщо: COMPOSE_TOPOLOGY_RESET=1 / DEMO_SEED_RESET=1, або немає ПС KPP-PS-110."""
    force = os.environ.get("COMPOSE_TOPOLOGY_RESET", "").strip() == "1" or os.environ.get(
        "DEMO_SEED_RESET", ""
    ).strip() == "1"
    with SessionLocal() as session:
        has_our_topology = (
            session.query(Substation).filter(Substation.code == "KPP-PS-110").first() is not None
        )
        if not force and has_our_topology:
            print(
                "compose-seed: демо вже залите (є ПС KPP-PS-110) — пропуск. "
                "Повний скид: COMPOSE_TOPOLOGY_RESET=1 або DEMO_SEED_RESET=1.",
                flush=True,
            )
            return 0
        print("compose-seed: очищення таблиць і заливка топології…", flush=True)
        _wipe(session)
        n_meters, n_rules = _seed(session)
        session.commit()
    print(
        f"compose-seed: готово — 2 підприємства, 2 ПС, 7 ліній, 7 об'єктів, {n_meters} лічильників, "
        f"{n_rules} правил сповіщень (поріг споживання за кВт·год у вікні).",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
