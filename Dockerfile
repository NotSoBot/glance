FROM python:3.7-alpine

WORKDIR /glance

# Add glance to the image

ADD . .

# Dependencies

RUN apk add --no-cache --virtual .build-deps make gcc musl-dev \
    && pip install --no-cache-dir -r requirements.txt \
    && rm requirements.txt \
    && apk del .build-deps

CMD [ "python", "app.py" ]