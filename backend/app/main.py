from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.database_migrations import run_migrations
from app.routers import auth, expenses, fines, health, payments, projects, report_imports, sales, telegram, users
from app.services.finance import seed_database
from app.services.storage import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_migrations()
    ensure_bucket()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title="Arpadesk API",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(projects.router)
app.include_router(sales.router)
app.include_router(expenses.router)
app.include_router(payments.router)
app.include_router(fines.router)
app.include_router(report_imports.router)
app.include_router(telegram.router)


@app.get("/")
async def root():
    return {"message": "Arpadesk API", "docs": "/docs"}
