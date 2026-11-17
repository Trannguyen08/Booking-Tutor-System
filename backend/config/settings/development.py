from .base import *
import dj_database_url
from decouple import config

DEBUG = True

DATABASES = {"default": dj_database_url.config(default=config("DATABASE_URL"))}

INSTALLED_APPS += ["debug_toolbar"]
MIDDLEWARE += ["debug_toolbar.middleware.DebugToolbarMiddleware"]
INTERNAL_IPS = ["127.0.0.1"]

# Relax anon/user daily throttle limits in local development so shared Docker NAT IPs don't lock out testing.
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    "DEFAULT_THROTTLE_RATES": {
        **REST_FRAMEWORK.get("DEFAULT_THROTTLE_RATES", {}),
        "anon": "2000/day",
        "user": "10000/day",
    },
}
