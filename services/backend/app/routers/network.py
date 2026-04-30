from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import City, ElectricalLine, Enterprise, Substation, Transformer
from app.schemas import (
    CityCreate,
    CityOut,
    ElectricalLineCreate,
    ElectricalLineOut,
    LineThresholdsUpdate,
    SubstationCreate,
    SubstationOut,
    SubstationThresholdsUpdate,
    TransformerCreate,
    TransformerOut,
)

router = APIRouter(prefix="/network", tags=["network"])


@router.get("/cities", response_model=list[CityOut])
def get_cities(db: Session = Depends(get_db)):
    return db.query(City).order_by(City.name.asc()).all()


@router.post("/cities", response_model=CityOut)
def create_city(payload: CityCreate, db: Session = Depends(get_db)):
    city = City(**payload.model_dump())
    db.add(city)
    db.commit()
    db.refresh(city)
    return city


@router.get("/substations", response_model=list[SubstationOut])
def get_substations(enterprise_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Substation)
    if enterprise_id:
        query = query.filter(Substation.enterprise_id == enterprise_id)
    return query.order_by(Substation.id.desc()).all()


@router.post("/substations", response_model=SubstationOut)
def create_substation(payload: SubstationCreate, db: Session = Depends(get_db)):
    enterprise = db.query(Enterprise).filter(Enterprise.id == payload.enterprise_id).first()
    if not enterprise:
        raise HTTPException(status_code=404, detail="підприємство не знайдено")
    row = Substation(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/transformers", response_model=list[TransformerOut])
def get_transformers(substation_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Transformer)
    if substation_id:
        query = query.filter(Transformer.substation_id == substation_id)
    return query.order_by(Transformer.id.desc()).all()


@router.post("/transformers", response_model=TransformerOut)
def create_transformer(payload: TransformerCreate, db: Session = Depends(get_db)):
    substation = db.query(Substation).filter(Substation.id == payload.substation_id).first()
    if not substation:
        raise HTTPException(status_code=404, detail="підстанцію не знайдено")
    row = Transformer(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get("/lines", response_model=list[ElectricalLineOut])
def get_lines(
    transformer_id: int | None = None,
    enterprise_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(ElectricalLine)
    if enterprise_id is not None:
        query = (
            query.join(Transformer, ElectricalLine.transformer_id == Transformer.id)
            .join(Substation, Transformer.substation_id == Substation.id)
            .filter(Substation.enterprise_id == enterprise_id)
        )
    if transformer_id is not None:
        query = query.filter(ElectricalLine.transformer_id == transformer_id)
    return query.order_by(ElectricalLine.id.desc()).all()


@router.post("/lines", response_model=ElectricalLineOut)
def create_line(payload: ElectricalLineCreate, db: Session = Depends(get_db)):
    transformer = db.query(Transformer).filter(Transformer.id == payload.transformer_id).first()
    if not transformer:
        raise HTTPException(status_code=404, detail="трансформатор не знайдено")
    row = ElectricalLine(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.patch("/substations/{substation_id}/thresholds", response_model=SubstationOut)
def patch_substation_thresholds(
    substation_id: int,
    payload: SubstationThresholdsUpdate,
    db: Session = Depends(get_db),
):
    sub = db.query(Substation).filter(Substation.id == substation_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="підстанцію не знайдено")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(sub, k, v)
    db.commit()
    db.refresh(sub)
    return sub


@router.patch("/lines/{line_id}/thresholds", response_model=ElectricalLineOut)
def patch_line_thresholds(
    line_id: int,
    payload: LineThresholdsUpdate,
    db: Session = Depends(get_db),
):
    line = db.query(ElectricalLine).filter(ElectricalLine.id == line_id).first()
    if not line:
        raise HTTPException(status_code=404, detail="лінію не знайдено")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(line, k, v)
    db.commit()
    db.refresh(line)
    return line
