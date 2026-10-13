from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import CORS_ORIGINS, RUN_MIGRATIONS
from app.db import engine
from app.routers import auth, health, translations
from migrations.runner import run_migrations


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if RUN_MIGRATIONS:
        run_migrations(engine)
    yield


app = FastAPI(title="Signtext API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": "validation_failed"})


app.include_router(health.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(translations.router, prefix="/api")
