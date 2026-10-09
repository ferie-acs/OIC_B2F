# Bourse de Fret (B2F) — preuve de concept.
#
# Aucune etape de compilation : le POC est 100 % statique et ses dependances
# sont servies localement (ecart E1 du plan de suivi). L'image ne fait que
# servir des fichiers.
#
#   docker build -t b2f .
#   docker run --rm -p 8081:8081 b2f
#
# Le port 8081 n'est pas un detail : le POC DUT occupe le 8080, et deux
# applications servies sur la meme origine partagent le meme LocalStorage.
# Avec le prefixe `b2f_`, c'est la seconde barriere du risque R5.
#
# Le port d'ecoute est pilote par la variable PORT et vaut 8081 par defaut.
# Railway injecte PORT a l'execution sans le connaitre a l'avance : une
# directive `listen` figee ferait echouer le controle de sante de la
# plateforme. Le POC DUT resout le meme probleme avec `${PORT:-8080}`.
#
# Image non privilegiee : le processus maitre tourne sous l'UID 101, pas root.

FROM nginxinc/nginx-unprivileged:1.31-alpine

# Le port d'ecoute par defaut de la demonstration locale.
ENV PORT=8081

# L'entree de l'image substitue les variables des gabarits de
# /etc/nginx/templates. Sans filtre, `envsubst` devorerait aussi les
# variables de nginx lui-meme ($uri, $host...) : on restreint a PORT.
ENV NGINX_ENVSUBST_FILTER="PORT"

USER root
RUN rm -f /etc/nginx/conf.d/default.conf
USER 101

# Les en-tetes de securite sont isoles dans un fragment inclus par chaque bloc
# `location`. C'est une precaution, pas une coquetterie : dans nginx, un bloc
# enfant qui declare un seul `add_header` annule TOUS ceux herites du parent.
# Une source unique, incluse partout, supprime ce piege.
COPY <<'HEADERS' /etc/nginx/b2f-securite.conf
# Le POC ne charge aucune ressource distante : ni CDN, ni police, ni appel
# reseau (ecart E1, decision D3). La politique peut donc etre stricte, sans
# `'unsafe-inline'`. `data:` reste autorise pour les images : `css/forms.css`
# embarque un chevron SVG de cette facon.
add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org; font-src 'self'; connect-src 'self' https://tile.openstreetmap.org https://router.project-osrm.org; worker-src 'self' blob:; child-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "no-referrer" always;
add_header Cross-Origin-Opener-Policy "same-origin" always;
add_header Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=()" always;
# Les jeux de demonstration changent a chaque livraison : pas de cache long.
# L'ETag suffit a economiser la bande passante par des reponses 304.
add_header Cache-Control "no-cache, must-revalidate" always;
HEADERS

COPY <<'CONF' /etc/nginx/templates/b2f.conf.template
server {
  listen ${PORT};
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # Les modules ES exigent le bon type MIME.
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  # Ne pas annoncer la version exacte du serveur.
  server_tokens off;

  gzip on;
  gzip_types text/css application/javascript image/svg+xml application/json;
  gzip_min_length 1024;

  # Application a page unique : le routage se fait par fragment d'URL,
  # mais un rechargement direct doit retomber sur index.html.
  location / {
    include /etc/nginx/b2f-securite.conf;
    try_files $uri $uri/ /index.html;
  }

  # Cette location ne porte pas de `try_files` : un fichier .js absent doit
  # renvoyer un 404 franc, jamais du HTML sous un type MIME de script — ce
  # qui produirait une erreur de module ES illisible.
  location ~* \.(js|css|html)$ {
    include /etc/nginx/b2f-securite.conf;
  }

  # Sonde de disponibilite : sans corps, sans journal, sans dependance au
  # contenu servi. C'est la cible du controle de sante de la plateforme.
  location = /healthz {
    access_log off;
    add_header Content-Type text/plain always;
    return 200 "ok\n";
  }
}
CONF

COPY index.html comprendre.html /usr/share/nginx/html/
COPY css/    /usr/share/nginx/html/css/
COPY js/     /usr/share/nginx/html/js/
# Sans assets/, les illustrations de l'accueil repondent 404 en ligne.
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-8081}/healthz" >/dev/null || exit 1
