from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from app.db import get_db
from app.models import ElectricalLine, Enterprise, LoadSnapshot, Meter, Site, Substation, Transformer
from app.services.topology import WINDOW_MINUTES, recompute_topology_load

router = APIRouter(prefix="/topology", tags=["topology"])

@router.post("/recompute")
def recompute(db: Session = Depends(get_db)):
    """Перерахувати навантаження по топології та згенерувати alerts."""
    r = recompute_topology_load(db)
    return {"snapshots_written": r.snapshots_written, "alerts_created": r.alerts_created}


@router.get("/overview")
def overview(db: Session = Depends(get_db)):
    """Дерево ПС → трансформатори → лінії → об'єкти/лічильники для Topology View."""
    snaps = {(s.node_type, s.node_id): s for s in db.query(LoadSnapshot).all()}

    def snap(typ: str, nid: int) -> dict:
        row = snaps.get((typ, nid))
        if row:
            return {"load_kw": round(row.load_kw, 2), "status": row.node_status}
        return {"load_kw": 0.0, "status": "offline"}

    enterprise_by_id = {e.id: e.name for e in db.query(Enterprise).all()}
    substations = db.query(Substation).options(joinedload(Substation.enterprise)).all()
    result = []
    for sub in substations:
        transformers = db.query(Transformer).filter(Transformer.substation_id == sub.id).all()
        tr_json = []
        for tr in transformers:
            lines_q = db.query(ElectricalLine).filter(ElectricalLine.transformer_id == tr.id).all()
            lines_json = []
            for line in lines_q:
                sites_on_line = db.query(Site).filter(Site.line_id == line.id).all()
                sites_json = []
                for site in sites_on_line:
                    ent_name = enterprise_by_id.get(site.enterprise_id, "")
                    meters = db.query(Meter).filter(Meter.site_id == site.id).all()
                    sites_json.append(
                        {
                            "id": site.id,
                            "name": site.name,
                            "enterprise_id": site.enterprise_id,
                            "enterprise_name": ent_name,
                            **snap("site", site.id),
                            "meters": [
                                {
                                    "id": m.id,
                                    "serial_number": m.serial_number,
                                    "zone_name": m.zone_name,
                                    "meter_role": m.meter_role,
                                    "is_main_meter": m.is_main_meter,
                                    **snap("meter", m.id),
                                }
                                for m in meters
                            ],
                        }
                    )
                lines_json.append(
                    {
                        "id": line.id,
                        "code": line.code,
                        "name": line.name,
                        "threshold_warning_kw": line.threshold_warning_kw,
                        "threshold_critical_kw": line.threshold_critical_kw,
                        **snap("line", line.id),
                        "sites": sites_json,
                    }
                )
            tr_json.append({"id": tr.id, "code": tr.code, "name": tr.name, **snap("transformer", tr.id), "lines": lines_json})

        ent_label = ""
        if sub.enterprise_id is not None:
            ent_label = enterprise_by_id.get(sub.enterprise_id, "")
        result.append(
            {
                "id": sub.id,
                "code": sub.code,
                "name": sub.name,
                "enterprise_id": sub.enterprise_id,
                "enterprise_name": ent_label,
                "rated_capacity_kw": sub.rated_capacity_kw,
                "threshold_warning_kw": sub.threshold_warning_kw,
                "threshold_critical_kw": sub.threshold_critical_kw,
                **snap("substation", sub.id),
                "transformers": tr_json,
            }
        )

    return {"substations": result, "window_minutes": WINDOW_MINUTES}
