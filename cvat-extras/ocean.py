from cvat.settings.production import *  # noqa: F401, F403
import os as _os

_csrf_env = _os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_env.split(',') if o.strip()]
