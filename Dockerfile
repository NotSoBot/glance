FROM python:3.7-alpine

WORKDIR /glance

# Add glance to the image

ADD . .

# Dependencies

RUN pip install --no-cache-dir -r requirements.txt \
    && rm requirements.txt

CMD [ "python", "app.py" ]