from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.database_migrations import run_migrations
from app.routers import auth, automations, cash_closings, expenses, fines, health, payments, projects, report_archive, report_imports, report_save, sales, telegram, users
from app.services.finance import seed_database
from app.services.storage import ensure_bucket
from app.services.closing_scheduler import closing_scheduler_loop


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
    scheduler_task = asyncio.create_task(closing_scheduler_loop())
    try:
        yield
    finally:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass


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
app.include_router(cash_closings.router)
app.include_router(report_imports.router)
app.include_router(report_archive.router)
app.include_router(report_save.router)
app.include_router(telegram.router)
app.include_router(automations.router)


@app.get("/")
async def root():
    return {"message": "Arpadesk API", "docs": "/docs"}
