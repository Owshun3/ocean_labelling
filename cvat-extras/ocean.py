from cvat.settings.production import *  # noqa: F401, F403
import os as _os

_csrf_env = _os.environ.get('CSRF_TRUSTED_ORIGINS', '')
CSRF_TRUSTED_ORIGINS = [o.strip() for o in _csrf_env.split(',') if o.strip()]

# Mode HTTPS (active via env var OCEAN_HTTPS=1).
# Sans ces 3 settings derriere un reverse proxy HTTPS :
#  - les cookies sessionid / csrftoken ne portent pas le flag Secure
#  - Django croit recevoir du HTTP plain (NGINX termine TLS et proxifie en
#    HTTP interne) et peut emettre une boucle de redirection HTTPS infinie.
if _os.environ.get('OCEAN_HTTPS', '').lower() in ('1', 'true', 'yes'):
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
