FROM python:3.7-alpine

WORKDIR /glance

# Build Dependencies

RUN apk add --no-cache --virtual .build-deps make gcc musl-dev

# Python Dependencies

ADD requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt \
    && rm requirements.txt \
    && apk del .build-deps

# Add glance to the image

ADD . .

CMD [ "python", "app.py" ]