from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import ElectricalLine, Enterprise, Meter, Site, Substation, Transformer, City
from app.schemas import EnterpriseCreate, EnterpriseOut, MeterCreate, MeterOut, SiteCreate, SiteOut

router = APIRouter(prefix="", tags=["registry"])


def _line_belongs_to_enterprise(db: Session, line_id: int, enterprise_id: int) -> bool:
    row = (
        db.query(ElectricalLine.id)
        .join(Transformer, ElectricalLine.transformer_id == Transformer.id)
        .join(Substation, Transformer.substation_id == Substation.id)
        .filter(ElectricalLine.id == line_id, Substation.enterprise_id == enterprise_id)
        .first()
    )
    return row is not None


@router.get("/sites", response_model=list[SiteOut])
def get_sites(db: Session = Depends(get_db)):
    return db.query(Site).all()


@router.get("/enterprises", response_model=list[EnterpriseOut])
def get_enterprises(city_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Enterprise)
    if city_id is not None:
        query = query.filter(Enterprise.city_id == city_id)
    return query.all()


@router.post("/enterprises", response_model=EnterpriseOut)
def create_enterprise(payload: EnterpriseCreate, db: Session = Depends(get_db)):
    if payload.city_id is not None:
        city = db.query(City).filter(City.id == payload.city_id).first()
        if not city:
            raise HTTPException(status_code=404, detail="місто не знайдено")
    # Keep serial sequence in sync after seed inserts with explicit IDs.
    db.execute(text("SELECT setval('enterprises_id_seq', COALESCE((SELECT MAX(id) FROM enterprises), 1), true)"))
    enterprise = Enterprise(**payload.model_dump())
    db.add(enterprise)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="підприємство з такою назвою вже існує")
    db.refresh(enterprise)
    return enterprise


@router.put("/enterprises/{enterprise_id}", response_model=EnterpriseOut)
def update_enterprise(enterprise_id: int, payload: EnterpriseCreate, db: Session = Depends(get_db)):
    enterprise = db.query(Enterprise).filter(Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="підприємство не знайдено")
    if payload.city_id is not None:
        city = db.query(City).filter(City.id == payload.city_id).first()
        if not city:
            raise HTTPException(status_code=404, detail="місто не знайдено")
    enterprise.name = payload.name
    enterprise.city_id = payload.city_id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="підприємство з такою назвою вже існує")
    db.refresh(enterprise)
    return enterprise


@router.delete("/enterprises/{enterprise_id}")
def delete_enterprise(enterprise_id: int, db: Session = Depends(get_db)):
    enterprise = db.query(Enterprise).filter(Enterprise.id == enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="підприємство не знайдено")
    db.delete(enterprise)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="неможливо видалити підприємство: є пов'язані об'єкти або елементи мережі")
    return {"deleted": True}


@router.post("/sites", response_model=SiteOut)
def create_site(payload: SiteCreate, db: Session = Depends(get_db)):
    enterprise = db.query(Enterprise).filter(Enterprise.id == payload.enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="підприємство не знайдено")
    if payload.line_id is not None and not _line_belongs_to_enterprise(db, payload.line_id, payload.enterprise_id):
        raise HTTPException(status_code=400, detail="лінія не належить обраному підприємству")
    site = Site(**payload.model_dump())
    db.add(site)
    db.commit()
    db.refresh(site)
    return site


@router.put("/sites/{site_id}", response_model=SiteOut)
def update_site(site_id: int, payload: SiteCreate, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="об'єкт не знайдено")
    enterprise = db.query(Enterprise).filter(Enterprise.id == payload.enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="підприємство не знайдено")
    if payload.line_id is not None and not _line_belongs_to_enterprise(db, payload.line_id, payload.enterprise_id):
        raise HTTPException(status_code=400, detail="лінія не належить обраному підприємству")
    site.enterprise_id = payload.enterprise_id
    site.name = payload.name
    site.location = payload.location
    site.line_id = payload.line_id
    db.commit()
    db.refresh(site)
    return site


@router.delete("/sites/{site_id}")
def delete_site(site_id: int, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="об'єкт не знайдено")
    db.delete(site)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="неможливо видалити об'єкт: є пов'язані лічильники або дані")
    return {"deleted": True}


@router.get("/meters", response_model=list[MeterOut])
def get_meters(db: Session = Depends(get_db)):
    return db.query(Meter).all()


@router.post("/meters", response_model=MeterOut)
def create_meter(payload: MeterCreate, db: Session = Depends(get_db)):
    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="об'єкт не знайдено")
    if not _line_belongs_to_enterprise(db, payload.line_id, site.enterprise_id):
        raise HTTPException(status_code=400, detail="лінія не належить підприємству об'єкта")
    if site.line_id is not None and site.line_id != payload.line_id:
        raise HTTPException(status_code=400, detail="line_id лічильника має збігатися з лінією об'єкта")
    meter = Meter(**payload.model_dump())
    meter.is_main_meter = False
    db.add(meter)
    db.commit()
    db.refresh(meter)
    return meter


@router.put("/meters/{meter_id}", response_model=MeterOut)
def update_meter(meter_id: int, payload: MeterCreate, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="лічильник не знайдено")
    site = db.query(Site).filter(Site.id == payload.site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="об'єкт не знайдено")
    if not _line_belongs_to_enterprise(db, payload.line_id, site.enterprise_id):
        raise HTTPException(status_code=400, detail="лінія не належить підприємству об'єкта")
    if site.line_id is not None and site.line_id != payload.line_id:
        raise HTTPException(status_code=400, detail="line_id лічильника має збігатися з лінією об'єкта")
    meter.site_id = payload.site_id
    meter.line_id = payload.line_id
    meter.zone_name = payload.zone_name
    meter.meter_role = payload.meter_role
    meter.is_main_meter = False
    meter.serial_number = payload.serial_number
    meter.meter_type = payload.meter_type
    meter.status = payload.status
    meter.last_seen_at = payload.last_seen_at
    db.commit()
    db.refresh(meter)
    return meter


@router.delete("/meters/{meter_id}")
def delete_meter(meter_id: int, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="лічильник не знайдено")
    db.delete(meter)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="неможливо видалити лічильник: є пов'язані покази або дані")
    return {"deleted": True}


@router.get("/meters/{meter_id}", response_model=MeterOut)
def get_meter(meter_id: int, db: Session = Depends(get_db)):
    meter = db.query(Meter).filter(Meter.id == meter_id).first()
    if not meter:
        raise HTTPException(status_code=404, detail="лічильник не знайдено")
    return meter
