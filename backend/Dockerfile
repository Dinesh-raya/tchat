FROM node:18-alpine

WORKDIR /app

COPY package.json yarn.lock* ./

RUN yarn install --production

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
